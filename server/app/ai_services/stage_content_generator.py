"""
Stage Content Generator
----------------------
Uses Gemini with Google Search grounding to find real learning content
(videos, articles, documentation) from the internet for each stage.

Inputs: stage_name, focus_area, difficulty_level, track_name, content_count
Output: List of content items with real URLs from YouTube, docs, articles, etc.
"""

import json
import logging
import os
import re
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI = os.getenv("USE_MOCK_AI", "true").lower() == "true"
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").strip().lower()

log = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """You are a learning content curator. Use Google Search to find REAL, high-quality learning resources from the internet.

===== CONTEXT =====
Stage name      : {stage_name}
Focus area     : {focus_area}
Track           : {track_name}
Difficulty level: {difficulty_level}

===== YOUR TASK =====
Search the web and find exactly {content_count} learning resources. Include a mix of:
1. VIDEOS (2-3): YouTube tutorials, conference talks, or course videos. Prefer free, popular channels.
2. DOCUMENTATION (2): Official docs, MDN, React docs, Python docs, etc. Must be real documentation URLs.
3. ARTICLES/TUTORIALS (2-3): Medium, Dev.to, freeCodeCamp, Real Python, CSS-Tricks, etc.
4. EXERCISES (1-2): Codecademy, Exercism, LeetCode, or similar practice platforms.

For each resource you MUST provide a REAL URL that you found via search. Do not invent URLs.
Estimate duration in minutes (videos: 10-60, docs: 15-45, articles: 5-20, exercises: 20-60).

===== OUTPUT FORMAT =====
Return ONLY valid JSON, no markdown fences, no extra text:

{{
  "content_items": [
    {{
      "content_type": "video" | "documentation" | "article" | "tutorial" | "exercise",
      "title": "Exact title of the resource",
      "description": "1-2 sentence description of what the learner will get",
      "url": "https://real-url-you-found.com/...",
      "difficulty_level": "beginner" | "intermediate" | "advanced",
      "estimated_duration": 25,
      "source_platform": "YouTube" | "MDN" | "Medium" | "Official Docs" | etc.
    }}
  ]
}}

Search now and return the JSON with real URLs."""


def _normalize_difficulty(level: Optional[str]) -> str:
    """Ensure difficulty is one of beginner, intermediate, advanced."""
    if not level:
        return "intermediate"
    level = str(level).strip().lower()
    if level in ("beginner", "intermediate", "advanced"):
        return level
    if level in ("junior", "entry", "starter"):
        return "beginner"
    if level in ("senior", "expert", "pro"):
        return "advanced"
    return "intermediate"


def _parse_json_from_response(raw: str) -> Optional[List[Dict]]:
    """Extract JSON from model response, handling markdown fences."""
    text = raw.strip()
    # Remove markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    try:
        data = json.loads(text)
        items = data.get("content_items") or data.get("contentItems") or data
        if isinstance(items, list):
            return items
        return None
    except (json.JSONDecodeError, TypeError) as e:
        log.warning("Failed to parse content JSON: %s", e)
        return None


def _validate_and_normalize_item(item: Dict, difficulty_level: str, track_name: str, stage_name: str) -> Optional[Dict]:
    """Validate a content item and ensure required fields."""
    content_type = (item.get("content_type") or item.get("contentType") or "").strip().lower()
    if not content_type:
        return None
    # Map to allowed types
    type_map = {
        "video": "video",
        "doc": "documentation",
        "documentation": "documentation",
        "article": "article",
        "tutorial": "tutorial",
        "exercise": "exercise",
        "practice": "exercise",
    }
    content_type = type_map.get(content_type, "article")

    title = (item.get("title") or "").strip() or f"{stage_name} - Resource"
    description = (item.get("description") or "").strip() or f"Learn about {stage_name}"
    url = (item.get("url") or "").strip()
    if not url or not url.startswith("http"):
        url = None  # Allow null for exercises with content_text

    difficulty = _normalize_difficulty(item.get("difficulty_level") or difficulty_level)
    duration = item.get("estimated_duration")
    if duration is not None:
        try:
            duration = int(duration)
            duration = max(5, min(120, duration))
        except (TypeError, ValueError):
            duration = 20
    else:
        duration = 20

    source = (item.get("source_platform") or item.get("sourcePlatform") or "Web").strip()[:100]
    tags = f"{track_name}, {stage_name}, {difficulty}"

    result = {
        "content_type": content_type,
        "title": title[:500],
        "description": description[:1000],
        "difficulty_level": difficulty,
        "estimated_duration": duration,
        "source_platform": source,
        "tags": tags,
    }
    if url:
        result["url"] = url
    content_text = (item.get("content_text") or item.get("contentText") or "").strip()
    if content_text:
        result["content_text"] = content_text[:5000]
    elif content_type == "exercise":
        result["content_text"] = (
            f"Practice exercise: {description}. "
            f"Apply what you learned from the resources above. "
            f"Document your approach and test your solution."
        )
    return result


async def generate_stage_content_with_search(
    stage_name: str,
    focus_area: str,
    difficulty_level: str,
    track_name: str,
    content_count: int = 8,
) -> List[Dict]:
    """
    Use Gemini with Google Search grounding to find real learning content.

    Returns list of content items with real URLs from the web.
    Falls back to empty list on failure (caller can use mock).
    """
    if USE_MOCK_AI:
        return []

    if AI_PROVIDER != "gemini":
        log.info("Stage content search requires AI_PROVIDER=gemini, skipping")
        return []

    try:
        from app.ai_services.ai_provider import get_provider

        provider = get_provider()
        if not provider.is_configured():
            return []

        # Only Gemini supports chat_complete_with_google_search
        if not hasattr(provider, "chat_complete_with_google_search"):
            return []

        prompt = _PROMPT_TEMPLATE.format(
            stage_name=stage_name,
            focus_area=focus_area[:800],
            track_name=track_name,
            difficulty_level=difficulty_level,
            content_count=content_count,
        )

        messages = [
            {
                "role": "user",
                "content": prompt,
            },
        ]

        raw = await provider.chat_complete_with_google_search(
            messages=messages,
            temperature=0.4,
            timeout=90.0,
        )

        items = _parse_json_from_response(raw)
        if not items:
            return []

        difficulty = _normalize_difficulty(difficulty_level)
        valid = []
        for item in items:
            normalized = _validate_and_normalize_item(item, difficulty, track_name, stage_name)
            if normalized:
                valid.append(normalized)
            if len(valid) >= content_count:
                break

        log.info("Generated %d content items for stage '%s' via Gemini Search", len(valid), stage_name)
        return valid[:content_count]

    except Exception as e:
        log.warning("Stage content generation failed: %s", e, exc_info=True)
        return []
