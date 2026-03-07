"""
Learning Summary Generator
--------------------------
Given content consumed (completed items) and stages, generate a 2-4 paragraph
summary of what the user has learned.

Public interface:

    from app.ai_services.learning_summary_generator import generate_learning_summary

    summary = await generate_learning_summary(
        track_name="RAG",
        stages=[{"stage_name": "...", "focus_area": "..."}],
        content_consumed=[{"title": "...", "description": "...", "stage_name": "..."}],
    )

Returns: 2-4 paragraph summary string
"""

import os
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"


def _build_stages_block(stages: List[Dict]) -> str:
    """Format stages for the prompt."""
    lines = []
    for i, s in enumerate(stages, start=1):
        lines.append(f"Stage {i}: {s.get('stage_name', '')}")
        lines.append(f"  Focus: {s.get('focus_area', '')[:300]}")
    return "\n".join(lines) if lines else "No stages"


def _build_content_block(content_consumed: List[Dict]) -> str:
    """Format content consumed for the prompt."""
    lines = []
    for i, c in enumerate(content_consumed, start=1):
        title = c.get("title", "")[:200]
        desc = (c.get("description", "") or "")[:300]
        stage = c.get("stage_name", "")
        lines.append(f"{i}. [{stage}] {title}")
        if desc:
            lines.append(f"   {desc}")
    return "\n".join(lines) if lines else "No content"


_PROMPT_TEMPLATE = """You are an expert learning analyst. Based on the content a learner has completed, write a concise summary of the knowledge and skills they have acquired.

===== CONTEXT =====
Track: {track_name}

===== STAGES COMPLETED =====
{stages_block}

===== CONTENT CONSUMED =====
{content_block}

===== YOUR TASK =====
Write a 2-4 paragraph summary that:
1. Describes the key concepts and skills the learner has covered
2. Highlights the main learning areas (by stage)
3. Summarizes the practical knowledge gained from the resources they completed
4. Is written in second person ("You have learned...")

Return ONLY the summary text — no headings, no bullet points, no JSON. Plain paragraphs."""


async def generate_learning_summary(
    track_name: str,
    stages: List[Dict[str, Any]],
    content_consumed: List[Dict[str, Any]],
) -> str:
    """
    Generate a 2-4 paragraph summary of what the user has learned.

    Args:
        track_name: Name of the learning track
        stages: List of {stage_name, focus_area}
        content_consumed: List of {title, description, content_text?, stage_name, completed_at?}

    Returns:
        2-4 paragraph summary string
    """
    if USE_MOCK_AI:
        return _mock_summary(track_name, stages, content_consumed)

    return await _ai_summary(track_name, stages, content_consumed)


async def _ai_summary(
    track_name: str,
    stages: List[Dict],
    content_consumed: List[Dict],
) -> str:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_summary(track_name, stages, content_consumed)

    stages_block = _build_stages_block(stages)
    content_block = _build_content_block(content_consumed)

    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        stages_block=stages_block,
        content_block=content_block,
    )
    messages = [
        {
            "role": "system",
            "content": "You are a learning analyst. Reply with plain text only — no markdown, no JSON.",
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.4, timeout=60.0)
        summary = raw.strip()
        if len(summary) > 50:
            return summary
    except Exception:
        pass

    return _mock_summary(track_name, stages, content_consumed)


def _mock_summary(
    track_name: str,
    stages: List[Dict],
    content_consumed: List[Dict],
) -> str:
    """Build a template summary from stage names and content titles."""
    stage_names = [s.get("stage_name", "") for s in stages if s.get("stage_name")]
    content_titles = [c.get("title", "") for c in content_consumed[:10] if c.get("title")]

    para1 = (
        f"You have completed the {track_name} learning path, covering {len(stage_names)} stages: "
        + ", ".join(stage_names[:5])
        + ("." if len(stage_names) <= 5 else ", and more.")
    )

    para2 = (
        f"Across these stages, you engaged with {len(content_consumed)} learning resources, "
        "including articles, tutorials, documentation, and exercises. "
        "You have built foundational knowledge in the key concepts and practical applications."
    )

    para3 = (
        "Your learning journey has equipped you with the skills to understand "
        f"core {track_name} concepts, apply them in practice, and recognize "
        "how they relate to real-world scenarios."
    )

    return "\n\n".join([para1, para2, para3])
