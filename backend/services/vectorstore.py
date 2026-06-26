"""
Vector Store Service
ChromaDB singleton with persistent storage.
"""

import os
from pathlib import Path
from langchain_community.vectorstores import Chroma
from services.embeddings import get_embedding_model

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./vectordb")
COLLECTION_NAME = "nallas_documents"

# Singleton instance
_vectorstore = None


def get_vectorstore() -> Chroma:
    """
    Return singleton ChromaDB vectorstore instance.
    Creates persistent storage if it doesn't exist.
    """
    global _vectorstore
    
    if _vectorstore is None:
        Path(CHROMA_DB_PATH).mkdir(parents=True, exist_ok=True)
        
        print(f"🔄 Connecting to ChromaDB at: {CHROMA_DB_PATH}")
        _vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=get_embedding_model(),
            persist_directory=CHROMA_DB_PATH,
        )
        print("✅ ChromaDB connected")
    
    return _vectorstore


def delete_document_embeddings(doc_id: str):
    """
    Delete all embeddings for a specific document.
    Chunks are stored with IDs prefixed by doc_id.
    """
    vs = get_vectorstore()

    try:
        collection = vs._collection

        # Chroma's `where` filter only matches metadata fields, not IDs,
        # and `$exists`/single-condition `$or` aren't valid filter syntax
        # in this chromadb version anyway. Since chunk IDs are stored as
        # "{doc_id}_{chunk_id}", the reliable approach is to fetch all IDs
        # (cheap — no embeddings/documents payload needed) and filter
        # in Python.
        results = collection.get(include=[])  # ids are always returned

        ids_to_delete = [
            id_ for id_ in (results.get("ids") or [])
            if id_.startswith(f"{doc_id}_")
        ]

        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            print(f"🗑️ Deleted {len(ids_to_delete)} embeddings for doc {doc_id}")
        else:
            print(f"⚠️ No embeddings found for doc {doc_id}")

    except Exception as e:
        print(f"❌ Error deleting embeddings: {e}")
        raise
