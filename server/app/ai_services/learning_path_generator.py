"""
Learning Path Generator
-----------------------
Single responsibility: given the full context of a completed assessment
(all 10 questions + answers + evaluations), generate personalized
learning path stages — NO content items, stages only.

Public interface:

    from app.ai_services.learning_path_generator import generate_learning_path_stages

    stages = await generate_learning_path_stages(
        track_name="Full Stack Development",
        detected_level="intermediate",
        questions_and_answers=[
            {
                "question_text": "...",
                "user_answer": "...",
                "dimension": "Scalability Awareness",
                "criteria_scores": {"scalability_awareness": 4, ...},
                "final_score": 0.45,
                "ai_explanation": "..."
            },
            ...  (all 10)
        ]
    )

Returns:
    [
        {
            "stage_name": "Improving Scalability Thinking",
            "stage_order": 1,
            "focus_area": "Address gaps in scalability awareness..."
        },
        ...
    ]
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

_PROMPT_TEMPLATE = """You are an expert learning path designer who personalizes \
growth plans based on real assessment performance.

===== CONTEXT =====
Track     : {track_name}
Level     : {detected_level}

===== ASSESSMENT PERFORMANCE =====
The candidate answered {question_count} questions. Here is the detailed breakdown:

{qa_block}

===== YOUR TASK =====
1. Analyze the answers and identify the candidate's SPECIFIC weaknesses and gaps.
2. Group related weaknesses into 3 to 5 focused learning stages.
3. Order stages from most critical gap to least critical (stage_order 1 = highest priority).
4. Each stage must:
   - Have a clear, concise stage_name (e.g. "Scalability Fundamentals", "Error Handling Mastery")
   - Have a detailed focus_area explaining:
     * What gap this stage addresses
     * Which questions revealed this gap (e.g. "Questions 3, 7, 9 showed weakness in...")
     * What the candidate should be able to do after completing this stage
5. Base stages ONLY on actual gaps found in the answers. Do not invent problems.
6. If the candidate performed well in an area, do not create a stage for it.

===== RULES =====
- Return ONLY valid JSON — no markdown fences, no extra text.
- stage_order must start at 1 and increment by 1.
- stage_name must be under 60 characters.
- focus_area must be 2-4 sentences, specific and actionable.
- Minimum 3 stages, maximum 5 stages.

