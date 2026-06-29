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


# ─── BM25 Index Cache ─────────────────────────────────────────────────────────
# Holds the built index so it is not rebuilt on every query.
# Invalidated when the document count in ChromaDB changes (upload or delete).

_bm25_cache: Optional[BM25Okapi] = None   # the built index
_bm25_documents: List[str] = []           # parallel corpus texts
_bm25_metadatas: List[dict] = []          # parallel corpus metadatas
_bm25_doc_count: int = -1                 # count at build time; -1 = never built


def _get_bm25_index() -> Optional[tuple]:
    """
    Return (bm25, documents, metadatas) from cache, rebuilding only when the
    ChromaDB document count has changed since the last build.

    Returns None if BM25 is unavailable or the collection is empty.
    """
    global _bm25_cache, _bm25_documents, _bm25_metadatas, _bm25_doc_count

    if not BM25_AVAILABLE:
        return None

    vs = get_vectorstore()
    collection = vs._collection

    current_count = collection.count()

    if current_count == 0:
        # Nothing indexed yet — clear any stale cache and bail out.
        _bm25_cache = None
        _bm25_doc_count = 0
        return None

    if _bm25_cache is not None and current_count == _bm25_doc_count:
        # Cache is still valid — return immediately without hitting ChromaDB.
        return _bm25_cache, _bm25_documents, _bm25_metadatas

    # Cache is stale (first build, or docs were added/deleted) — rebuild.
    print(f"🔄 BM25 index stale (was {_bm25_doc_count}, now {current_count}). Rebuilding…")
    try:
        all_docs = collection.get(include=["documents", "metadatas"])
        documents = all_docs["documents"]
        metadatas = all_docs["metadatas"]

        tokenized_corpus = [doc.lower().split() for doc in documents]
        bm25 = BM25Okapi(tokenized_corpus)

        _bm25_cache = bm25
        _bm25_documents = documents
        _bm25_metadatas = metadatas
        _bm25_doc_count = current_count

        print(f"✅ BM25 index built ({current_count} chunks)")
        return _bm25_cache, _bm25_documents, _bm25_metadatas

    except Exception as e:
        print(f"⚠️ BM25 index build failed: {e}")
        return None


def invalidate_bm25_cache():
    """
    Explicitly drop the BM25 cache.

    Call this from upload / delete endpoints if you want immediate
    invalidation rather than waiting for the count-based check.
    The count-based check in _get_bm25_index() is the safety net,
    so calling this is optional but makes the cache update synchronous.
    """
    global _bm25_cache, _bm25_doc_count
    _bm25_cache = None
    _bm25_doc_count = -1


# ─── Reranker ─────────────────────────────────────────────────────────────────

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


# ─── Retrieval Functions ───────────────────────────────────────────────────────

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
    BM25 keyword-based retrieval using the cached index.
    The index is only rebuilt when the ChromaDB document count changes.
    """
    cached = _get_bm25_index()
    if cached is None:
        return []

    bm25, documents, metadatas = cached

    try:
        tokenized_query = query.lower().split()
        scores = bm25.get_scores(tokenized_query)

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
    vector_results = vector_retrieve(query, top_k=top_k)
    bm25_results = bm25_retrieve(query, top_k=top_k) if BM25_AVAILABLE else []

    if not bm25_results:
        results = vector_results
    else:
        results = _rrf_merge(vector_results, bm25_results, top_k=top_k)

    if RERANKER_AVAILABLE and results:
        results = _rerank(query, results)

    return results[:top_k]


def retrieve_chunks(query: str, top_k: int = 5) -> List[Dict]:
    """Alias for hybrid_retrieve for backward compatibility."""
    return hybrid_retrieve(query, top_k)


# ─── Internal Helpers ─────────────────────────────────────────────────────────

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
        key = doc["text"][:100]
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        all_docs[key] = doc

    for rank, doc in enumerate(list2):
        key = doc["text"][:100]
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        all_docs[key] = doc

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