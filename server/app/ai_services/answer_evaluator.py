"""
Answer Evaluator
-----------------
Single responsibility: given a user's answer with full context (track, dimension,
question), evaluate the answer across 9 engineering criteria and return a
structured result.

Evaluation is TRACK-SPECIFIC: the evaluator must have complete information about
the track and judge answers in the context of that track's skills and concepts.

Public interface:

    from app.ai_services.answer_evaluator import evaluate_answer

    result = await evaluate_answer(
        user_answer="...",
        question_text="...",
        track_name="Full Stack Development",
        track_description="...",  # Optional; full track context for accurate evaluation
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
from typing import Dict, List

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
response in a technical assessment. The assessment is for a SPECIFIC TRACK.

===== TRACK CONTEXT (READ THIS FIRST) =====
You MUST evaluate the answer in the context of this track. Do NOT judge generically.
The candidate chose this track and the question is about skills relevant to it.

Track Name       : {track_name}
Track Description: {track_description}

===== QUESTION CONTEXT =====
Dimension          : {dimension_name}  (weight in overall score: {dimension_weight})
Dimension Purpose  : {dimension_description}
Question Type      : {question_type}
Question           : {question_text}

===== CANDIDATE ANSWER =====
{user_answer}

===== EVALUATION CRITERIA =====
Score each criterion from 0 (absent) to 10 (senior-excellent).
**IMPORTANT**: Judge each criterion in the context of {track_name}. For example:
- technical_depth: Are the technical details accurate and deep FOR THIS TRACK?
- scalability_awareness: Does the answer consider scale FOR {track_name} systems?
- practicality: Is the solution realistic FOR {track_name} projects?

1.  problem_understanding   – Did the candidate correctly interpret the problem?
2.  structured_thinking     – Is the answer logically organised and systematic?
3.  technical_depth         – Are technical details accurate and sufficiently deep FOR {track_name}?
4.  scalability_awareness   – Does the candidate consider scale, load, or growth?
5.  failure_handling        – Are failure modes, edge cases, and retries addressed?
6.  tradeoff_reasoning      – Does the candidate weigh pros/cons of design choices?
7.  practicality            – Is the proposed solution realistic and implementable IN {track_name}?
8.  communication_clarity   – Is the answer clear, concise, and well-articulated?
9.  engineering_maturity    – Does the response show ownership, pragmatism, and \
professionalism expected of a senior engineer?

===== SCORING GUIDE =====
9-10  Senior-level excellence — covers all aspects deeply with real-world nuance RELEVANT TO {track_name}.
7-8   Strong — solid understanding with minor gaps.
5-6   Adequate — core idea is correct but lacks depth or misses key aspects.
3-4   Partial — some understanding but significant gaps.
0-2   Missing or incorrect — criterion not addressed.

===== INSTRUCTIONS =====
- Evaluate in the context of {track_name}. Do NOT judge randomly or generically.
- If the answer is generic or unrelated to the track, score technical_depth and practicality lower.
- If the answer shows track-specific knowledge, reward appropriately.
- The final_score must be a float between 0.0 and 1.0 representing overall quality.
  Derive it as the weighted average of criteria scores normalised to [0, 1].
- The explanation should be 2-4 sentences: summarise strengths, weaknesses, and \
what would make the answer better — reference {track_name} where relevant.
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
    track_description: str = "",
) -> Dict:
    """
    Evaluate a single answer with full context.

    track_description: Full description of the track (skills, technologies, scope).
      When provided, the evaluator uses it to judge answers in track-specific context.
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
        track_description=track_description,
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
    track_description: str,
    dimension_name: str,
    dimension_description: str,
    dimension_weight: float,
    question_type: str,
) -> Dict:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_evaluate(user_answer, dimension_name, dimension_weight)

    # Use track description; fallback when empty
    desc = (track_description or "").strip()
    if not desc:
        desc = (
            f"No detailed description available. Use your knowledge of {track_name} "
            f"(technologies, tools, best practices, typical challenges) to evaluate "
            f"whether the answer demonstrates track-relevant skills. Do not judge generically."
        )

    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        track_description=desc,
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
                "You MUST evaluate answers in the context of the specific track — "
                "do not judge generically. Use the track description to understand "
                "what skills and concepts matter. Reply with valid JSON only — no markdown fences, no commentary."
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
# Batch evaluation (single API call for all questions)
# ---------------------------------------------------------------------------

