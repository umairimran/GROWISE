"""
Assessment Dimensions Generator
--------------------------------
Single responsibility: given a track name, produce a list of assessment
dimensions (name, description, weight) that cover multiple engineering
perspectives.

Public interface (the ONLY thing callers should import):

    from app.ai_services.assessment_dimensions_generator import (
        generate_assessment_dimensions,
    )

    dimensions = await generate_assessment_dimensions(track_name)

Returns:
    List[Dict] where each dict has:
        - name        : str
        - description : str
        - weight      : float  (all weights sum to 1.0)
"""

import json
import os
import re
from typing import Dict, List

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE: str = """You are a senior software engineering evaluator and architect.
A new track has just been added to an educational platform: "{track_name}".
Your task is to **define assessment dimensions** for this track as if you are evaluating a senior engineer in this area.

Requirements:

1. Generate **8-12 dimensions** that reflect the skills, knowledge, and traits a senior engineer in this track should have.
2. For each dimension, provide:
   - **name**: A short, clear name of the skill or evaluation pillar.
   - **description**: One sentence describing what is being assessed.
   - **weight**: Importance of this dimension relative to others, as a decimal between 0 and 1. Total weight of all dimensions must sum to 1.
3. Dimensions must cover multiple perspectives: technical depth, problem-solving, system design, reliability, optimization, tradeoffs, communication, and leadership.
4. Output should be **JSON array** in this exact format:

[
  {{
    "name": "Dimension Name",
    "description": "One-sentence description",
    "weight": 0.1
  }},
  ...
]

Do not include explanations, commentary, or any extra text — only JSON output."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def generate_assessment_dimensions(track_name: str) -> List[Dict]:
    """
    Generate assessment dimensions for *track_name*.

    When USE_MOCK_AI is True (default), returns a fixed set of universal
    engineering dimensions immediately without any network call.

    When USE_MOCK_AI is False, calls OpenAI asynchronously via httpx and
    parses the JSON response.  Falls back to mock if the key is absent or
    the API call fails.

    Weights are always normalised to sum to exactly 1.0 before returning.
    """
    if USE_MOCK_AI:
        return _mock_dimensions()
    return await _ai_dimensions(track_name)


# ---------------------------------------------------------------------------
# Real AI path  (provider-agnostic via ai_provider)
# ---------------------------------------------------------------------------


async def _ai_dimensions(track_name: str) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_dimensions()

    prompt = _PROMPT_TEMPLATE.format(track_name=track_name)
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert curriculum designer. "
                "Reply with valid JSON only — no markdown fences, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw_text = await provider.chat_complete(messages, temperature=0.3, timeout=30.0)

        # The model may wrap in {"dimensions": [...]} — unwrap if needed
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            parsed = next(v for v in parsed.values() if isinstance(v, list))

        normalised = _normalise_weights(parsed)
        for dim in normalised:
            if not dim.get("code"):
                dim["code"] = _make_code(dim["name"])
        return normalised

    except Exception:
        return _mock_dimensions()


# ---------------------------------------------------------------------------
# Mock path
# ---------------------------------------------------------------------------

_MOCK_DIMENSIONS: List[Dict] = [
    {
        "name": "Core Technical Knowledge",
        "description": (
            "Depth and accuracy of understanding in the fundamental "
            "concepts and technologies of the track."
        ),
        "weight": 0.15,
    },
    {
        "name": "Problem Solving",
        "description": (
            "Ability to decompose complex, ambiguous problems and reach "
            "correct, efficient solutions."
        ),
        "weight": 0.15,
    },
    {
        "name": "System Design",
        "description": (
            "Competency in designing scalable, maintainable, and resilient "
            "architectures appropriate to the track domain."
        ),
        "weight": 0.12,
    },
    {
        "name": "Code Quality & Best Practices",
        "description": (
            "Adherence to clean-code principles, testability, and the "
            "industry coding standards relevant to the track."
        ),
        "weight": 0.12,
    },
    {
        "name": "Performance & Optimisation",
        "description": (
            "Ability to identify bottlenecks and apply targeted optimisations "
            "without sacrificing readability or correctness."
        ),
        "weight": 0.10,
    },
    {
        "name": "Reliability & Error Handling",
        "description": (
            "Designing for failure: graceful degradation, retries, circuit "
            "breakers, and robust error propagation."
        ),
        "weight": 0.10,
    },
    {
        "name": "Trade-off Analysis",
        "description": (
            "Capacity to evaluate competing solutions and articulate clear "
            "reasoning behind architectural and implementation decisions."
        ),
        "weight": 0.10,
    },
    {
        "name": "Communication & Documentation",
        "description": (
            "Clarity in explaining technical decisions, writing documentation, "
            "and collaborating effectively with cross-functional peers."
        ),
        "weight": 0.08,
    },
    {
        "name": "Technical Leadership",
        "description": (
            "Ability to mentor junior engineers, drive technical standards, "
            "and lead initiatives within the track domain."
        ),
        "weight": 0.08,
    },
]


def _mock_dimensions() -> List[Dict]:
    """Return a deep copy of the universal mock dimensions with auto-generated codes."""
    return [dict(d, code=_make_code(d["name"])) for d in _MOCK_DIMENSIONS]


# ---------------------------------------------------------------------------
# Code generation utility
# ---------------------------------------------------------------------------


def _make_code(name: str) -> str:
    """
    Derive a stable snake_case identifier from a dimension name.

    Examples:
        "Core Technical Knowledge"    → "core_technical_knowledge"
        "Code Quality & Best Practices" → "code_quality_and_best_practices"
        "Performance & Optimisation"  → "performance_and_optimisation"
    """
    code = name.lower()
    code = re.sub(r"&", "and", code)
    code = re.sub(r"[^a-z0-9\s]", "", code)
    code = re.sub(r"\s+", "_", code.strip())
    return code


# ---------------------------------------------------------------------------
# Weight normalisation utility
# ---------------------------------------------------------------------------


def _normalise_weights(dimensions: List[Dict]) -> List[Dict]:
    """
    Proportionally rescale all weights so they sum to exactly 1.0.
    Guards against LLM drift or rounding errors.
    """
    total = sum(float(d.get("weight", 0)) for d in dimensions)
    if total <= 0:
        even = round(1.0 / len(dimensions), 4)
        for d in dimensions:
            d["weight"] = even
        return dimensions

    for d in dimensions:
        d["weight"] = round(float(d["weight"]) / total, 4)

    # Correct any residual rounding error on the last item
    diff = round(1.0 - sum(d["weight"] for d in dimensions), 4)
    if diff and dimensions:
        dimensions[-1]["weight"] = round(dimensions[-1]["weight"] + diff, 4)

    return dimensions
