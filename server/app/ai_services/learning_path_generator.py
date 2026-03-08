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
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = """You are an expert learning path designer who creates TRACK-SPECIFIC learning stages.

===== CRITICAL: TRACK ANCHOR =====
The candidate chose the track: **{track_name}**
EVERY stage MUST teach skills, concepts, and tools SPECIFIC to {track_name}.
Do NOT create generic stages (e.g. "Systems Thinking", "Problem Solving", "Engineering Fundamentals").
Instead, create stages that are clearly about {track_name} (e.g. "{track_name} Fundamentals", "{track_name} Best Practices", "{track_name} Error Handling & Debugging").

===== CONTEXT =====
Track     : {track_name}
Level     : {detected_level}

===== ASSESSMENT PERFORMANCE =====
The candidate answered {question_count} questions. Here is the detailed breakdown:

{qa_block}
{focus_areas_hint_block}

===== YOUR TASK =====
1. Analyze the answers and identify the candidate's SPECIFIC weaknesses and gaps.
2. Create exactly 5 focused learning stages (no more, no fewer).
3. Order stages from most critical gap to least critical (stage_order 1 = highest priority).
4. Each stage MUST:
   - Have a stage_name that INCLUDES or clearly relates to {track_name} (e.g. "Python Async & Concurrency", "React State Management", "Full Stack API Design")
   - Have a detailed focus_area that explains:
     * What {track_name}-specific gap this stage addresses
     * Which questions revealed this gap
     * What concrete {track_name} skills the candidate will learn
5. Base stages ONLY on actual gaps found in the answers. Do not invent problems.
6. If the candidate performed well in an area, do not create a stage for it.
7. NEVER use generic stage names like "Technical Communication", "Senior Engineering Mindset", "Problem Solving" — always tie to {track_name}.

===== EXAMPLES (for track "Python") =====
GOOD: "Python Error Handling & Exceptions", "Python Async & Concurrency", "Python Testing & Debugging", "Python Data Structures & Algorithms", "Python API Design"
BAD:  "Error Handling Mastery", "Systems Thinking", "Technical Communication", "Engineering Fundamentals"

===== RULES =====
- Return ONLY valid JSON — no markdown fences, no extra text.
- stage_order must start at 1 and increment by 1.
- stage_name must be under 60 characters and MUST reference {track_name} or its core concepts.
- focus_area must be 2-4 sentences, specific to {track_name}, and actionable.
- Exactly 5 stages (always return 5).

===== REQUIRED OUTPUT FORMAT =====
{{
  "stages": [
    {{
      "stage_name": "<string under 60 chars, must be {track_name}-specific>",
      "stage_order": <int starting at 1>,
      "focus_area": "<2-4 sentences specific to {track_name} and the gaps identified>"
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


def _build_focus_areas_hint(focus_areas: Optional[List[str]], track_name: str = "") -> str:
    """Build prompt block when comprehensive report provides focus areas."""
    if not focus_areas:
        return ""
    areas = ", ".join(focus_areas)
    track_note = f" IMPORTANT: Frame each stage within the {track_name} track — stage names must include or clearly relate to {track_name}." if track_name else ""
    return f"""
===== PREFERRED FOCUS AREAS (from comprehensive assessment report) =====
Use these as the primary focus for your stages. Align stage names and focus_area with:
{areas}
{track_note}
"""


async def generate_learning_path_stages(
    track_name: str,
    detected_level: str,
    questions_and_answers: List[Dict],
    focus_areas_hint: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Generate personalized learning path stages from assessment Q&A context.

    When focus_areas_hint is provided (from comprehensive report), stages align with those areas.

    Mock mode  : Returns plausible stages derived from weak criteria scores
                 without any API call.
    Real mode  : Calls OpenAI GPT-4o-mini and parses the structured JSON response.
    Falls back to mock on any network or parse error.
    """
    if not questions_and_answers:
        return _fallback_stages(track_name, detected_level)

    if USE_MOCK_AI:
        return _mock_stages(track_name, detected_level, questions_and_answers, focus_areas_hint)

    return await _ai_stages(track_name, detected_level, questions_and_answers, focus_areas_hint)


