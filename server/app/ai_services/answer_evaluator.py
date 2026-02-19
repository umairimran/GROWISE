"""
Answer Evaluator
-----------------
Single responsibility: given a user's answer with full context (track, dimension,
question), evaluate the answer across 9 engineering criteria and return a
structured result.

Public interface:

    from app.ai_services.answer_evaluator import evaluate_answer

    result = await evaluate_answer(
        user_answer="...",
        question_text="...",
        track_name="Full Stack Development",
        dimension_name="Problem Solving",
        dimension_description="Ability to decompose complex problems.",
        dimension_weight=0.20,
        question_type="open",
    )

Returns:
    {
        "criteria_scores": {
            "problem_understanding":   int (0-10),
            "structured_thinking":     int (0-10),
            "technical_depth":         int (0-10),
            "scalability_awareness":   int (0-10),
            "failure_handling":        int (0-10),
            "tradeoff_reasoning":      int (0-10),
            "practicality":            int (0-10),
            "communication_clarity":   int (0-10),
            "engineering_maturity":    int (0-10),
        },
        "final_score":  float  (0.0 – 1.0),
        "explanation":  str,
    }
"""

import json
import os
import random
from typing import Dict

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"

CRITERIA = [
    "problem_understanding",
    "structured_thinking",
    "technical_depth",
    "scalability_awareness",
    "failure_handling",
    "tradeoff_reasoning",
    "practicality",
    "communication_clarity",
    "engineering_maturity",
]

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = """You are a senior software engineer evaluating a candidate's \
response in a technical assessment for a production-level engineering role.

===== CONTEXT =====
Track              : {track_name}
Dimension          : {dimension_name}  (weight in overall score: {dimension_weight})
Dimension Purpose  : {dimension_description}
Question Type      : {question_type}
Question           : {question_text}

===== CANDIDATE ANSWER =====
{user_answer}

===== EVALUATION CRITERIA =====
Score each criterion from 0 (absent) to 10 (senior-excellent):

1.  problem_understanding   – Did the candidate correctly interpret the problem?
2.  structured_thinking     – Is the answer logically organised and systematic?
3.  technical_depth         – Are technical details accurate and sufficiently deep?
4.  scalability_awareness   – Does the candidate consider scale, load, or growth?
5.  failure_handling        – Are failure modes, edge cases, and retries addressed?
6.  tradeoff_reasoning      – Does the candidate weigh pros/cons of design choices?
7.  practicality            – Is the proposed solution realistic and implementable?
8.  communication_clarity   – Is the answer clear, concise, and well-articulated?
9.  engineering_maturity    – Does the response show ownership, pragmatism, and \
professionalism expected of a senior engineer?

===== SCORING GUIDE =====
9-10  Senior-level excellence — covers all aspects deeply with real-world nuance.
7-8   Strong — solid understanding with minor gaps.
5-6   Adequate — core idea is correct but lacks depth or misses key aspects.
3-4   Partial — some understanding but significant gaps.
0-2   Missing or incorrect — criterion not addressed.

===== INSTRUCTIONS =====
- Be strict but fair; this is for a production engineering role.
- The final_score must be a float between 0.0 and 1.0 representing overall quality.
  Derive it as the weighted average of criteria scores normalised to [0, 1].
- The explanation should be 2-4 sentences: summarise strengths, weaknesses, and \
what would make the answer better.
- Return ONLY valid JSON — no markdown fences, no extra text.

===== REQUIRED OUTPUT FORMAT =====
{{
  "criteria_scores": {{
    "problem_understanding": <int>,
    "structured_thinking":   <int>,
    "technical_depth":       <int>,
    "scalability_awareness": <int>,
    "failure_handling":      <int>,
    "tradeoff_reasoning":    <int>,
    "practicality":          <int>,
    "communication_clarity": <int>,
    "engineering_maturity":  <int>
  }},
  "final_score": <float 0.0-1.0>,
  "explanation": "<string>"
}}"""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def evaluate_answer(
    user_answer: str,
    question_text: str,
    track_name: str,
    dimension_name: str,
    dimension_description: str,
    dimension_weight: float,
    question_type: str,
) -> Dict:
    """
    Evaluate a single answer with full context.

    Mock mode  : returns plausible scores derived from heuristics (no API call).
    Real mode  : calls OpenAI GPT-4o-mini and parses the structured JSON response.
    Falls back to mock on any network or parse error.
    """
    if USE_MOCK_AI:
        return _mock_evaluate(
            user_answer=user_answer,
            dimension_name=dimension_name,
            dimension_weight=dimension_weight,
        )
    return await _ai_evaluate(
        user_answer=user_answer,
        question_text=question_text,
        track_name=track_name,
        dimension_name=dimension_name,
        dimension_description=dimension_description,
        dimension_weight=dimension_weight,
        question_type=question_type,
    )