_BATCH_PROMPT_TEMPLATE = """You are a senior software engineer evaluating a candidate's \
responses in a technical assessment. The assessment is for a SPECIFIC TRACK. You will \
evaluate ALL answers in a single pass.

===== TRACK CONTEXT (READ THIS FIRST) =====
You MUST evaluate each answer in the context of this track. Do NOT judge generically.

Track Name       : {track_name}
Track Description: {track_description}

===== ALL QUESTIONS AND CANDIDATE ANSWERS =====
Evaluate each pair below. Maintain the order (1, 2, 3, ...) in your response.

{qa_blocks}

===== EVALUATION CRITERIA (apply to EACH answer) =====
Score each criterion from 0 (absent) to 10 (senior-excellent). Judge in context of {track_name}:
1. problem_understanding   – Did the candidate correctly interpret the problem?
2. structured_thinking     – Is the answer logically organised?
3. technical_depth        – Are technical details accurate and deep FOR {track_name}?
4. scalability_awareness  – Does the candidate consider scale, load, or growth?
5. failure_handling       – Are failure modes, edge cases addressed?
6. tradeoff_reasoning      – Does the candidate weigh pros/cons?
7. practicality           – Is the solution realistic FOR {track_name}?
8. communication_clarity  – Is the answer clear and well-articulated?
9. engineering_maturity   – Professionalism, ownership, pragmatism.

===== SCORING GUIDE =====
9-10 Senior-level excellence. 7-8 Strong. 5-6 Adequate. 3-4 Partial. 0-2 Missing/incorrect.

===== INSTRUCTIONS =====
- Evaluate each answer in context of {track_name}.
- final_score: float 0.0–1.0 (weighted average of criteria normalised to [0,1]).
- explanation: 2–4 sentences per answer — strengths, weaknesses, improvement tips.
- Return ONLY valid JSON — a single array of evaluation objects, one per question, in order.
- No markdown fences, no extra text.

===== REQUIRED OUTPUT FORMAT =====
[
  {{
    "criteria_scores": {{
      "problem_understanding": <int>,
      "structured_thinking": <int>,
      "technical_depth": <int>,
      "scalability_awareness": <int>,
      "failure_handling": <int>,
      "tradeoff_reasoning": <int>,
      "practicality": <int>,
      "communication_clarity": <int>,
      "engineering_maturity": <int>
    }},
    "final_score": <float 0.0-1.0>,
    "explanation": "<string>"
  }},
  ... (one object per question, same order as input)
]
"""


def _build_qa_block(idx: int, qa: Dict) -> str:
    """Build a single Q&A block for the batch prompt."""
    lines = [
        f"--- Question {idx} ---",
        f"Dimension: {qa.get('dimension_name', 'General')} (weight: {qa.get('dimension_weight', 1.0)})",
        f"Dimension Purpose: {qa.get('dimension_description', '')}",
        f"Question Type: {qa.get('question_type', 'open')}",
        f"Question: {qa.get('question_text', '')}",
        f"Candidate Answer: {qa.get('user_answer', '')}",
        "",
    ]
    return "\n".join(lines)


async def evaluate_answers_batch(
    track_name: str,
    track_description: str,
    questions_and_answers: List[Dict],
) -> List[Dict]:
    """
    Evaluate all answers in a single API call. Reduces cost from N calls to 1.

    Each item in questions_and_answers must have:
      question_text, user_answer, dimension_name, dimension_description,
      dimension_weight, question_type

    Returns list of evaluations (same shape as evaluate_answer) in same order.
    """
    if not questions_and_answers:
        return []

    if USE_MOCK_AI:
        return [
            _mock_evaluate(
                user_answer=qa.get("user_answer", ""),
                dimension_name=qa.get("dimension_name", "General"),
                dimension_weight=float(qa.get("dimension_weight", 1.0)),
            )
            for qa in questions_and_answers
        ]

    return await _ai_evaluate_batch(
        track_name=track_name,
        track_description=track_description,
        questions_and_answers=questions_and_answers,
    )


async def _ai_evaluate_batch(
    track_name: str,
    track_description: str,
    questions_and_answers: List[Dict],
) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return [
            _mock_evaluate(
                user_answer=qa.get("user_answer", ""),
                dimension_name=qa.get("dimension_name", "General"),
                dimension_weight=float(qa.get("dimension_weight", 1.0)),
            )
            for qa in questions_and_answers
        ]

    desc = (track_description or "").strip()
    if not desc:
        desc = (
            f"No detailed description. Use your knowledge of {track_name} "
            f"to evaluate whether answers demonstrate track-relevant skills."
        )

    qa_blocks = "\n".join(
        _build_qa_block(i, qa) for i, qa in enumerate(questions_and_answers, start=1)
    )

    prompt = _BATCH_PROMPT_TEMPLATE.format(
        track_name=track_name,
        track_description=desc,
        qa_blocks=qa_blocks,
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a strict technical interviewer. Evaluate ALL answers in context of the track. "
                "Reply with a valid JSON array only — no markdown, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.2, timeout=120.0)
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        results = json.loads(raw)

        if not isinstance(results, list):
            results = [results]

        # Ensure we have exactly N evaluations; pad or trim if needed
        n = len(questions_and_answers)
        evaluations = []
        for i in range(n):
            if i < len(results) and isinstance(results[i], dict):
                evaluations.append(_validate(results[i]))
            else:
                qa = questions_and_answers[i]
                evaluations.append(
                    _mock_evaluate(
                        user_answer=qa.get("user_answer", ""),
                        dimension_name=qa.get("dimension_name", "General"),
                        dimension_weight=float(qa.get("dimension_weight", 1.0)),
                    )
                )
        return evaluations

    except Exception:
        return [
            _mock_evaluate(
                user_answer=qa.get("user_answer", ""),
                dimension_name=qa.get("dimension_name", "General"),
                dimension_weight=float(qa.get("dimension_weight", 1.0)),
            )
            for qa in questions_and_answers
        ]


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