# ---------------------------------------------------------------------------
# Real AI path
# ---------------------------------------------------------------------------


async def _ai_stages(
    track_name: str,
    detected_level: str,
    questions_and_answers: List[Dict],
    focus_areas_hint: Optional[List[str]] = None,
) -> List[Dict]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_stages(track_name, detected_level, questions_and_answers, focus_areas_hint)

    qa_block = _build_qa_block(questions_and_answers)
    focus_areas_hint_block = _build_focus_areas_hint(focus_areas_hint, track_name)
    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        detected_level=detected_level,
        question_count=len(questions_and_answers),
        qa_block=qa_block,
        focus_areas_hint_block=focus_areas_hint_block,
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a learning path designer. Every stage you create MUST be specific to the track the user chose. "
                "Never output generic stages like 'Systems Thinking' or 'Problem Solving' — always tie stages to the track (e.g. 'Python Async', 'React State Management'). "
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
        return _mock_stages(track_name, detected_level, questions_and_answers, focus_areas_hint)


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
    focus_areas_hint: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Derive stages from actual weak criteria scores across all answers.
    When focus_areas_hint is provided, use those as stage names (from comprehensive report).
    """
    # If comprehensive report provided focus areas, use them (ensure track-specific; pad to 5 if needed)
    if focus_areas_hint and len(focus_areas_hint) >= 3:
        fallback = _fallback_stages(track_name, detected_level)
        stages = []
        for i, name in enumerate(focus_areas_hint[:5]):
            # Ensure stage name references track if it doesn't already
            stage_name = name[:60].strip()
            if track_name.lower() not in stage_name.lower():
                stage_name = f"{track_name}: {stage_name}"[:60]
            stages.append({
                "stage_name": stage_name,
                "stage_order": i + 1,
                "focus_area": f"Focus on {name} within {track_name} based on your assessment gaps. Complete this stage to strengthen your {track_name} skills.",
            })
        # Pad to exactly 5 stages using fallback if needed
        while len(stages) < 5:
            idx = len(stages)
            stages.append({
                "stage_name": fallback[idx]["stage_name"],
                "stage_order": idx + 1,
                "focus_area": fallback[idx]["focus_area"],
            })
        for i, s in enumerate(stages, start=1):
            s["stage_order"] = i
        return stages[:5]

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

    # Priority groups: each maps weak criteria to TRACK-SPECIFIC stage names and focus
    priority_groups = [
        # Group 1: Scalability + Failure
        {
            "criteria": ["scalability_awareness", "failure_handling"],
            "stage_name": f"{track_name} Scalability & Error Handling",
            "focus_area": (
                f"This stage addresses gaps in scalability and failure handling within {track_name}. "
                f"You will learn {track_name}-specific patterns for handling growth, load balancing, caching, and fault tolerance. "
                f"Focus on resilient design and error recovery in {track_name} applications. "
                f"After completing this stage, you should be able to build scalable, fault-tolerant {track_name} solutions."
            ),
        },
        # Group 2: Technical Depth + Practicality
        {
            "criteria": ["technical_depth", "practicality"],
            "stage_name": f"{track_name} Best Practices & Implementation",
            "focus_area": (
                f"This stage targets gaps in technical depth and practical {track_name} skills. "
                f"You will strengthen your understanding of {track_name} patterns, code quality, testing, and production-ready code. "
                f"Focus on real-world implementation and industry standards for {track_name}. "
                f"After this stage, you should be able to write deep, practical {track_name} solutions."
            ),
        },
        # Group 3: Problem Understanding + Structured Thinking
        {
            "criteria": ["problem_understanding", "structured_thinking"],
            "stage_name": f"Problem Solving with {track_name}",
            "focus_area": (
                f"This stage addresses gaps in problem decomposition when working with {track_name}. "
                f"You will practice breaking down complex problems and designing {track_name} solutions systematically. "
                f"Focus on algorithmic thinking, architecture, and solution planning in {track_name} context. "
                f"After this stage, you should approach {track_name} problems with clarity and structure."
            ),
        },
        # Group 4: Tradeoff Reasoning + Engineering Maturity
        {
            "criteria": ["tradeoff_reasoning", "engineering_maturity"],
            "stage_name": f"{track_name} Architecture & Design Decisions",
            "focus_area": (
                f"This stage addresses gaps in design decisions and tradeoffs within {track_name}. "
                f"You will learn to evaluate {track_name} architecture choices, weigh pros and cons, and manage tech debt. "
                f"Focus on pragmatic {track_name} engineering and ownership of design decisions. "
                f"After this stage, you should make informed {track_name} architecture decisions."
            ),
        },
        # Group 5: Communication Clarity
        {
            "criteria": ["communication_clarity"],
            "stage_name": f"{track_name} Documentation & Code Clarity",
            "focus_area": (
                f"This stage targets gaps in explaining {track_name} concepts clearly. "
                f"You will learn to document {track_name} code, write clear technical explanations, and communicate design decisions. "
                f"Focus on READMEs, API docs, and explaining {track_name} solutions to others. "
                f"After this stage, you should communicate {track_name} ideas effectively."
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

    # Pad to exactly 5 stages using fallback if needed
    fallback = _fallback_stages(track_name, detected_level)
    while len(stages) < 5:
        idx = len(stages)
        stages.append({
            "stage_name": fallback[idx]["stage_name"],
            "stage_order": order,
            "focus_area": fallback[idx]["focus_area"],
        })
        order += 1

    # Ensure stage orders are sequential
    for i, stage in enumerate(stages, start=1):
        stage["stage_order"] = i

    return stages[:5]  # Exactly 5 stages


def _fallback_stages(track_name: str, detected_level: str) -> List[Dict]:
    """Fallback when no Q&A data is available. Always returns exactly 5 TRACK-SPECIFIC stages."""
    mapping = {
        "beginner": [
            (f"Foundations of {track_name}", f"Build fundamental knowledge and core concepts for {track_name}."),
            (f"Core {track_name} Skills", f"Develop essential {track_name} skills through hands-on practice and guided exercises."),
            (f"Applied {track_name} Projects", f"Apply {track_name} skills to real-world mini-projects to reinforce understanding."),
            (f"Intermediate {track_name} Concepts", f"Deepen understanding of key patterns and best practices in {track_name}."),
            (f"Advanced {track_name} Integration", f"Integrate all {track_name} skills into complete, production-ready solutions."),
        ],
        "intermediate": [
            (f"Advanced {track_name} Concepts", f"Deepen understanding of advanced topics and patterns in {track_name}."),
            (f"Real-world {track_name} Application", f"Apply {track_name} skills to production-level scenarios and industry best practices."),
            (f"Complex Problem Solving with {track_name}", f"Tackle complex, multi-step problems using {track_name}."),
            (f"{track_name} System Design", f"Design scalable, maintainable systems with clear {track_name} architecture."),
            (f"{track_name} Best Practices & Ownership", f"Develop ownership and decision-making for {track_name} projects."),
        ],
        "advanced": [
            (f"Expert {track_name} Patterns & Architecture", f"Master advanced patterns and architecture decisions in {track_name}."),
            (f"{track_name} System Design & Scalability", f"Design scalable, fault-tolerant {track_name} systems for production."),
            (f"{track_name} Technical Leadership", f"Develop leadership skills for {track_name} teams and projects."),
            (f"{track_name} Observability & Performance", f"Master observability, security, and performance in {track_name}."),
            (f"{track_name} Industry Best Practices", f"Apply and evangelize {track_name} best practices across teams."),
        ],
    }
    level_stages = mapping.get(detected_level, mapping["intermediate"])
    return [
        {"stage_name": name, "stage_order": i + 1, "focus_area": focus}
        for i, (name, focus) in enumerate(level_stages[:5])
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

    # Pad to exactly 5 stages if we have fewer
    result = valid[:5]
    if len(result) < 5:
        fallback = _fallback_stages("the track", "intermediate")
        for i in range(len(result), 5):
            result.append({
                "stage_name": fallback[i]["stage_name"],
                "stage_order": i + 1,
                "focus_area": fallback[i]["focus_area"],
            })
        for i, s in enumerate(result, start=1):
            s["stage_order"] = i
    return result
