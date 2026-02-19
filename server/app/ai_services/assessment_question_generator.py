"""
Assessment Question Generator
------------------------------
Single responsibility: given a track name and its configured assessment
dimensions, produce a list of assessment questions that are evenly spread
across every dimension.

Public interface — the ONLY import callers should use:

    from app.ai_services.assessment_question_generator import (
        generate_assessment_questions,
    )

    questions = await generate_assessment_questions(
        track_name="Full Stack Development",
        dimensions=[
            {"code": "problem_solving", "name": "Problem Solving",
             "description": "...", "weight": 0.15},
            ...
        ],
        count=10,
    )

Returns:
    List[Dict] where each dict contains:
        - dimension_code : str   (matches AssessmentDimension.code)
        - question_text  : str
        - question_type  : "mcq" | "logic" | "open"
        - difficulty     : "low" | "medium" | "high"
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

_PROMPT_TEMPLATE: str = """You are an expert technical interviewer for an educational platform.

Track: "{track_name}"

The assessment must evaluate candidates across these dimensions:
{dimensions_block}

Generate exactly {count} assessment questions.

Rules:
1. Distribute questions proportionally across dimensions based on their weights.
   Every dimension must receive at least one question.
2. For each question provide:
   - dimension_code : the exact code string of the dimension being assessed
   - question_text  : the full question text (for mcq, include the 4 options inline)
   - question_type  : one of "mcq", "logic", or "open"
   - difficulty     : one of "low", "medium", or "high"
3. Question type guide:
   - "mcq"   = multiple choice, 4 labelled options A/B/C/D inside question_text
   - "logic" = a scenario or reasoning challenge requiring step-by-step thinking
   - "open"  = an open-ended design or explanation question
4. Difficulty distribution: ~30 % low, ~50 % medium, ~20 % high
5. Questions must be specific and technical to the track — no generic questions.
6. Do NOT repeat the dimension name verbatim in the question text.

Output a JSON array only — no markdown fences, no commentary:

