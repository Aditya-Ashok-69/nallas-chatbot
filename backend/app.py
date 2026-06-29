"""
Nallas RAG Chatbot - FastAPI Backend
Production-ready RAG chatbot with ChromaDB, LangChain, and Groq
"""

import os
import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

# ─── Logging Setup ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("nallas.app")

# Chat query log — one JSON line per query, appended forever
CHAT_LOG_PATH = Path(os.getenv("CHAT_LOG_PATH", "./logs/chat_queries.jsonl"))
CHAT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def log_query(
    question: str,
    answer: str,
    sources: list,
    status: str,          # "ok" | "no_results" | "error"
    error: str = None,
    duration_ms: int = None,
):
    """
    Append one structured log entry per query to chat_queries.jsonl.
    Each line is valid JSON — easy to grep, tail, or load into pandas.
    """
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "question": question,
        "answer": answer,
        "sources": sources,
    }
    if duration_ms is not None:
        entry["duration_ms"] = duration_ms
    if error:
        entry["error"] = error

    with open(CHAT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

load_dotenv()

# Import services
from services.parser import extract_text
from services.chunker import chunk_text
from services.embeddings import get_embedding_model
from services.vectorstore import get_vectorstore, delete_document_embeddings
from services.retriever import retrieve_chunks, hybrid_retrieve
from services.llm import stream_answer, get_answer

# Configuration
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}

# In-memory document registry (persisted to JSON)
DOCS_REGISTRY_PATH = Path("./docs_registry.json")


def load_registry() -> dict:
    if DOCS_REGISTRY_PATH.exists():
        with open(DOCS_REGISTRY_PATH, "r") as f:
            return json.load(f)
    return {}


def save_registry(registry: dict):
    with open(DOCS_REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    logger.info("Initializing Nallas RAG Chatbot...")
    # Pre-load embedding model to cache it
    get_embedding_model()
    # Initialize vectorstore connection
    get_vectorstore()
    logger.info("Services initialized successfully")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Nallas RAG Chatbot API",
    description="Production-ready RAG chatbot for company document Q&A",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    conversation_history: Optional[List[ChatMessage]] = []
    stream: Optional[bool] = False


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]


class DocumentInfo(BaseModel):
    id: str
    filename: str
    size: int
    status: str
    chunks: int


# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Nallas RAG Chatbot",
        "version": "1.0.0"
    }


