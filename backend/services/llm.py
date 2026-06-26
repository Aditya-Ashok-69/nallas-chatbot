"""
LLM Service
Groq API integration with Llama 3.3 70B.
Supports both standard and streaming responses.
"""

import os
from typing import List, Dict, AsyncGenerator
from groq import AsyncGroq

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# System prompt template
SYSTEM_PROMPT = """You are a company policy assistant for Nallas Corporation.
Your role is to answer questions ONLY using the provided context from uploaded company documents.

Rules:
1. Answer ONLY from the provided context — do not use external knowledge.
2. If the answer is not in the context, say exactly: "I could not find this information in the uploaded documents."
3. Always be professional, clear, and concise.
4. When relevant, mention which document the information comes from.
5. Do not make up information or extrapolate beyond what is in the context."""


def _build_messages(
    question: str,
    context: str,
    conversation_history: List[Dict]
) -> List[Dict]:
    """Build the messages array for Groq API."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add conversation history (last 6 messages for context window management)
    for msg in conversation_history[-6:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    # Add current question with context
    user_message = f"""Context from uploaded documents:
{context}

Question: {question}

Please answer based solely on the context provided above."""
    
    messages.append({"role": "user", "content": user_message})
    
    return messages


async def get_answer(
    question: str,
    context: str,
    conversation_history: List[Dict] = None
) -> str:
    """
    Get a complete answer from Groq LLM.
    
    Returns:
        str: The LLM response
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in environment variables")
    
    client = AsyncGroq(api_key=GROQ_API_KEY)
    messages = _build_messages(question, context, conversation_history or [])
    
    response = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        max_tokens=1024,
        temperature=0.1,  # Low temperature for factual accuracy
    )
    
    return response.choices[0].message.content


async def stream_answer(
    question: str,
    context: str,
    conversation_history: List[Dict] = None
) -> AsyncGenerator[str, None]:
    """
    Stream answer tokens from Groq LLM.
    
    Yields:
        str: Individual tokens as they arrive
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in environment variables")
    
    client = AsyncGroq(api_key=GROQ_API_KEY)
    messages = _build_messages(question, context, conversation_history or [])
    
    stream = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        max_tokens=1024,
        temperature=0.1,
        stream=True,
    )
    
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            yield token
