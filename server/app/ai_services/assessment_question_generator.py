"""
Assessment Question Generator
------------------------------
Given a track name, produce a list of assessment questions.
Single prompt, track-only input. Tweak the prompt below to customize.
"""

import json
import os
import re
from typing import Dict, List

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"

# ---------------------------------------------------------------------------
# Prompt — tweak this to customize question generation
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE: str = """You are an expert technical interviewer for an educational platform.

Track: "{track_name}"

Assess candidates across these skill areas (distribute questions across all):
- Core technical knowledge (fundamentals, concepts, technologies)
- Problem solving (decomposing complex problems, efficient solutions)
- System design (scalable, maintainable architectures)
- Code quality & best practices
- Performance & optimisation
- Reliability & error handling
- Trade-off analysis (reasoning behind decisions)
- Communication & documentation
- Technical leadership (mentoring, standards)

Generate exactly {count} assessment questions.

Rules:
1. For each question provide:
   - question_text  : the full question text (for mcq, include 4 options A/B/C/D inline)
   - question_type  : one of "mcq", "logic", or "open"
   - difficulty     : one of "low", "medium", or "high"
2. Question types:
   - "mcq"   = multiple choice, 4 labelled options A/B/C/D inside question_text
   - "logic" = scenario or reasoning challenge, step-by-step thinking
   - "open"  = open-ended design or explanation question
3. Difficulty: ~30% low, ~50% medium, ~20% high
4. Questions must be specific and technical to the track — no generic questions.

Output a JSON array only — no markdown fences, no commentary:

[
  {{
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
    count: int = 10,
) -> List[Dict]:
    """
    Generate *count* assessment questions for *track_name*.
    Input: track_name only. Dimensions are defined inside the prompt.
    """
    if USE_MOCK_AI:
        return _mock_questions(track_name, count)
    return await _ai_questions(track_name, count)


# ---------------------------------------------------------------------------
# Real AI path
# ---------------------------------------------------------------------------


async def _ai_questions(track_name: str, count: int) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_questions(track_name, count)

    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
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

        return _validate_and_sanitise(parsed)

    except Exception:
        return _mock_questions(track_name, count)


# ---------------------------------------------------------------------------
# Mock path
# ---------------------------------------------------------------------------

# Skill areas for mock variety (matches prompt's inline list)
_MOCK_SKILL_AREAS: List[str] = [
    "Core technical knowledge",
    "Problem solving",
    "System design",
    "Code quality & best practices",
    "Performance & optimisation",
    "Reliability & error handling",
    "Trade-off analysis",
    "Communication & documentation",
    "Technical leadership",
]

# Reusable question templates. {skill_area} and {track_name} filled at runtime.
_TEMPLATES: List[Dict] = [
    {
        "question_type": "open",
        "difficulty": "medium",
        "template": (
            "In the context of {track_name}, explain how you approach "
            "{skill_area}. Provide a real-world example from your experience."
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "high",
        "template": (
            "You are working on a {track_name} project and face a critical "
            "challenge related to {skill_area}. Walk through your "
            "decision-making process step by step."
        ),
    },
    {
        "question_type": "mcq",
        "difficulty": "low",
        "template": (
            "Which of the following best describes a key principle of "
            "{skill_area} in {track_name}?\n"
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
            "Design a strategy to improve {skill_area} in a large-scale "
            "{track_name} system. What metrics would you track and why?"
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "medium",
        "template": (
            "A junior engineer on your team struggles with {skill_area} "
            "in a {track_name} codebase. How would you mentor them and what "
            "concrete steps would you take?"
        ),
    },
    {
        "question_type": "mcq",
        "difficulty": "medium",
        "template": (
            "When evaluating trade-offs related to {skill_area} in "
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
            "What does {skill_area} mean to you in the context of "
            "{track_name}? Describe its importance in one or two sentences."
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "low",
        "template": (
            "List three concrete steps you would take to ensure strong "
            "{skill_area} in a new {track_name} project."
        ),
    },
    {
        "question_type": "open",
        "difficulty": "medium",
        "template": (
            "Compare two common approaches to {skill_area} in "
            "{track_name}. When would you choose one over the other?"
        ),
    },
    {
        "question_type": "logic",
        "difficulty": "high",
        "template": (
            "A production incident in a {track_name} system is linked to "
            "poor {skill_area}. Describe how you would conduct a "
            "post-mortem and prevent recurrence."
        ),
    },
]


def _mock_questions(track_name: str, count: int) -> List[Dict]:
    """Generate *count* mock questions distributed across skill areas."""
    questions: List[Dict] = []
    for i in range(count):
        skill = _MOCK_SKILL_AREAS[i % len(_MOCK_SKILL_AREAS)]
        tmpl = _TEMPLATES[i % len(_TEMPLATES)]
        question_text = tmpl["template"].format(
            track_name=track_name,
            skill_area=skill,
        )
        questions.append(
            {
                "question_text": question_text,
                "question_type": tmpl["question_type"],
                "difficulty": tmpl["difficulty"],
            }
        )
    return questions


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _validate_and_sanitise(raw: List[Dict]) -> List[Dict]:
    """Ensure every question from the LLM has valid field values."""
    valid_types = {"mcq", "logic", "open"}
    valid_difficulties = {"low", "medium", "high"}

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
        if q.get("question_text"):
            clean.append(q)

    return clean
