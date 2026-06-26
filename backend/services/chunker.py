"""
Text Chunking Service
Uses RecursiveCharacterTextSplitter with configurable settings.
"""

from typing import List, Dict
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Chunking configuration
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def chunk_text(pages: List[Dict], filename: str) -> List[Dict]:
    """
    Split extracted pages into overlapping chunks.
    
    Args:
        pages: List of {"text": str, "page": int} dicts
        filename: Original filename for metadata
    
    Returns:
        List of chunk dicts with text and metadata
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    
    chunks = []
    chunk_id = 0
    
    for page in pages:
        page_text = page["text"]
        page_num = page["page"]
        
        # Split page text into chunks
        page_chunks = splitter.split_text(page_text)
        
        for chunk_text_content in page_chunks:
            if chunk_text_content.strip():
                chunks.append({
                    "text": chunk_text_content.strip(),
                    "metadata": {
                        "filename": filename,
                        "page_number": page_num,
                        "chunk_id": chunk_id,
                    }
                })
                chunk_id += 1
    
    return chunks
