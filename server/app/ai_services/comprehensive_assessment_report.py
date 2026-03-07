"""
Comprehensive Assessment Report Generator
-----------------------------------------
Single responsibility: given ALL questions and answers from a completed assessment,
send the full context to the AI and receive a comprehensive report.

This report is designed for:
  - Display to the user (executive summary, strengths, weaknesses)
  - Content generation (learning path stages, stage content, etc.)

Public interface:

    from app.ai_services.comprehensive_assessment_report import generate_comprehensive_report

    report = await generate_comprehensive_report(
        track_name="LLM Engineering",
        questions_and_answers=[...],  # all 10 with full context
    )

Returns:
    {
        "executive_summary": "...",
        "overall_assessment": "...",
        "strengths": [...],
        "weaknesses": [...],
        "dimension_breakdown": [...],
        "learning_priorities": [...],
        "content_generation_context": {...}
    }
"""

import json
import os
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"


def _build_qa_block(questions_and_answers: List[Dict]) -> str:
    """Format all Q&A into a detailed block for the AI prompt."""
    lines = []
    for i, qa in enumerate(questions_and_answers, start=1):
        criteria = qa.get("criteria_scores", {}) or {}
        weak = [
            f"{k.replace('_', ' ')} ({int(v)})"
            for k, v in criteria.items()
            if isinstance(v, (int, float)) and v <= 5
        ]
        strong = [
            f"{k.replace('_', ' ')} ({int(v)})"
            for k, v in criteria.items()
            if isinstance(v, (int, float)) and v >= 8
        ]

        lines.append(f"===== Question {i} =====")
        lines.append(f"Dimension    : {qa.get('dimension', 'General')}")
        lines.append(f"Question     : {qa.get('question_text', '')}")
        lines.append(f"Candidate Ans : {qa.get('user_answer', '')}")
        lines.append(f"Score        : {qa.get('final_score', 0):.2f} / 1.0")
        if weak:
            lines.append(f"Weak criteria : {', '.join(weak)}")
        if strong:
            lines.append(f"Strong criteria: {', '.join(strong)}")
        lines.append(f"Evaluator note: {qa.get('ai_explanation', '')}")
        lines.append("")
    return "\n".join(lines)


_PROMPT_TEMPLATE = """You are an expert technical assessor and learning designer. Your task is to produce a COMPREHENSIVE assessment report based on the full Q&A data below.

This report will be used to:
1. Show the candidate a clear picture of their performance
2. Generate personalized learning content (stages, materials, exercises)

===== CONTEXT =====
Track: {track_name}
Total questions: {question_count}

===== FULL ASSESSMENT DATA =====
Every question, the candidate's answer, per-criterion scores, and evaluator notes:

{qa_block}

===== YOUR TASK =====
Analyze ALL the data above and produce a comprehensive report. Be specific: reference actual questions, answers, and scores. Do not genericize.

1. **Executive Summary** (2-4 sentences): Overall assessment, key takeaway, readiness level.
2. **Strengths**: Areas where the candidate performed well. For each: area name, specific evidence from their answers, which questions showed this.
3. **Weaknesses**: Gaps and areas to improve. For each: area name, what was missing or incorrect, which questions revealed it, priority (high/medium/low), and a concrete recommendation.
4. **Dimension Breakdown**: For each dimension that had questions: dimension name, average performance, brief analysis, specific gaps if any.
5. **Learning Priorities**: Ordered list of 3-5 topics/skills to focus on first, with brief rationale.
6. **Content Generation Context**: Structured hints for downstream content generation:
   - key_topics: list of specific topics to create content for
   - recommended_difficulty: beginner/intermediate/advanced
   - gap_severity: mild/moderate/significant (how big are the gaps)
   - focus_areas_for_stages: list of 3-5 focus area names for learning stages

===== RULES =====
- Base everything on the actual data. Do not invent strengths or weaknesses.
- Be specific: cite question numbers, quote or paraphrase the candidate's answers.
- The report must be actionable for content generation.
- Return ONLY valid JSON — no markdown fences, no extra text.

===== REQUIRED OUTPUT FORMAT =====
{{
  "executive_summary": "<2-4 sentences>",
  "overall_assessment": "<2-3 paragraphs: detailed analysis>",
  "strengths": [
    {{
      "area": "<string>",
      "evidence": "<specific evidence from answers>",
      "question_indices": [1, 3, 5]
    }}
  ],
  "weaknesses": [
    {{
      "area": "<string>",
      "evidence": "<what was missing or incorrect>",
      "question_indices": [2, 4],
      "priority": "high|medium|low",
      "recommendation": "<concrete next step>"
    }}
  ],
  "dimension_breakdown": [
    {{
      "dimension": "<string>",
      "score": <float 0-1>,
      "analysis": "<brief analysis>",
      "gaps": ["<gap1>", "<gap2>"]
    }}
  ],
  "learning_priorities": [
    {{
      "topic": "<string>",
      "rationale": "<why this first>"
    }}
  ],
  "content_generation_context": {{
    "key_topics": ["<topic1>", "<topic2>"],
    "recommended_difficulty": "beginner|intermediate|advanced",
    "gap_severity": "mild|moderate|significant",
    "focus_areas_for_stages": ["<area1>", "<area2>", "<area3>"]
  }}
}}
"""


