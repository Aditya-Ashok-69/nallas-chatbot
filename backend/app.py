"""
Nallas RAG Chatbot - FastAPI Backend
Production-ready RAG chatbot with ChromaDB, LangChain, and Groq
"""

import os
import uuid
import json
import asyncio
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

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
    print("🚀 Initializing Nallas RAG Chatbot...")
    # Pre-load embedding model to cache it
    get_embedding_model()
    # Initialize vectorstore connection
    get_vectorstore()
    print("✅ Services initialized successfully")
    yield
    print("👋 Shutting down...")


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
        print(f"📄 Processing: {filename}")

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
        print(f"✅ Processed {filename}: {len(chunks)} chunks stored")

    except Exception as e:
        print(f"❌ Error processing {filename}: {e}")
        if doc_id in registry:
            registry[doc_id]["status"] = "error"
            registry[doc_id]["error"] = str(e)
            save_registry(registry)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Answer a question using RAG pipeline."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        # Step 1 & 2: Retrieve relevant chunks (hybrid search)
        chunks = hybrid_retrieve(request.question, top_k=5)

        if not chunks:
            return ChatResponse(
                answer="I could not find this information in the uploaded documents.",
                sources=[]
            )

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

        return ChatResponse(answer=answer, sources=sources)

    except Exception as e:
        print(f"❌ Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    chunks = hybrid_retrieve(request.question, top_k=5)

    if not chunks:
        async def no_results():
            data = json.dumps({
                "type": "answer",
                "content": "I could not find this information in the uploaded documents.",
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
        async for token in stream_answer(
            question=request.question,
            context=context,
            conversation_history=conversation_history
        ):
            data = json.dumps({"type": "token", "content": token})
            yield f"data: {data}\n\n"

        # Send sources at end
        data = json.dumps({"type": "sources", "sources": sources})
        yield f"data: {data}\n\n"
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
