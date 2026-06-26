"""
Embeddings Service
Singleton embedding model using BAAI/bge-small-en-v1.5.
Cached to avoid reloading on every request.
"""

import os
from functools import lru_cache
from langchain_community.embeddings import HuggingFaceEmbeddings

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

# Singleton instance
_embedding_model = None


def get_embedding_model() -> HuggingFaceEmbeddings:
    """
    Return cached embedding model (singleton pattern).
    Loads model once and reuses across all requests.
    """
    global _embedding_model
    
    if _embedding_model is None:
        print(f"🔄 Loading embedding model: {EMBEDDING_MODEL}")
        _embedding_model = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={
                "normalize_embeddings": True,  # Required for BGE models
                "batch_size": 32,
            }
        )
        print(f"✅ Embedding model loaded: {EMBEDDING_MODEL}")
    
    return _embedding_model