async def generate_comprehensive_report(
    track_name: str,
    questions_and_answers: List[Dict],
    overall_score: float,
    detected_level: str,
) -> Dict[str, Any]:
    """
    Send all Q&A data to the AI and get a comprehensive report.

    Mock mode: Returns a structured mock report.
    Real mode: Calls the AI provider and parses the JSON response.
    """
    if not questions_and_answers:
        return _fallback_report(overall_score, detected_level)

    if USE_MOCK_AI:
        return _mock_report(track_name, questions_and_answers, overall_score, detected_level)

    return await _ai_report(track_name, questions_and_answers, overall_score, detected_level)


async def _ai_report(
    track_name: str,
    questions_and_answers: List[Dict],
    overall_score: float,
    detected_level: str,
) -> Dict[str, Any]:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_report(track_name, questions_and_answers, overall_score, detected_level)

    qa_block = _build_qa_block(questions_and_answers)
    prompt = _PROMPT_TEMPLATE.format(
        track_name=track_name,
        question_count=len(questions_and_answers),
        qa_block=qa_block,
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert technical assessor. "
                "Reply with valid JSON only — no markdown fences, no commentary."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.3, timeout=90.0)
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        result = json.loads(raw)
        return _validate_report(result, overall_score, detected_level)
    except Exception:
        return _mock_report(track_name, questions_and_answers, overall_score, detected_level)


def _validate_report(raw: Dict, overall_score: float, detected_level: str) -> Dict[str, Any]:
    """Ensure required keys exist and have sensible values."""
    report: Dict[str, Any] = {
        "executive_summary": str(raw.get("executive_summary", "")) or f"Overall score: {overall_score:.1f}%. Detected level: {detected_level}.",
        "overall_assessment": str(raw.get("overall_assessment", "")) or "",
        "strengths": raw.get("strengths") if isinstance(raw.get("strengths"), list) else [],
        "weaknesses": raw.get("weaknesses") if isinstance(raw.get("weaknesses"), list) else [],
        "dimension_breakdown": raw.get("dimension_breakdown") if isinstance(raw.get("dimension_breakdown"), list) else [],
        "learning_priorities": raw.get("learning_priorities") if isinstance(raw.get("learning_priorities"), list) else [],
        "content_generation_context": raw.get("content_generation_context")
        if isinstance(raw.get("content_generation_context"), dict)
        else {},
    }
    ctx = report["content_generation_context"]
    if "key_topics" not in ctx or not isinstance(ctx["key_topics"], list):
        ctx["key_topics"] = []
    if "recommended_difficulty" not in ctx:
        ctx["recommended_difficulty"] = detected_level
    if "gap_severity" not in ctx:
        ctx["gap_severity"] = "moderate"
    if "focus_areas_for_stages" not in ctx or not isinstance(ctx["focus_areas_for_stages"], list):
        ctx["focus_areas_for_stages"] = []
    return report