[
  {{
    "dimension_code": "problem_solving",
    "question_text": "...",
    "question_type": "open",
    "difficulty": "medium"
  }},
  ...
]"""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def generate_assessment_questions(
    track_name: str,
    dimensions: List[Dict],
    count: int = 10,
) -> List[Dict]:
    """
    Generate *count* assessment questions for *track_name* using *dimensions*.

    When USE_MOCK_AI is True (default) returns the mock set immediately.
    When USE_MOCK_AI is False calls OpenAI asynchronously via httpx and falls
    back to mock if the key is absent or the call fails.
    """
    if not dimensions:
        raise ValueError(
            "Cannot generate questions: track has no assessment dimensions configured."
        )

    if USE_MOCK_AI:
        return _mock_questions(track_name, dimensions, count)
    return await _ai_questions(track_name, dimensions, count)


# ---------------------------------------------------------------------------
# Real AI path
# ---------------------------------------------------------------------------


async def _ai_questions(
    track_name: str, dimensions: List[Dict], count: int
) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_questions(track_name, dimensions, count)

    dimensions_block = _format_dimensions_block(dimensions)
    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        dimensions_block=dimensions_block,
        count=count,
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert technical curriculum designer. "
                "Reply with valid JSON only — no markdown, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw_text = await provider.chat_complete(messages, temperature=0.4, timeout=45.0)

        # Strip any accidental markdown fences
        raw_text = re.sub(r"```[a-z]*", "", raw_text).strip()

        parsed = json.loads(raw_text)

        # Unwrap {"questions": [...]} if the model wraps the array
        if isinstance(parsed, dict):
            parsed = next(v for v in parsed.values() if isinstance(v, list))

        return _validate_and_sanitise(parsed, dimensions)

    except Exception:
        return _mock_questions(track_name, dimensions, count)


# ---------------------------------------------------------------------------
# Mock path
# ---------------------------------------------------------------------------

# Reusable question templates per question type.
# {dimension_name} and {track_name} are filled in at runtime.
_TEMPLATES: List[Dict] = [
    {
        "question_type": "open",
        "difficulty": "medium",
        "template": (
            "In the context of {track_name}, explain how you approach "
            "{dimension_name}. Provide a real-world example from your experience."
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "high",
        "template": (
            "You are working on a {track_name} project and face a critical "
            "challenge related to {dimension_name}. Walk through your "
            "decision-making process step by step."
        ),
    },
    {
        "question_type": "mcq",
        "difficulty": "low",
        "template": (
            "Which of the following best describes a key principle of "
            "{dimension_name} in {track_name}?\n"
            "A) Prioritising speed over correctness at all times\n"
            "B) Applying structured analysis before implementation\n"
            "C) Avoiding documentation to save time\n"
            "D) Delegating all decisions to senior team members"
        ),
    },
    {
        "question_type": "open",
        "difficulty": "high",
        "template": (
            "Design a strategy to improve {dimension_name} in a large-scale "
            "{track_name} system. What metrics would you track and why?"
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "medium",
        "template": (
            "A junior engineer on your team struggles with {dimension_name} "
            "in a {track_name} codebase. How would you mentor them and what "
            "concrete steps would you take?"
        ),
    },
    {
        "question_type": "mcq",
        "difficulty": "medium",
        "template": (
            "When evaluating trade-offs related to {dimension_name} in "
            "{track_name}, which approach is generally considered best practice?\n"
            "A) Always choose the most performant solution regardless of cost\n"
            "B) Balance correctness, maintainability, and performance\n"
            "C) Follow the latest trend without evaluating context\n"
            "D) Optimise only when problems appear in production"
        ),
    },
    {
        "question_type": "open",
        "difficulty": "low",
        "template": (
            "What does {dimension_name} mean to you in the context of "
            "{track_name}? Describe its importance in one or two sentences."
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "low",
        "template": (
            "List three concrete steps you would take to ensure strong "
            "{dimension_name} in a new {track_name} project."
        ),
    },
    {
        "question_type": "open",
        "difficulty": "medium",
        "template": (
            "Compare two common approaches to {dimension_name} in "
            "{track_name}. When would you choose one over the other?"
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "high",
        "template": (
            "A production incident in a {track_name} system is linked to "
            "poor {dimension_name}. Describe how you would conduct a "
            "post-mortem and prevent recurrence."
        ),
    },
]


def _mock_questions(
    track_name: str, dimensions: List[Dict], count: int
) -> List[Dict]:
    """
    Generate *count* mock questions distributed across *dimensions*.

    Questions cycle through the template list; dimensions are weighted so
    higher-weight dimensions receive proportionally more questions.
    """
    questions: List[Dict] = []

    # Build a weighted slot list: each dimension appears ≥1 time,
    # extra slots proportional to weight.
    slots: List[Dict] = list(dimensions)  # guaranteed at least one per dim
    total_extra = count - len(dimensions)
    if total_extra > 0:
        total_weight = sum(float(d.get("weight", 0)) for d in dimensions) or 1.0
        for dim in dimensions:
            extra = round(float(dim.get("weight", 0)) / total_weight * total_extra)
            slots.extend([dim] * extra)

    # Trim or pad to exactly `count`
    while len(slots) < count:
        slots.extend(dimensions)
    slots = slots[:count]

    for idx, dim in enumerate(slots):
        tmpl = _TEMPLATES[idx % len(_TEMPLATES)]
        question_text = tmpl["template"].format(
            track_name=track_name,
            dimension_name=dim["name"],
        )
        questions.append(
            {
                "dimension_code": dim["code"],
                "question_text": question_text,
                "question_type": tmpl["question_type"],
                "difficulty": tmpl["difficulty"],
            }
        )

    return questions


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _format_dimensions_block(dimensions: List[Dict]) -> str:
    """
    Format dimensions as a numbered list for the prompt.

    Example output:
        1. core_technical_knowledge | Core Technical Knowledge (weight: 0.15)
           Depth and accuracy of understanding in the fundamental concepts.
    """
    lines = []
    for i, d in enumerate(dimensions, 1):
        lines.append(
            f"{i}. {d['code']} | {d['name']} (weight: {d.get('weight', '?')})\n"
            f"   {d.get('description', '')}"
        )
    return "\n".join(lines)


def _validate_and_sanitise(raw: List[Dict], dimensions: List[Dict]) -> List[Dict]:
    """
    Ensure every question from the LLM has valid field values.
    Fixes or drops invalid entries rather than crashing.
    """
    valid_types = {"mcq", "logic", "open"}
    valid_difficulties = {"low", "medium", "high"}
    valid_codes = {d["code"] for d in dimensions}
    fallback_code = dimensions[0]["code"] if dimensions else ""

    clean: List[Dict] = []
    for q in raw:
        if not isinstance(q, dict):
            continue
        q["question_type"] = (
            q.get("question_type", "open")
            if q.get("question_type") in valid_types
            else "open"
        )
        q["difficulty"] = (
            q.get("difficulty", "medium")
            if q.get("difficulty") in valid_difficulties
            else "medium"
        )
        q["dimension_code"] = (
            q.get("dimension_code", fallback_code)
            if q.get("dimension_code") in valid_codes
            else fallback_code
        )
        if q.get("question_text"):
            clean.append(q)

    return clean