@app.post("/upload")
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """Upload one or more documents for ingestion."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    registry = load_registry()
    results = []

    for file in files:
        # Validate file extension
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": f"Unsupported file type: {ext}. Allowed: PDF, DOCX, TXT"
            })
            continue

        # Generate document ID
        doc_id = str(uuid.uuid4())
        save_path = UPLOAD_DIR / f"{doc_id}{ext}"

        try:
            # Save file to disk
            content = await file.read()
            if len(content) == 0:
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "error": "File is empty"
                })
                continue

            # ── File size limit: 10 MB ────────────────────────────────────
            MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "10")) * 1024 * 1024
            if len(content) > MAX_FILE_SIZE:
                size_mb = len(content) / (1024 * 1024)
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "error": f"File too large ({size_mb:.1f} MB). Maximum allowed size is {MAX_FILE_SIZE // (1024*1024)} MB."
                })
                logger.warning(f"Rejected oversized upload: {file.filename} ({size_mb:.1f} MB)")
                continue

            with open(save_path, "wb") as f:
                f.write(content)

            # Register document as processing
            registry[doc_id] = {
                "id": doc_id,
                "filename": file.filename,
                "filepath": str(save_path),
                "size": len(content),
                "status": "processing",
                "chunks": 0
            }
            save_registry(registry)

            # Process document in background
            background_tasks.add_task(
                process_document,
                doc_id=doc_id,
                filepath=str(save_path),
                filename=file.filename
            )

            results.append({
                "id": doc_id,
                "filename": file.filename,
                "status": "processing",
                "size": len(content)
            })

        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": str(e)
            })

    save_registry(registry)
    return {"uploaded": results}


async def process_document(doc_id: str, filepath: str, filename: str):
    """Background task: parse → chunk → embed → store."""
    registry = load_registry()

    try:
        logger.info(f"Processing document: {filename}")

        # Step 1: Extract text
        pages = extract_text(filepath)
        if not pages:
            raise ValueError("No text could be extracted from document")

        # Step 2: Chunk text
        chunks = chunk_text(pages, filename)
        if not chunks:
            raise ValueError("No chunks generated from document")

        # Step 3 & 4: Embed and store in ChromaDB
        vs = get_vectorstore()
        
        # Add documents in batches for performance
        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            texts = [c["text"] for c in batch]
            metadatas = [c["metadata"] for c in batch]
            ids = [f"{doc_id}_{c['metadata']['chunk_id']}" for c in batch]
            vs.add_texts(texts=texts, metadatas=metadatas, ids=ids)

        # Update registry
        registry[doc_id]["status"] = "ready"
        registry[doc_id]["chunks"] = len(chunks)
        save_registry(registry)
        logger.info(f"Processed '{filename}': {len(chunks)} chunks stored")

    except Exception as e:
        logger.error(f"Error processing '{filename}': {e}", exc_info=True)
        if doc_id in registry:
            registry[doc_id]["status"] = "error"
            registry[doc_id]["error"] = str(e)
            save_registry(registry)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Answer a question using RAG pipeline."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    import time
    t_start = time.perf_counter()

    try:
        # Step 1 & 2: Retrieve relevant chunks (hybrid search)
        chunks = hybrid_retrieve(request.question, top_k=5)

        if not chunks:
            # ── No results — log and return fallback ─────────────────────
            fallback = "I could not find this information in the uploaded documents."
            duration_ms = int((time.perf_counter() - t_start) * 1000)

            logger.warning(f"NO_RESULTS | question='{request.question[:120]}'")
            log_query(
                question=request.question,
                answer=fallback,
                sources=[],
                status="no_results",
                duration_ms=duration_ms,
            )
            return ChatResponse(answer=fallback, sources=[])

        # Step 3: Build context
        context = "\n\n".join([c["text"] for c in chunks])

        # Step 4 & 5 & 6: Get answer from LLM
        conversation_history = [
            {"role": m.role, "content": m.content}
            for m in (request.conversation_history or [])
        ]

        answer = await get_answer(
            question=request.question,
            context=context,
            conversation_history=conversation_history
        )

        # Build source citations (deduplicated)
        seen = set()
        sources = []
        for chunk in chunks:
            key = (chunk["metadata"].get("filename", ""), chunk["metadata"].get("page_number", 0))
            if key not in seen:
                seen.add(key)
                sources.append({
                    "filename": chunk["metadata"].get("filename", "Unknown"),
                    "page_number": chunk["metadata"].get("page_number", 0)
                })

        duration_ms = int((time.perf_counter() - t_start) * 1000)

        # ── Successful query log ──────────────────────────────────────────
        logger.info(f"OK | {duration_ms}ms | chunks={len(chunks)} sources={len(sources)} | question='{request.question[:120]}'")
        log_query(
            question=request.question,
            answer=answer,
            sources=sources,
            status="ok",
            duration_ms=duration_ms,
        )

        return ChatResponse(answer=answer, sources=sources)

    except Exception as e:
        duration_ms = int((time.perf_counter() - t_start) * 1000)
        error_msg = str(e)

        # ── Error query log ───────────────────────────────────────────────
        logger.error(f"ERROR | {duration_ms}ms | question='{request.question[:120]}' | error='{error_msg}'", exc_info=True)
        log_query(
            question=request.question,
            answer="An error occurred and no response was generated.",
            sources=[],
            status="error",
            error=error_msg,
            duration_ms=duration_ms,
        )
        raise HTTPException(status_code=500, detail=f"Error generating response: {error_msg}")


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    import time
    t_start = time.perf_counter()

    chunks = hybrid_retrieve(request.question, top_k=5)

    if not chunks:
        fallback = "I could not find this information in the uploaded documents."
        duration_ms = int((time.perf_counter() - t_start) * 1000)

        logger.warning(f"NO_RESULTS (stream) | question='{request.question[:120]}'")
        log_query(
            question=request.question,
            answer=fallback,
            sources=[],
            status="no_results",
            duration_ms=duration_ms,
        )

        async def no_results():
            data = json.dumps({
                "type": "answer",
                "content": fallback,
                "sources": []
            })
            yield f"data: {data}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(no_results(), media_type="text/event-stream")

    context = "\n\n".join([c["text"] for c in chunks])
    conversation_history = [
        {"role": m.role, "content": m.content}
        for m in (request.conversation_history or [])
    ]

    seen = set()
    sources = []
    for chunk in chunks:
        key = (chunk["metadata"].get("filename", ""), chunk["metadata"].get("page_number", 0))
        if key not in seen:
            seen.add(key)
            sources.append({
                "filename": chunk["metadata"].get("filename", "Unknown"),
                "page_number": chunk["metadata"].get("page_number", 0)
            })

    async def generate():
        full_answer = []
        try:
            async for token in stream_answer(
                question=request.question,
                context=context,
                conversation_history=conversation_history
            ):
                full_answer.append(token)
                data = json.dumps({"type": "token", "content": token})
                yield f"data: {data}\n\n"

            # Send sources at end
            data = json.dumps({"type": "sources", "sources": sources})
            yield f"data: {data}\n\n"
            yield "data: [DONE]\n\n"

            # ── Log successful streamed answer ────────────────────────────
            duration_ms = int((time.perf_counter() - t_start) * 1000)
            complete_answer = "".join(full_answer)
            logger.info(f"OK (stream) | {duration_ms}ms | chunks={len(chunks)} | question='{request.question[:120]}'")
            log_query(
                question=request.question,
                answer=complete_answer,
                sources=sources,
                status="ok",
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = int((time.perf_counter() - t_start) * 1000)
            error_msg = str(e)
            logger.error(f"ERROR (stream) | {duration_ms}ms | question='{request.question[:120]}' | error='{error_msg}'", exc_info=True)
            log_query(
                question=request.question,
                answer="".join(full_answer) or "Stream failed before any tokens were generated.",
                sources=sources,
                status="error",
                error=error_msg,
                duration_ms=duration_ms,
            )
            err_data = json.dumps({"type": "error", "content": f"Error: {error_msg}"})
            yield f"data: {err_data}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/documents")
async def list_documents():
    """List all uploaded documents."""
    registry = load_registry()
    return {"documents": list(registry.values())}


@app.delete("/document/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and its embeddings."""
    registry = load_registry()

    if doc_id not in registry:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = registry[doc_id]

    try:
        # Remove file from disk
        filepath = Path(doc.get("filepath", ""))
        if filepath.exists():
            filepath.unlink()

        # Remove embeddings from ChromaDB
        delete_document_embeddings(doc_id)

        # Remove from registry
        del registry[doc_id]
        save_registry(registry)

        return {"success": True, "message": f"Document '{doc['filename']}' deleted"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting document: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