def _mock_report(
    track_name: str,
    questions_and_answers: List[Dict],
    overall_score: float,
    detected_level: str,
) -> Dict[str, Any]:
    """Build a plausible comprehensive report from the Q&A data without AI."""
    criteria_totals: Dict[str, List[float]] = {}
    for qa in questions_and_answers:
        scores = qa.get("criteria_scores", {}) or {}
        for k, v in scores.items():
            if isinstance(v, (int, float)):
                if k not in criteria_totals:
                    criteria_totals[k] = []
                criteria_totals[k].append(float(v))

    criteria_avg = {k: sum(v) / len(v) for k, v in criteria_totals.items() if v}
    weak_areas = [k.replace("_", " ") for k, v in criteria_avg.items() if v < 6]
    strong_areas = [k.replace("_", " ") for k, v in criteria_avg.items() if v >= 7]

    executive_summary = (
        f"Based on {len(questions_and_answers)} questions, the candidate scored {overall_score:.1f}% "
        f"and demonstrates {detected_level}-level understanding in {track_name}. "
    )
    if strong_areas:
        executive_summary += f"Strengths include {', '.join(strong_areas[:3])}. "
    if weak_areas:
        executive_summary += f"Key areas to improve: {', '.join(weak_areas[:3])}."

    return {
        "executive_summary": executive_summary,
        "overall_assessment": (
            f"Detailed analysis of {len(questions_and_answers)} responses across multiple dimensions. "
            f"The weighted average score of {overall_score:.1f}% indicates {detected_level} proficiency. "
            "This report will drive personalized learning content generation."
        ),
        "strengths": [
            {"area": a, "evidence": f"Strong performance in assessment.", "question_indices": [1, 2, 3]}
            for a in (strong_areas[:3] or ["General understanding"])
        ],
        "weaknesses": [
            {
                "area": a,
                "evidence": "Gaps identified in assessment responses.",
                "question_indices": [4, 5, 6],
                "priority": "high" if i == 0 else "medium",
                "recommendation": f"Focus on {a} through targeted practice and examples.",
            }
            for i, a in enumerate(weak_areas[:3] or ["Depth of analysis"])
        ],
        "dimension_breakdown": [
            {
                "dimension": k.replace("_", " ").title(),
                "score": round(v, 2),
                "analysis": f"Average score {v:.2f}.",
                "gaps": [] if v >= 6 else [f"Improve {k.replace('_', ' ')}"],
            }
            for k, v in list(criteria_avg.items())[:5]
        ],
        "learning_priorities": [
            {"topic": a, "rationale": "Identified as a gap in assessment."}
            for a in (weak_areas[:4] or ["Core concepts"])
        ],
        "content_generation_context": {
            "key_topics": weak_areas[:5] or ["Fundamentals"],
            "recommended_difficulty": detected_level,
            "gap_severity": "significant" if overall_score < 50 else "moderate" if overall_score < 70 else "mild",
            "focus_areas_for_stages": weak_areas[:5] or ["Core Skills"],
        },
    }


def _fallback_report(overall_score: float, detected_level: str) -> Dict[str, Any]:
    """Minimal report when no Q&A data is available."""
    return {
        "executive_summary": f"Score: {overall_score:.1f}%. Level: {detected_level}. No detailed Q&A data available.",
        "overall_assessment": "",
        "strengths": [],
        "weaknesses": [],
        "dimension_breakdown": [],
        "learning_priorities": [],
        "content_generation_context": {
            "key_topics": [],
            "recommended_difficulty": detected_level,
            "gap_severity": "moderate",
            "focus_areas_for_stages": [],
        },
    }
