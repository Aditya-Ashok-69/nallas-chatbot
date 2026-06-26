# Nallas AI — Document Intelligence RAG Chatbot

A production-ready Retrieval-Augmented Generation (RAG) chatbot that lets you upload company documents and ask natural language questions about their contents.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  UploadPanel → DocumentList → ChatWindow → MessageBubble│
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/SSE
┌───────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend                        │
│  /upload  /chat  /chat/stream  /documents  /document    │
└────┬──────────────┬──────────────┬──────────────────────┘
     │              │              │
┌────▼────┐   ┌─────▼──────┐  ┌──▼──────────────┐
│ Parser  │   │  Retriever │  │   Groq LLM       │
│ PyMuPDF │   │ Vector +   │  │  Llama 3.3 70B   │
│ python- │   │ BM25 +     │  └─────────────────┘
│  docx   │   │ Reranker   │
└────┬────┘   └─────┬──────┘
     │              │
┌────▼────┐   ┌─────▼──────┐
│ Chunker │   │  ChromaDB  │
│ LangChain│  │ (vectors)  │
└─────────┘   └────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Axios |
| Backend | FastAPI, Python 3.11+ |
| Embeddings | `BAAI/bge-small-en-v1.5` via Sentence Transformers |
| Vector DB | ChromaDB (persistent) |
| LLM | Groq API — Llama 3.3 70B |
| Document parsing | PyMuPDF, python-docx |
| Hybrid Search | BM25 + Vector similarity (RRF merge) |
| Reranking | cross-encoder/ms-marco-MiniLM-L-6-v2 |

---

## Project Structure

```
nallas-rag/
├── backend/
│   ├── app.py                  # FastAPI application
│   ├── services/
│   │   ├── parser.py           # PDF/DOCX/TXT extraction
│   │   ├── chunker.py          # RecursiveCharacterTextSplitter
│   │   ├── embeddings.py       # Singleton embedding model
│   │   ├── vectorstore.py      # ChromaDB singleton
│   │   ├── retriever.py        # Hybrid search + reranking
│   │   └── llm.py              # Groq API (sync + streaming)
│   ├── uploads/                # Uploaded document storage
│   ├── vectordb/               # ChromaDB persistent data
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx  # Main chat UI + streaming
│   │   │   ├── MessageBubble.jsx # User/bot message cards
│   │   │   ├── UploadPanel.jsx # Drag-and-drop uploader
│   │   │   └── DocumentList.jsx # Document management
│   │   ├── pages/
│   │   │   └── Home.jsx        # Main layout
│   │   ├── services/
│   │   │   └── api.js          # API service layer
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   │   └── favicon.svg
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── .env.example
│
└── README.md
```

---

## Installation & Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Groq API key (free at [console.groq.com](https://console.groq.com))

---

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Linux/Mac)
source venv/bin/activate
# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
```

**Edit `backend/.env`:**
```env
GROQ_API_KEY=your_groq_api_key_here
CHROMA_DB_PATH=./vectordb
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
GROQ_MODEL=llama-3.3-70b-versatile
UPLOAD_DIR=./uploads
```

**Start the backend:**
```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at `http://localhost:8000`.  
API docs: `http://localhost:8000/docs`

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Default: VITE_API_URL=http://localhost:8000

# Start development server
npm run dev
```

Frontend will be at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload one or more files |
| `POST` | `/chat` | Ask a question (full response) |
| `POST` | `/chat/stream` | Ask a question (streaming SSE) |
| `GET` | `/documents` | List all documents |
| `DELETE` | `/document/{id}` | Delete document + embeddings |

---

## RAG Pipeline

### Ingestion Flow
```
File Upload → Text Extraction → Chunking → Embedding → ChromaDB Storage
             (PyMuPDF/docx)   (1000/200)  (BGE model)   (persistent)
```

### Query Flow
```
User Question → Embed Question → Hybrid Search → Rerank → LLM Prompt → Answer
                (BGE model)    (Vector + BM25)  (Cross-  (Groq/Llama)  + Sources
                                                 encoder)
```

### Hybrid Search
Uses **Reciprocal Rank Fusion (RRF)** to merge vector similarity and BM25 keyword search results, then optionally reranks with a cross-encoder model for improved precision.

---

## Features

- **Multi-format support**: PDF, DOCX, TXT
- **Drag-and-drop upload** with progress tracking
- **Streaming responses** via Server-Sent Events
- **Source citations** showing filename and page number
- **Conversation history** (last 6 messages as context)
- **Hybrid search** (vector + BM25 + reranking)
- **Dark mode** support
- **Responsive design**
- **Delete documents** (removes file + embeddings)
- **Real-time status** for document processing

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | — | Required. Your Groq API key |
| `CHROMA_DB_PATH` | `./vectordb` | ChromaDB storage path |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | HuggingFace embedding model |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model to use |
| `UPLOAD_DIR` | `./uploads` | File upload directory |

---

## Production Deployment

### Backend
```bash
gunicorn app:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend
```bash
npm run build
# Serve dist/ with nginx or any static file server
```

---

## Troubleshooting

**Embedding model slow to load on first start?**  
Normal — the BGE model downloads (~130MB) on first use and is then cached.

**"I could not find this information" responses?**  
Check that documents are in "Ready" status in the sidebar. Processing may take 10-30 seconds after upload.

**Groq rate limits?**  
The free tier has generous limits. If exceeded, the error message will appear in the chat.

**ChromaDB errors?**  
Delete the `vectordb/` directory and restart to reset. All embeddings will be regenerated on re-upload.

---

## License

© Nallas Corporation. All rights reserved.
