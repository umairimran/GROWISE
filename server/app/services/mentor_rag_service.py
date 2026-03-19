"""
Mentor RAG Service - DB-based RAG using knowledge_base and stage_content.

Uses only the existing DB schema and APIs:
- knowledge_base (track_id, content, source)
- stage_content (stage_id, title, description, content_text)

Passes user's chosen category (track) for context. Stores all chat in chat_messages.
"""

from typing import List, Optional

from sqlalchemy.orm import Session

from app import models


def get_rag_context_from_db(
    db: Session,
    track_id: int,
    stage_id: int,
    stage_name: str,
    focus_area: str,
    max_chars: int = 12000,
) -> str:
    """
    Build RAG context from knowledge_base (by track) and stage_content (by stage).
    Returns combined context string for LLM prompt.
    """
    parts = []

    # 1. Knowledge base for user's chosen track (category)
    kb_entries = (
        db.query(models.KnowledgeBase)
        .filter(models.KnowledgeBase.track_id == track_id)
        .all()
    )
    if kb_entries:
        parts.append("--- KNOWLEDGE BASE (Track content) ---")
        for kb in kb_entries:
            parts.append(f"[Source: {kb.source}]\n{kb.content}")
        parts.append("")

    # 2. Stage content for current learning stage
    stage_items = (
        db.query(models.StageContent)
        .filter(models.StageContent.stage_id == stage_id)
        .order_by(models.StageContent.order_index)
        .all()
    )
    if stage_items:
        parts.append("--- STAGE CONTENT ---")
        parts.append(f"Stage: {stage_name}")
        parts.append(f"Focus: {focus_area}")
        parts.append("")
        for sc in stage_items:
            block = f"[{sc.content_type}] {sc.title}\n{sc.description}"
            if sc.content_text:
                block += f"\n{sc.content_text}"
            parts.append(block)
        parts.append("")

    context = "\n\n".join(parts).strip()
    if len(context) > max_chars:
        context = context[:max_chars] + "\n\n[... truncated for length ...]"
    return context


async def generate_mentor_response_with_db_rag(
    user_message: str,
    stage_context: str,
    stage_name: str,
    track_id: int,
    track_name: str,
    stage_id: int,
    chat_history: List[dict],
    db: Session,
) -> str:
    """
    Generate mentor response using DB-based RAG (knowledge_base + stage_content)
    and ai_provider. No mock content.
    """
    from app.ai_services.ai_provider import get_provider

    context = get_rag_context_from_db(
        db=db,
        track_id=track_id,
        stage_id=stage_id,
        stage_name=stage_name,
        focus_area=stage_context,
    )

    history_block = ""
    if chat_history:
        lines = []
        for h in chat_history[-6:]:  # last 6 exchanges
            role = "User" if (h.get("sender") or "").lower() == "user" else "Assistant"
            lines.append(f"{role}: {h.get('text', '')}")
        history_block = "\n".join(lines)

    system = f"""You are an AI mentor for the learning track "{track_name}".
Answer based ONLY on the context below. If the context does not contain the answer, say so clearly.
Do not make up information. Be concise and helpful."""

    user_block_parts = []
    if context:
        user_block_parts.append("CONTEXT:\n" + context)
    if history_block:
        user_block_parts.append("RECENT CHAT:\n" + history_block)
    user_block_parts.append(f"USER QUESTION: {user_message}")

    user_content = "\n\n---\n\n".join(user_block_parts)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    try:
        provider = get_provider()
        if not provider.is_configured():
            return _fallback_no_context(track_name, stage_context)
        reply = await provider.chat_complete(messages, temperature=0.5, timeout=60.0)
        return reply.strip() if reply else _fallback_no_context(track_name, stage_context)
    except Exception:
        return _fallback_no_context(track_name, stage_context)


def _fallback_no_context(track_name: str, stage_context: str) -> str:
    """When AI fails or no context: honest fallback (no demo/mock content)."""
    return (
        f"I don't have enough content in the knowledge base for {track_name} yet to answer that. "
        f"This stage focuses on: {stage_context[:200]}... "
        "Please add content to the knowledge base for this track, or try asking about the stage's focus area."
    )
