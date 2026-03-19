"""
RAG Client - Calls external RAG API (chat-by-category) for document-grounded answers.

API: POST {RAG_API_URL}/chat-by-category/
Body: application/x-www-form-urlencoded
  - category (string): LLMs | Prompt Engineering | RAG | AI API Integration | AI Agents
  - query (string)
  - limit (int, optional): default 5
  - alpha (float, optional): default 0.5

RAG_API_URL:
  - Windows host: http://localhost:8000
  - Docker: http://app:8000 (use your RAG container service name)
"""

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("growwise")

# Base URL of RAG service (runs on 8000; Grow Wise runs on 8001)
RAG_API_URL = os.getenv("RAG_API_URL", "http://localhost:8000").rstrip("/")
RAG_TIMEOUT = float(os.getenv("RAG_TIMEOUT", "120"))

# ---------------------------------------------------------------------------
# Exact categories for RAG API — pass these exactly
# ---------------------------------------------------------------------------
RAG_CATEGORIES = ("LLMs", "Prompt Engineering", "RAG", "AI API Integration", "AI Agents")

# Map Grow Wise track_name (case-insensitive) → exact RAG API category
TRACK_TO_RAG_CATEGORY = {
    "llms": "LLMs",
    "large language models (llms)": "LLMs",
    "large language models": "LLMs",
    "prompt engineering": "Prompt Engineering",
    "rag": "RAG",
    "rag (retrieval augmented generation)": "RAG",
    "retrieval augmented generation": "RAG",
    "ai api integration": "AI API Integration",
    "ai agents": "AI Agents",
}


def track_name_to_rag_category(track_name: str) -> Optional[str]:
    """
    Map a Grow Wise track name to the RAG API category.
    Returns None if the track is not supported by the external RAG service.
    """
    if not track_name or not isinstance(track_name, str):
        return None
    key = track_name.strip().lower()
    # Exact match
    if key in TRACK_TO_RAG_CATEGORY:
        return TRACK_TO_RAG_CATEGORY[key]
    # Fuzzy: match by substring for common variations
    if "llm" in key or "large language" in key:
        return "LLMs"
    if "prompt" in key and "engineering" in key:
        return "Prompt Engineering"
    if key == "rag" or "retrieval augmented" in key:
        return "RAG"
    if "ai api" in key or "api integration" in key:
        return "AI API Integration"
    if "ai agent" in key:
        return "AI Agents"
    return None


async def chat_by_category(
    category: str,
    query: str,
    limit: int = 5,
    alpha: float = 0.5,
) -> Optional[str]:
    """
    Call the external RAG API: POST /chat-by-category/

    Args:
        category: One of LLMs, Prompt Engineering, RAG, AI API Integration, AI Agents
        query: User's question
        limit: Optional, default 5 (retrieval limit)
        alpha: Optional, default 0.5 (hybrid keyword+vector balance)

    Returns:
        The answer string, or None if the request failed or no documents exist.
    """
    url = f"{RAG_API_URL}/chat-by-category/"
    payload = {
        "category": category,
        "query": query,
        "limit": limit,
        "alpha": alpha,
    }
    log.info("RAG API: POST %s category=%s query=%s", url, category, query[:50] + "..." if len(query) > 50 else query)
    try:
        async with httpx.AsyncClient(timeout=RAG_TIMEOUT) as client:
            resp = await client.post(url, data=payload)
            log.info("RAG API: %s %s", resp.status_code, url)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            return data.get("answer", "")
    except Exception as exc:
        log.warning("RAG API error: %s", exc)
        return None