===== REQUIRED OUTPUT FORMAT =====
{{
  "stages": [
    {{
      "stage_name": "<string under 60 chars>",
      "stage_order": <int starting at 1>,
      "focus_area": "<2-4 sentences specific to the gaps identified>"
    }}
  ]
}}"""


def _build_qa_block(questions_and_answers: List[Dict]) -> str:
    """Format all Q&A into a readable block for the AI prompt."""
    lines = []
    for i, qa in enumerate(questions_and_answers, start=1):
        criteria = qa.get("criteria_scores", {})
        # Find weak criteria (score <= 5)
        weak = [k.replace("_", " ") for k, v in criteria.items() if isinstance(v, (int, float)) and v <= 5]
        strong = [k.replace("_", " ") for k, v in criteria.items() if isinstance(v, (int, float)) and v >= 8]

        lines.append(f"--- Question {i} ---")
        lines.append(f"Dimension   : {qa.get('dimension', 'General')}")
        lines.append(f"Question    : {qa.get('question_text', '')}")
        lines.append(f"Answer      : {qa.get('user_answer', '')[:300]}")
        lines.append(f"Score       : {qa.get('final_score', 0):.2f} / 1.0")
        if weak:
            lines.append(f"Weak areas  : {', '.join(weak)}")
        if strong:
            lines.append(f"Strong areas: {', '.join(strong)}")
        lines.append(f"Evaluator   : {qa.get('ai_explanation', '')[:200]}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def generate_learning_path_stages(
    track_name: str,
    detected_level: str,
    questions_and_answers: List[Dict],
) -> List[Dict]:
    """
    Generate personalized learning path stages from assessment Q&A context.

    Mock mode  : Returns plausible stages derived from weak criteria scores
                 without any API call.
    Real mode  : Calls OpenAI GPT-4o-mini and parses the structured JSON response.
    Falls back to mock on any network or parse error.
    """
    if not questions_and_answers:
        return _fallback_stages(track_name, detected_level)

    if USE_MOCK_AI:
        return _mock_stages(track_name, detected_level, questions_and_answers)

    return await _ai_stages(track_name, detected_level, questions_and_answers)


# ---------------------------------------------------------------------------
# Real AI path
# ---------------------------------------------------------------------------


async def _ai_stages(
    track_name: str,
    detected_level: str,
    questions_and_answers: List[Dict],
) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_stages(track_name, detected_level, questions_and_answers)

    qa_block = _build_qa_block(questions_and_answers)
    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        detected_level=detected_level,
        question_count=len(questions_and_answers),
        qa_block=qa_block,
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a learning path designer. "
                "Reply with valid JSON only — no markdown fences, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.3, timeout=60.0)
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        result = json.loads(raw)
        return _validate_stages(result.get("stages", []))

    except Exception:
        return _mock_stages(track_name, detected_level, questions_and_answers)


# ---------------------------------------------------------------------------
# Mock path
# ---------------------------------------------------------------------------

_CRITERIA_TO_TOPIC = {
    "problem_understanding":  "Problem Analysis & Decomposition",
    "structured_thinking":    "Structured Thinking & Planning",
    "technical_depth":        "Technical Depth & Best Practices",
    "scalability_awareness":  "Scalability & Performance",
    "failure_handling":       "Error Handling & Fault Tolerance",
    "tradeoff_reasoning":     "Tradeoff Analysis & Decision Making",
    "practicality":           "Practical Application & Implementation",
    "communication_clarity":  "Communication & Documentation",
    "engineering_maturity":   "Engineering Maturity & Ownership",
}


def _mock_stages(
    track_name: str,
    detected_level: str,
    questions_and_answers: List[Dict],
) -> List[Dict]:
    """
    Derive stages from actual weak criteria scores across all answers.
    Groups weak criteria into 3-5 coherent stages.
    """
    # Aggregate criteria scores across all Q&A
    criteria_totals: Dict[str, List[float]] = {}
    for qa in questions_and_answers:
        scores = qa.get("criteria_scores", {})
        for criterion, score in scores.items():
            if criterion not in criteria_totals:
                criteria_totals[criterion] = []
            try:
                criteria_totals[criterion].append(float(score))
            except (TypeError, ValueError):
                pass

    # Calculate average score per criterion
    criteria_averages = {
        k: sum(v) / len(v)
        for k, v in criteria_totals.items()
        if v
    }

    # If no criteria data is present at all, use level-based fallback
    if not criteria_averages:
        return _fallback_stages(track_name, detected_level)

    # Sort by average score ascending (weakest first)
    sorted_criteria = sorted(criteria_averages.items(), key=lambda x: x[1])

    # Take the 4-5 weakest criteria to build stages from
    weakest = sorted_criteria[:5]

    # Group into 3-5 stages
    stages = []
    used_topics = set()

    # Priority groups (related criteria that map to same topic)
    priority_groups = [
        # Group 1: Scalability + Failure = Systems Thinking
        {
            "criteria": ["scalability_awareness", "failure_handling"],
            "stage_name": f"Systems Thinking for {track_name}",
            "focus_area": (
                "This stage addresses identified gaps in scalability awareness and failure handling. "
                "You will learn to design systems that handle growth and failure gracefully. "
                "Focus on load balancing, caching strategies, circuit breakers, and retry logic. "
                "After completing this stage, you should be able to design resilient, scalable systems."
            ),
        },
        # Group 2: Technical Depth + Practicality = Engineering Fundamentals
        {
            "criteria": ["technical_depth", "practicality"],
            "stage_name": "Engineering Fundamentals & Best Practices",
            "focus_area": (
                "This stage targets gaps in technical depth and practical implementation skills. "
                "You will strengthen your understanding of core engineering concepts and their real-world application. "
                "Focus on design patterns, code quality, testing, and production-ready implementations. "
                "After this stage, you should be able to write deep, practical solutions to complex problems."
            ),
        },
        # Group 3: Problem Understanding + Structured Thinking = Problem Solving
        {
            "criteria": ["problem_understanding", "structured_thinking"],
            "stage_name": "Problem Solving & Structured Thinking",
            "focus_area": (
                "This stage addresses gaps in problem decomposition and structured reasoning. "
                "You will practice breaking down complex problems into manageable components systematically. "
                "Focus on problem-solving frameworks, algorithmic thinking, and solution planning. "
                "After this stage, you should be able to approach any problem with clarity and structure."
            ),
        },
        # Group 4: Tradeoff Reasoning + Engineering Maturity = Senior Engineering
        {
            "criteria": ["tradeoff_reasoning", "engineering_maturity"],
            "stage_name": "Senior Engineering Mindset",
            "focus_area": (
                "This stage addresses gaps in tradeoff reasoning and engineering maturity. "
                "You will develop the ability to evaluate design decisions, weigh pros and cons, and show ownership. "
                "Focus on architecture decision records, tech debt management, and pragmatic engineering. "
                "After this stage, you should think and communicate like a senior engineer."
            ),
        },
        # Group 5: Communication Clarity = Communication
        {
            "criteria": ["communication_clarity"],
            "stage_name": "Technical Communication & Documentation",
            "focus_area": (
                "This stage targets gaps in communication clarity identified across multiple answers. "
                "You will learn to explain complex technical concepts clearly and concisely. "
                "Focus on technical writing, documentation, diagramming (system design), and verbal communication. "
                "After this stage, you should be able to communicate technical ideas effectively to any audience."
            ),
        },
    ]

    # Identify which groups have weak criteria
    weak_criterion_names = {c for c, _ in weakest}
    order = 1
    for group in priority_groups:
        if any(c in weak_criterion_names for c in group["criteria"]):
            if group["stage_name"] not in used_topics:
                stages.append({
                    "stage_name": group["stage_name"],
                    "stage_order": order,
                    "focus_area": group["focus_area"],
                })
                used_topics.add(group["stage_name"])
                order += 1

    # If we ended up with fewer than 3 stages, add a general one
    if len(stages) < 3:
        stages.append({
            "stage_name": f"Advanced {track_name} Mastery",
            "stage_order": order,
            "focus_area": (
                f"This stage consolidates remaining gaps in your {track_name} knowledge. "
                "You will work on advanced topics specific to this track. "
                "Focus on integrating all skills learned in previous stages into complete solutions. "
                "After this stage, you should be able to confidently tackle senior-level challenges."
            ),
        })

    # Ensure stage orders are sequential
    for i, stage in enumerate(stages, start=1):
        stage["stage_order"] = i

    return stages[:5]  # Max 5 stages


def _fallback_stages(track_name: str, detected_level: str) -> List[Dict]:
    """Minimal fallback when no Q&A data is available."""
    mapping = {
        "beginner": [
            ("Foundations of " + track_name, "Build fundamental knowledge and core concepts for " + track_name + "."),
            ("Core Skills Development", "Develop essential skills through hands-on practice and guided exercises."),
            ("Applied Projects", "Apply learned skills to real-world mini-projects to reinforce understanding."),
        ],
        "intermediate": [
            ("Advanced Concepts", "Deepen understanding of advanced topics and patterns in " + track_name + "."),
            ("Real-world Application", "Apply skills to production-level scenarios and industry best practices."),
            ("Complex Problem Solving", "Tackle complex, multi-step problems that require integrated thinking."),
        ],
        "advanced": [
            ("Expert Patterns & Architecture", "Master advanced patterns, architecture decisions, and trade-off reasoning."),
            ("System Design & Scalability", "Design scalable, fault-tolerant systems for production environments."),
            ("Technical Leadership", "Develop leadership skills: mentoring, decision-making, and ownership."),
        ],
    }
    level_stages = mapping.get(detected_level, mapping["intermediate"])
    return [
        {"stage_name": name, "stage_order": i + 1, "focus_area": focus}
        for i, (name, focus) in enumerate(level_stages)
    ]


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------


def _validate_stages(stages: List[Dict]) -> List[Dict]:
    """Ensure every stage has valid required fields; fix or drop invalid ones."""
    valid = []
    for i, stage in enumerate(stages):
        name = stage.get("stage_name", "").strip()
        focus = stage.get("focus_area", "").strip()
        if not name or not focus:
            continue
        # Enforce name length limit
        if len(name) > 80:
            name = name[:77] + "..."
        valid.append({
            "stage_name": name,
            "stage_order": i + 1,  # Always sequential regardless of AI output
            "focus_area": focus,
        })

    if not valid:
        return _fallback_stages("the track", "intermediate")

    # Enforce min 3 / max 5
    return valid[:5]
