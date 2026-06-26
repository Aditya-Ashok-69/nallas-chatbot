"""
Retrieval Service
Hybrid search combining vector similarity + BM25 with cross-encoder reranking.
"""

from typing import List, Dict, Optional
from services.vectorstore import get_vectorstore

# Optional: BM25 and cross-encoder for hybrid search
try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False
    print("⚠️ rank_bm25 not available, using vector search only")

try:
    from sentence_transformers import CrossEncoder
    RERANKER_AVAILABLE = True
    _reranker = None
except ImportError:
    RERANKER_AVAILABLE = False
    print("⚠️ CrossEncoder not available, skipping reranking")


def get_reranker():
    """Singleton cross-encoder reranker."""
    global _reranker
    if RERANKER_AVAILABLE and _reranker is None:
        try:
            _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            print("✅ Cross-encoder reranker loaded")
        except Exception as e:
            print(f"⚠️ Could not load reranker: {e}")
    return _reranker


def vector_retrieve(query: str, top_k: int = 5) -> List[Dict]:
    """
    Retrieve top_k most similar chunks using vector similarity.
    
    Returns:
        List of {"text": str, "metadata": dict, "score": float}
    """
    vs = get_vectorstore()
    
    results = vs.similarity_search_with_score(query, k=top_k)
    
    chunks = []
    for doc, score in results:
        chunks.append({
            "text": doc.page_content,
            "metadata": doc.metadata,
            "score": float(score),
            "source": "vector"
        })
    
    return chunks


def bm25_retrieve(query: str, top_k: int = 5) -> List[Dict]:
    """
    BM25 keyword-based retrieval from ChromaDB stored documents.
    """
    if not BM25_AVAILABLE:
        return []
    
    try:
        vs = get_vectorstore()
        collection = vs._collection
        
        # Get all documents from ChromaDB
        all_docs = collection.get(include=["documents", "metadatas"])
        
        if not all_docs["documents"]:
            return []
        
        documents = all_docs["documents"]
        metadatas = all_docs["metadatas"]
        
        # Tokenize corpus
        tokenized_corpus = [doc.lower().split() for doc in documents]
        bm25 = BM25Okapi(tokenized_corpus)
        
        # Score documents
        tokenized_query = query.lower().split()
        scores = bm25.get_scores(tokenized_query)
        
        # Get top_k indices
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
        
        chunks = []
        for idx in top_indices:
            if scores[idx] > 0:
                chunks.append({
                    "text": documents[idx],
                    "metadata": metadatas[idx],
                    "score": float(scores[idx]),
                    "source": "bm25"
                })
        
        return chunks
    
    except Exception as e:
        print(f"⚠️ BM25 retrieval error: {e}")
        return []


def hybrid_retrieve(query: str, top_k: int = 5) -> List[Dict]:
    """
    Hybrid retrieval: merge vector + BM25 results, then rerank.
    
    Uses Reciprocal Rank Fusion (RRF) to merge ranked lists.
    Optionally applies cross-encoder reranking.
    """
    # Vector search
    vector_results = vector_retrieve(query, top_k=top_k)
    
    # BM25 search
    bm25_results = bm25_retrieve(query, top_k=top_k) if BM25_AVAILABLE else []
    
    if not bm25_results:
        # Fall back to vector only
        results = vector_results
    else:
        # Reciprocal Rank Fusion merge
        results = _rrf_merge(vector_results, bm25_results, top_k=top_k)
    
    # Apply cross-encoder reranking if available
    if RERANKER_AVAILABLE and results:
        results = _rerank(query, results)
    
    return results[:top_k]


def retrieve_chunks(query: str, top_k: int = 5) -> List[Dict]:
    """Alias for hybrid_retrieve for backward compatibility."""
    return hybrid_retrieve(query, top_k)


def _rrf_merge(
    list1: List[Dict],
    list2: List[Dict],
    k: int = 60,
    top_k: int = 5
) -> List[Dict]:
    """
    Reciprocal Rank Fusion to merge two ranked result lists.
    """
    scores = {}
    all_docs = {}
    
    for rank, doc in enumerate(list1):
        key = doc["text"][:100]  # Use first 100 chars as key
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        all_docs[key] = doc
    
    for rank, doc in enumerate(list2):
        key = doc["text"][:100]
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        all_docs[key] = doc
    
    # Sort by RRF score
    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    
    merged = []
    for key in sorted_keys[:top_k]:
        doc = all_docs[key].copy()
        doc["rrf_score"] = scores[key]
        merged.append(doc)
    
    return merged


def _rerank(query: str, chunks: List[Dict]) -> List[Dict]:
    """
    Rerank chunks using cross-encoder model.
    """
    reranker = get_reranker()
    if not reranker:
        return chunks
    
    try:
        pairs = [(query, chunk["text"]) for chunk in chunks]
        scores = reranker.predict(pairs)
        
        for i, chunk in enumerate(chunks):
            chunk["rerank_score"] = float(scores[i])
        
        chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return chunks
    
    except Exception as e:
        print(f"⚠️ Reranking error: {e}")
        return chunks