# ---------------------------------------------------------------------------
# Real AI path
# ---------------------------------------------------------------------------


async def _ai_evaluate(
    user_answer: str,
    question_text: str,
    track_name: str,
    dimension_name: str,
    dimension_description: str,
    dimension_weight: float,
    question_type: str,
) -> Dict:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_evaluate(user_answer, dimension_name, dimension_weight)

    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        dimension_name=dimension_name,
        dimension_description=dimension_description,
        dimension_weight=dimension_weight,
        question_type=question_type,
        question_text=question_text,
        user_answer=user_answer,
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a strict technical interviewer. "
                "Reply with valid JSON only — no markdown fences, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.2, timeout=45.0)

        # Strip any accidental backtick fences
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()

        result = json.loads(raw)
        return _validate(result)

    except Exception:
        return _mock_evaluate(user_answer, dimension_name, dimension_weight)


# ---------------------------------------------------------------------------
# Mock path
# ---------------------------------------------------------------------------


def _mock_evaluate(
    user_answer: str,
    dimension_name: str,
    dimension_weight: float,
) -> Dict:
    """
    Produce plausible evaluation scores without calling any LLM.

    Scoring heuristics (same signals as the old ai_service mock,
    but applied per-criterion with slight variation):

      - Base: random 5-8 per criterion
      - +1   : answer >= 40 words (shows elaboration)
      - +1   : answer >= 80 words (shows depth)
      - +1   : contains example/instance keywords (practical thinking)
      - +1   : contains long technical words >8 chars (technical depth)
      - -1   : answer < 15 words (too short)
    """
    words = user_answer.split()
    word_count = len(words)
    has_examples = any(
        kw in user_answer.lower()
        for kw in ["example", "for instance", "such as", "like", "e.g"]
    )
    has_technical = len([w for w in words if len(w) > 8]) > 2

    def _score(bonus_criteria: bool = False) -> int:
        base = random.randint(5, 8)
        if word_count >= 80:
            base += 1
        elif word_count >= 40:
            base += 0
        elif word_count < 15:
            base -= 1
        if has_examples:
            base += 1
        if has_technical and bonus_criteria:
            base += 1
        return max(0, min(10, base))

    criteria_scores = {
        "problem_understanding":  _score(),
        "structured_thinking":    _score(),
        "technical_depth":        _score(bonus_criteria=True),
        "scalability_awareness":  _score(),
        "failure_handling":       _score(),
        "tradeoff_reasoning":     _score(),
        "practicality":           _score(bonus_criteria=has_examples),
        "communication_clarity":  _score(),
        "engineering_maturity":   _score(),
    }

    avg = sum(criteria_scores.values()) / (len(criteria_scores) * 10)
    final_score = round(max(0.0, min(1.0, avg)), 3)

    # Build explanation
    strong = [k for k, v in criteria_scores.items() if v >= 8]
    weak = [k for k, v in criteria_scores.items() if v <= 5]

    strengths_text = (
        "Strong in: " + ", ".join(strong).replace("_", " ") + ". "
        if strong
        else ""
    )
    gaps_text = (
        "Needs improvement in: " + ", ".join(weak).replace("_", " ") + ". "
        if weak
        else ""
    )
    tip = (
        "Adding concrete examples and discussing tradeoffs would significantly "
        "strengthen the response."
        if word_count < 40
        else "Going deeper on failure scenarios and scalability considerations "
        "would elevate this to a senior-level answer."
    )

    explanation = (
        f"Evaluated for dimension '{dimension_name}' (weight: {dimension_weight}). "
        f"{strengths_text}{gaps_text}{tip}"
    )

    return {
        "criteria_scores": criteria_scores,
        "final_score": final_score,
        "explanation": explanation,
    }


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------


def _validate(result: Dict) -> Dict:
    """
    Ensure every expected key exists and values are in range.
    Fixes missing or out-of-range values rather than crashing.
    """
    cs = result.get("criteria_scores", {})
    for key in CRITERIA:
        raw = cs.get(key)
        try:
            cs[key] = max(0, min(10, int(raw)))
        except (TypeError, ValueError):
            cs[key] = 5

    try:
        fs = float(result.get("final_score", 0))
        result["final_score"] = round(max(0.0, min(1.0, fs)), 3)
    except (TypeError, ValueError):
        avg = sum(cs.values()) / (len(cs) * 10)
        result["final_score"] = round(avg, 3)

    if not isinstance(result.get("explanation"), str) or not result["explanation"].strip():
        result["explanation"] = "No explanation provided."

    result["criteria_scores"] = cs
    return result
