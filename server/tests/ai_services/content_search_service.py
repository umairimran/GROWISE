"""
Content Search Service - FastAPI-ready wrapper for the Google Search agent.

NOTE: The canonical implementation used by the content router is in
app/ai_services/content_search_service.py. This file is kept for standalone
testing (e.g. python -m search_agent.agent).

Usage in your FastAPI project:
    1. pip install google-adk python-dotenv fastapi uvicorn
    2. Set GOOGLE_API_KEY in .env or environment
    3. Add to your main.py:
        from content_search_service import router as content_search_router
        app.include_router(content_search_router, prefix="/content-search", tags=["Content Search"])

Or call the service directly (no FastAPI):
    result = await search_content({"stage_id": 328, "stage_name": "...", ...})
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# Lazy imports to avoid loading ADK until first request
_agent = None
_runner = None
_session = None


def _get_agent():
    global _agent
    if _agent is None:
        from google.adk.agents import Agent
        from google.adk.tools import google_search

        _agent = Agent(
            name="content_search_agent",
            model="gemini-2.5-flash",
            description="Agent that searches Google for educational content.",
            instruction=_CONTENT_SEARCH_INSTRUCTION,
            tools=[google_search],
        )
    return _agent


_CONTENT_SEARCH_INSTRUCTION = """You are a research agent that searches the internet for educational content.

When given a stage/topic description, use Google Search to find relevant articles, tutorials, documentation, and best practices from the web.

CRITICAL - Your response MUST be valid JSON only. No markdown, no explanation before or after. Return ONLY a JSON object with this exact structure:

{
  "stage_id": <number from input>,
  "stage_name": "<string from input>",
  "focus_area": "<string from input>",
  "difficulty_level": "<string from input>",
  "track_name": "<string from input>",
  "content": [
    {
      "title": "Article/resource title",
      "url": "https://...",
      "summary": "2-3 sentence summary of the content",
      "key_points": ["point 1", "point 2", "point 3"],
      "source_type": "article|tutorial|documentation|blog|video"
    }
  ]
}

Rules:
- Search for and return as many high-quality resources as you find relevant
- Include real URLs from your search results - they must be actual web pages
- Each content item must have: title, url, summary, key_points (array), source_type
- Focus on practical, beginner-friendly content when difficulty_level is "beginner"
- Extract key_points from the actual content found, not generic phrases
- Return ONLY the JSON object, no other text"""


def _build_search_prompt(stage_input: dict[str, Any]) -> str:
    stage_name = stage_input.get("stage_name", "")
    focus_area = stage_input.get("focus_area", "")
    track_name = stage_input.get("track_name", "")
    difficulty = stage_input.get("difficulty_level", "")
    return f"""Search the internet and find high-quality educational resources for this learning stage:

Stage: {stage_name}
Track: {track_name}
Focus: {focus_area}
Difficulty: {difficulty}

Find articles, tutorials, documentation, or blog posts from the web. Return the results as JSON with the exact structure specified in your instructions."""


def _extract_json_from_response(text: str) -> dict:
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if json_match:
        text = json_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    brace_match = re.search(r"\{[\s\S]*\}", text)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not extract valid JSON from response: {text[:200]}...")


def _extract_grounding_urls(grounding_metadata: Any) -> list[dict]:
    if not grounding_metadata:
        return []
    chunks = None
    if hasattr(grounding_metadata, "grounding_chunks"):
        chunks = grounding_metadata.grounding_chunks
    elif isinstance(grounding_metadata, dict):
        chunks = grounding_metadata.get("groundingChunks") or grounding_metadata.get("grounding_chunks")
    if not chunks:
        return []
    urls = []
    for chunk in chunks:
        web = chunk.web if hasattr(chunk, "web") else (chunk.get("web") if isinstance(chunk, dict) else None)
        if web:
            uri = getattr(web, "uri", None) if not isinstance(web, dict) else web.get("uri")
            title = getattr(web, "title", None) if not isinstance(web, dict) else web.get("title")
            if uri:
                urls.append({"url": str(uri), "title": str(title) if title else ""})
    return urls


async def search_content(stage_input: dict[str, Any]) -> dict[str, Any]:
    """
    Search Google for content based on stage input. Returns structured JSON.

    Args:
        stage_input: {
            "stage_id": int,
            "stage_name": str,
            "focus_area": str,
            "difficulty_level": str,
            "track_name": str
        }

    Returns:
        Same structure with "content" array populated (title, url, summary, key_points, source_type)
    """
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    agent = _get_agent()
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="content_search", user_id="api", session_id="default"
    )
    runner = Runner(agent=agent, app_name="content_search", session_service=session_service)

    prompt = _build_search_prompt(stage_input)
    content = types.Content(role="user", parts=[types.Part(text=prompt)])
    events = runner.run_async(user_id="api", session_id="default", new_message=content)

    raw_response = ""
    grounding_metadata = None
    async for event in events:
        if event.is_final_response():
            raw_response = event.content.parts[0].text if event.content and event.content.parts else ""
            grounding_metadata = getattr(event, "grounding_metadata", None)
            break

    result = _extract_json_from_response(raw_response)
    grounding_urls = _extract_grounding_urls(grounding_metadata)

    if grounding_urls and "content" in result:
        for i, item in enumerate(result["content"]):
            if i < len(grounding_urls):
                g = grounding_urls[i]
                item["url"] = g["url"]
                if g.get("title"):
                    item["title"] = g["title"]
        for i in range(len(result["content"]), len(grounding_urls)):
            g = grounding_urls[i]
            result["content"].append({
                "title": g.get("title", "Source"),
                "url": g["url"],
                "summary": "",
                "key_points": [],
                "source_type": "article",
            })

    return result


# --- FastAPI integration ---

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel, Field

    class StageInput(BaseModel):
        stage_id: int = Field(..., description="Stage identifier")
        stage_name: str = Field(..., description="Name of the learning stage")
        focus_area: str = Field(..., description="Focus area description")
        difficulty_level: str = Field(default="beginner", description="Difficulty level")
        track_name: str = Field(..., description="Track name")

    router = APIRouter()

    @router.post("/search", response_model=dict)
    async def search_endpoint(input_data: StageInput) -> dict:
        """Search for educational content based on stage input. Returns JSON with content links."""
        try:
            return await search_content(input_data.model_dump())
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

except ImportError:
    router = None  # FastAPI not installed
    StageInput = None
