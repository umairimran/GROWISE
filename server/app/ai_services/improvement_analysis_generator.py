"""
Improvement Analysis Generator
==============================
Generates a detailed, context-rich "before vs after" narrative for the Progress Analysis page.

BEFORE = Initial state: assessment questions the user saw and the responses they gave
        (precursor — before the candidate came to the platform / before the path).

AFTER  = After completing the assessment, personalized path, and all stages:
         stages, content summary, user inputs during the path, and the evaluation
         chatbot conversation + evaluation scores and feedback.

Output: Either long markdown (generate_detailed_analysis) or structured JSON for
        dashboard visuals (generate_structured_report). The structured report is
        saved in progress_analysis_reports and used for stat cards, story sections, etc.
"""

import json
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"

# ---------------------------------------------------------------------------
# Structured report schema (for dashboard + story UI)
# ---------------------------------------------------------------------------
# headline: str
# summary: str
# dashboard_metrics: [ { id, label, value, unit, type, trend, before_value?, after_value?, subtitle? } ]
# story_sections: [ { id, step_number, title, type, content } ]
# before_summary: { overall_score, level, strengths[], gaps[], highlight_quotes[] }
# after_summary: { reasoning_score, problem_solving_score, readiness_level, improvements[], sustained_gaps[] }


def _format_before_block(before_context: Dict[str, Any]) -> str:
    """Format initial assessment (before) for the prompt."""
    parts = []
    parts.append("=== BEFORE: INITIAL ASSESSMENT (before the candidate engaged with the platform) ===\n")
    score = before_context.get("score")
    level = before_context.get("level", "")
    parts.append(f"Overall score: {score:.1f}%" if score is not None else "Overall score: N/A")
    parts.append(f"Detected level: {level}\n")

    qa = before_context.get("questions_and_answers") or []
    parts.append("Questions they saw and how they answered (with evaluator scores and notes):\n")
    for i, item in enumerate(qa, 1):
        q = item.get("question_text", "")
        a = (item.get("user_answer") or "").strip()
        score_val = item.get("score")
        dim = item.get("dimension", "")
        expl = (item.get("ai_explanation") or "").strip()
        parts.append(f"  [{dim}] Q{i}: {q}")
        parts.append(f"  Their answer: {a}")
        parts.append(f"  Score: {score_val:.2f}/1.0" if score_val is not None else "  Score: N/A")
        if expl:
            parts.append(f"  Evaluator note: {expl}")
        parts.append("")
    return "\n".join(parts)


def _format_after_block(after_context: Dict[str, Any]) -> str:
    """Format path completion + evaluation (after) for the prompt."""
    parts = []
    parts.append("=== AFTER: STATE AFTER COMPLETING THE LEARNING PATH AND AI EVALUATION ===\n")
    track = (after_context.get("track_name") or "").strip()
    if track:
        parts.append(f"TRACK (this report is for): {track}\n")

    scores = after_context.get("evaluation_scores") or {}
    reasoning = scores.get("reasoning_score")
    problem_solving = scores.get("problem_solving")
    readiness = after_context.get("readiness_level", "")
    parts.append(f"Evaluation interview scores: Reasoning {reasoning:.1f}%, Problem solving {problem_solving:.1f}%"
                 if reasoning is not None and problem_solving is not None
                 else "Evaluation scores: N/A")
    parts.append(f"Readiness level: {readiness}\n")

    learning_summary = (after_context.get("learning_summary") or "").strip()
    if learning_summary:
        parts.append("Learning summary (from path completion):")
        parts.append(learning_summary)
        parts.append("")

    stages = after_context.get("stages_summary") or []
    if stages:
        parts.append("Stages completed (with content consumed):")
        for s in stages:
            name = s.get("stage_name", "")
            focus = (s.get("focus_area") or "")[:200]
            content_titles = s.get("content_titles") or []
            parts.append(f"  - {name} | Focus: {focus}")
            for title in content_titles[:8]:
                parts.append(f"    · {title}")
        parts.append("")

    content_summary = after_context.get("content_summary") or ""
    if content_summary:
        parts.append("Content summary (what they studied):")
        parts.append(content_summary[:1500])
        parts.append("")

    dialogue = after_context.get("dialogue_transcript") or []
    if dialogue:
        parts.append("Full evaluation interview transcript (AI interviewer ↔ candidate):")
        for d in dialogue:
            speaker = d.get("speaker", "")
            text = (d.get("text", "") or "").strip()
            label = "Interviewer" if speaker == "ai" else "Candidate"
            parts.append(f"  {label}: {text}")
        parts.append("")

    return "\n".join(parts)


_SYSTEM_PROMPT = """You are an expert learning coach. You will receive structured data about a candidate's journey:

1. BEFORE: Their initial assessment — the exact questions they saw, their answers, per-question scores, and evaluator notes. This is their state *before* they went through the platform's learning path.

2. AFTER: What they did (stages completed, content studied, learning summary) and the outcome of their AI evaluation interview: scores, readiness level, and the full conversation with the AI interviewer.

Your task: Write a detailed, context-rich progress analysis in markdown. Be specific and quote their words where it helps. Structure your response as follows:

## 1. Where They Started (Before the Platform)
Summarize their initial state: overall score and level, then go through their assessment answers. Highlight clear strengths and gaps. Reference specific questions and their answers. Use the evaluator notes to explain what was weak or strong. This section should make the reader understand exactly where the candidate was at the start.

## 2. What They Did (The Learning Path)
Summarize what they completed: the stages, the content they consumed, and the learning summary. This is the "journey" — what they studied and engaged with between the initial assessment and the evaluation interview.

## 3. The Evaluation Interview
Briefly summarize the AI interview: the kinds of scenarios discussed and how the candidate responded (use the transcript). Then state the evaluation outcome: reasoning score, problem-solving score, and readiness level.

## 4. Where They Are Now (After Completing the Path)
Interpret the "after" state in light of the before state. What improved? What patterns from their initial answers reappear or change in the interview? Be concrete. If something did not improve, say so and tie it to the data (e.g. a weak area in the assessment that still showed up in the interview).

## 5. Overall Progression
A short closing that ties before and after together: a clear, honest summary of their progression. No generic fluff — only conclusions supported by the data you were given.

Rules:
- Use only the data provided. Do not invent facts.
- Write in clear, professional markdown. Use headings, bullets, and short paragraphs.
- Length: aim for a thorough 4–6 sections that a candidate would find genuinely useful (roughly 600–1200 words).
- Be fair: acknowledge progress where it exists and gaps where they remain."""


async def generate_detailed_analysis(
    before_context: Dict[str, Any],
    after_context: Dict[str, Any],
) -> str:
    """
    Generate a detailed before/after progress analysis from structured context.

    before_context: {
        "score": float (0-100),
        "level": str,
        "questions_and_answers": [{"question_text", "user_answer", "score", "dimension", "ai_explanation"}]
    }
    after_context: {
        "evaluation_scores": {"reasoning_score", "problem_solving"},
        "readiness_level": str,
        "learning_summary": str (optional),
        "stages_summary": [{"stage_name", "focus_area", "content_titles"}],
        "content_summary": str (optional),
        "dialogue_transcript": [{"speaker", "text"}]
    }

    Returns a long markdown string (detailed analysis).
    """
    if USE_MOCK_AI:
        return _mock_detailed_analysis(before_context, after_context)

    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_detailed_analysis(before_context, after_context)

    before_block = _format_before_block(before_context)
    after_block = _format_after_block(after_context)

    user_content = (
        before_block + "\n\n" + after_block + "\n\n"
        "=== YOUR TASK ===\n"
        "Write the detailed progress analysis as specified in the system prompt. "
        "Output only the markdown document, no meta-commentary."
    )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.3, timeout=90.0)
        return (raw or "").strip() or _mock_detailed_analysis(before_context, after_context)
    except Exception:
        return _mock_detailed_analysis(before_context, after_context)


def _mock_detailed_analysis(before_context: Dict[str, Any], after_context: Dict[str, Any]) -> str:
    """Mock: produce a structured before/after narrative from the same data."""
    before_score = before_context.get("score")
    before_level = (before_context.get("level") or "").replace("_", " ").title()
    qa = before_context.get("questions_and_answers") or []

    reasoning = None
    problem_solving = None
    readiness = after_context.get("readiness_level", "")
    scores = after_context.get("evaluation_scores") or {}
    if scores:
        reasoning = scores.get("reasoning_score")
        problem_solving = scores.get("problem_solving")

    lines = [
        "## 1. Where They Started (Before the Platform)",
        "",
        f"The candidate began with an initial assessment overall score of **{before_score:.1f}%** and a detected level of **{before_level}**.",
        "",
        "**Assessment answers (summary):**",
        "",
    ]
    for i, item in enumerate(qa[:6], 1):
        q = (item.get("question_text") or "")[:120]
        a = (item.get("user_answer") or "").strip()[:200]
        sc = item.get("score")
        dim = item.get("dimension", "")
        lines.append(f"- **Q{i}** [{dim}] {q}...")
        lines.append(f"  - Their answer: {a}" + ("..." if len((item.get("user_answer") or "")) > 200 else ""))
        lines.append(f"  - Score: {sc:.2f}/1.0" if sc is not None else "  - Score: N/A")
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. What They Did (The Learning Path)")
    lines.append("")
    stages = after_context.get("stages_summary") or []
    if stages:
        for s in stages:
            name = s.get("stage_name", "")
            titles = s.get("content_titles") or []
            lines.append(f"- **{name}**: " + ", ".join(titles[:5]) + ("..." if len(titles) > 5 else ""))
        lines.append("")
    learning_summary = (after_context.get("learning_summary") or "").strip()
    if learning_summary:
        lines.append(learning_summary[:500] + ("..." if len(learning_summary) > 500 else ""))
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 3. The Evaluation Interview")
    lines.append("")
    dialogue = after_context.get("dialogue_transcript") or []
    if dialogue:
        lines.append("The candidate completed an AI interviewer conversation. Excerpt:")
        for d in dialogue[:6]:
            speaker = d.get("speaker", "")
            text = (d.get("text", "") or "").strip()[:150]
            label = "Interviewer" if speaker == "ai" else "Candidate"
            lines.append(f"- **{label}**: {text}" + ("..." if len((d.get("text") or "")) > 150 else ""))
        lines.append("")
    lines.append(f"**Outcome:** Reasoning {reasoning:.1f}%, Problem solving {problem_solving:.1f}%, Readiness: **{readiness.replace('_', ' ').title()}**."
        if reasoning is not None and problem_solving is not None else "**Outcome:** See evaluation scores above.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 4. Where They Are Now (After Completing the Path)")
    lines.append("")
    lines.append(f"After the learning path and the evaluation interview, the candidate's readiness is **{readiness.replace('_', ' ').title()}** "
        + (f"with reasoning {reasoning:.1f}% and problem-solving {problem_solving:.1f}%." if reasoning is not None else "")
        + " Compare their initial assessment answers above with their interview responses to see continuity or change.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 5. Overall Progression")
    lines.append("")
    lines.append(f"Before: {before_score:.1f}% (assessment), {before_level}. "
        + (f"After: Reasoning {reasoning:.1f}%, Problem solving {problem_solving:.1f}%, {readiness.replace('_', ' ').title()}."
            if reasoning is not None and problem_solving is not None else "After: See evaluation section.")
        + " This report is generated from the stored assessment, path completion, and interview data.")
    return "\n".join(lines)


# =============================================================================
# Structured report (JSON) for dashboard + story UI
# =============================================================================

_STRUCTURED_SYSTEM = """You are an expert learning coach and evaluator. You will receive:
- TRACK: The learning track the user chose (e.g. AI Agents, Full Stack Development). All narrative MUST be relevant to this track.
- BEFORE: Initial assessment — per-question dimension names, questions, answers, scores, evaluator notes. The dimension names (e.g. "Core AI Agent Concepts", "System Design") are track-specific; use them by name, not generic "reasoning" or "technical skills".
- AFTER: Stages and content they completed (stage names, focus areas, content titles), learning summary, and AI evaluation interview scores + transcript.

Your task: Return a single JSON object (no markdown, no code fence) that presents the user's progress as an AI EVALUATION report that is TRACK-SPECIFIC and tied to what they actually learned. Every claim must be justified by the data. Use this EXACT structure:

{
  "headline": "One short sentence: AI evaluation result for THIS TRACK (e.g. 'Your AI evaluation [Track name]: Beginner to Junior readiness').",
  "summary": "Two to four sentences. Name the TRACK. Say our AI evaluated their assessment, path, and interview. Then: where they started (use actual dimension names from the data), what they learned (name the stages or content areas), and where they are now. Tie stats to the track and what they studied.",
  "ai_summary": "Three to five sentences. Name the TRACK. Frame as the AI's evaluation. Reference the actual assessment dimensions (by name) and the stages/content they completed. Relate the evaluation scores to how they applied their [track] learning in the interview. No generic 'problem solving' or 'technical skills' without linking to the track dimensions or stage topics.",
  "current_standing": "Two to four sentences. Name the TRACK. State where they stand now; relate evaluation scores to their application of what they learned in this track. Give next steps that reference specific dimensions or stage topics from the data, not generic advice.",
  "dashboard_metrics": [
    {
      "id": "unique_snake_case_id",
      "label": "Display label (e.g. Initial Assessment Score)",
      "value": number or string,
      "unit": "%" or "" or "level",
      "type": "score" | "level" | "count" | "percent" | "text",
      "trend": "up" | "down" | "neutral",
      "before_value": number or null,
      "after_value": number or null,
      "subtitle": "MUST explain what this metric is (e.g. 'Initial assessment 0-100%' or 'Evaluation reasoning 0-100%') so comparisons are justified."
    }
  ],
  "story_sections": [
    {
      "id": "unique_id",
      "step_number": 1,
      "title": "Section title",
      "type": "before" | "journey" | "evaluation" | "after" | "conclusion",
      "content": "2-4 sentences or short markdown. Be specific: quote dimensions, scores, or their words. Only state what the data supports."
    }
  ],
  "before_summary": {
    "overall_score": number,
    "level": "string",
    "strengths": ["Use actual dimension names from the data, e.g. 'Core AI Agent Concepts: strong'"],
    "gaps": ["Use actual dimension names, e.g. 'System Design: needs work'"],
    "highlight_quotes": ["Optional quote from their answers"]
  },
  "after_summary": {
    "reasoning_score": number,
    "problem_solving_score": number,
    "readiness_level": "string",
    "improvements": ["Reference what they learned (stage names or dimensions) and how evaluation reflected it"],
    "sustained_gaps": ["Reference actual dimension names or stage topics from the data"]
  }
}

CRITICAL RULES:
- TRACK-SPECIFIC: Always name the track. Use the exact dimension names from the assessment (e.g. "Core AI Agent Concepts", "System Design") — never generic "reasoning" or "technical skills" for assessment feedback. Use the exact stage names and content titles they completed. Relate stats to the track and to what they learned.
- RELATE EVERYTHING: Connect assessment dimensions → stages/content they studied → evaluation outcome. Improvements and gaps must reference specific dimensions or stage topics from the data.
- Frame as AI evaluation: Use "our AI evaluation", "according to your evaluation", etc. Keep "Reasoning" and "Problem solving" only as the two evaluation score labels from the interview.
- story_sections: Exactly 4-6 sections. Name the track; use dimension and stage names; no generic phrasing. Use only the data provided."""


def _parse_structured_response(raw: str) -> Optional[Dict[str, Any]]:
    """Extract and validate structured JSON from AI response."""
    raw = (raw or "").strip()
    for start in ["{", "```json", "```"]:
        idx = raw.find(start)
        if idx >= 0:
            raw = raw[idx:].removeprefix("```json").removeprefix("```").strip()
            break
    end = raw.rfind("}")
    if end >= 0:
        raw = raw[: end + 1]
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        # Ensure required top-level keys
        data.setdefault("headline", "Progress report")
        data.setdefault("summary", "")
        data.setdefault("ai_summary", data.get("summary", ""))
        data.setdefault("current_standing", "")
        data.setdefault("dashboard_metrics", [])
        data.setdefault("story_sections", [])
        data.setdefault("before_summary", {})
        data.setdefault("after_summary", {})
        if not isinstance(data["dashboard_metrics"], list):
            data["dashboard_metrics"] = []
        if not isinstance(data["story_sections"], list):
            data["story_sections"] = []
        return data
    except (json.JSONDecodeError, TypeError):
        return None


async def generate_structured_report(
    before_context: Dict[str, Any],
    after_context: Dict[str, Any],
    track_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a structured JSON report for dashboard + story UI. Saved in DB as structured_report.
    track_name: The user's chosen track (e.g. AI Agents) — narrative must be relevant to this track.
    """
    if USE_MOCK_AI:
        return _mock_structured_report(before_context, after_context, track_name)

    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_structured_report(before_context, after_context, track_name)

    before_block = _format_before_block(before_context)
    after_block = _format_after_block(after_context)
    track_block = f"=== TRACK (use this in your narrative) ===\n{track_name or 'General'}\n\n"

    user_content = (
        track_block + before_block + "\n\n" + after_block + "\n\n"
        "=== YOUR TASK ===\n"
        "Return ONLY a single JSON object. Use the TRACK name. Use the actual dimension names from the before block and stage/content names from the after block. Relate everything to the track and the data. No markdown, no code block."
    )

    messages = [
        {"role": "system", "content": _STRUCTURED_SYSTEM},
        {"role": "user", "content": user_content},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.25, timeout=90.0)
        data = _parse_structured_response((raw or "").strip())
        if data:
            return data
    except Exception:
        pass
    return _mock_structured_report(before_context, after_context, track_name)


def _mock_structured_report(
    before_context: Dict[str, Any],
    after_context: Dict[str, Any],
    track_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Build structured report from context without AI. Track-specific and tied to dimensions/stages."""
    track = (track_name or "your track").strip()
    before_score = before_context.get("score") or 0
    before_level = (before_context.get("level") or "").replace("_", " ").title()
    qa = before_context.get("questions_and_answers") or []
    scores = after_context.get("evaluation_scores") or {}
    reasoning = scores.get("reasoning_score")
    problem_solving = scores.get("problem_solving")
    readiness = (after_context.get("readiness_level") or "").replace("_", " ").title()
    stages = after_context.get("stages_summary") or []
    stage_names = [s.get("stage_name") or "" for s in stages if s.get("stage_name")]
    after_composite = (
        (float(reasoning) + float(problem_solving)) / 2.0
        if reasoning is not None and problem_solving is not None
        else None
    )
    improvement_pct = (
        round(((after_composite - before_score) / max(float(before_score), 1.0)) * 100, 1)
        if after_composite is not None and before_score is not None else None
    )

    strengths = []
    gaps = []
    dimension_names = []
    for item in qa:
        sc = item.get("score")
        dim = (item.get("dimension") or "").strip()
        if dim and dim not in dimension_names:
            dimension_names.append(dim)
        if sc is not None:
            if sc >= 0.7:
                strengths.append(f"{dim or 'This area'}: strong ({(sc * 100):.0f}%)")
            elif sc < 0.5:
                gaps.append(f"{dim or 'This area'}: needs work ({(sc * 100):.0f}%)")
    dim_list = ", ".join(dimension_names[:6]) if dimension_names else "assessment dimensions"
    stages_list = ", ".join(stage_names[:4]) if stage_names else "the learning path"
    content_titles_flat = []
    for s in stages:
        for t in (s.get("content_titles") or []):
            if t and t.strip():
                content_titles_flat.append(t.strip())
    content_followed = content_titles_flat[:12]
    content_followed_str = ", ".join(content_followed) if content_followed else (stages_list or "path content")
    if content_followed and len(content_titles_flat) > 12:
        content_followed_str += f" (+{len(content_titles_flat) - 12} more)"

    eval_label = f" in {track}" if track else ""
    metrics = [
        {"id": "initial_score", "label": f"Initial assessment ({track})" if track else "Initial assessment", "value": round(before_score), "unit": "%", "type": "score", "trend": "neutral", "before_value": round(before_score), "after_value": None, "subtitle": f"Overall score before {track} path (0-100%)" if track else "Overall score before platform (0-100%)"},
        {"id": "reasoning", "label": f"Reasoning{eval_label}" if track else "Reasoning (evaluation)", "value": round(reasoning) if reasoning is not None else 0, "unit": "%", "type": "score", "trend": "neutral", "before_value": None, "after_value": round(reasoning) if reasoning is not None else None, "subtitle": f"AI evaluation interview — {track} (0-100%)" if track else "AI interview score 0-100%"},
        {"id": "problem_solving", "label": f"Problem solving{eval_label}" if track else "Problem solving (evaluation)", "value": round(problem_solving) if problem_solving is not None else 0, "unit": "%", "type": "score", "trend": "neutral", "before_value": None, "after_value": round(problem_solving) if problem_solving is not None else None, "subtitle": f"AI evaluation interview — {track} (0-100%)" if track else "AI interview score 0-100%"},
        {"id": "readiness", "label": f"Readiness ({track})" if track else "Current readiness", "value": readiness, "unit": "", "type": "level", "trend": "neutral", "before_value": None, "after_value": None, "subtitle": f"Level after {track} evaluation: " + readiness if track else "Level after evaluation: " + readiness},
        {"id": "stages_completed", "label": "Stages completed", "value": len(stages), "unit": "", "type": "count", "trend": "neutral", "before_value": 0, "after_value": len(stages), "subtitle": f"Content you followed: {stages_list}" if stage_names else "Learning path content completed"},
    ]
    if improvement_pct is not None and before_score > 0:
        metrics.append({"id": "comparable_change", "label": "Score change", "value": improvement_pct, "unit": "%", "type": "percent", "trend": "up" if improvement_pct >= 0 else "down", "before_value": round(before_score), "after_value": round(after_composite) if after_composite is not None else None, "subtitle": "Assessment % vs evaluation average % (different instruments)"})

    journey_content = (
        f"For **{track}**, you completed **{len(stages)}** stage(s): **{stages_list}**. "
        + (f"Content you followed: **{content_followed_str}**. " if content_followed else "")
        + ((after_context.get("learning_summary") or "")[:200] + ("..." if len((after_context.get("learning_summary") or "")) > 200 else ""))
    )
    story = [
        {"id": "start", "step_number": 1, "title": f"Where You Started ({track})", "type": "before", "content": f"Before the AI evaluation, your **{track}** assessment showed **{before_score:.0f}%** overall, level **{before_level}**. Dimensions assessed: **{dim_list}**. " + ("Strengths: " + "; ".join(strengths[:3]) + "." if strengths else "") + (" Gaps: " + "; ".join(gaps[:3]) + "." if gaps else "")},
        {"id": "journey", "step_number": 2, "title": f"What You Learned ({track})", "type": "journey", "content": journey_content},
        {"id": "evaluation", "step_number": 3, "title": f"AI Evaluation for {track}", "type": "evaluation", "content": f"Our AI evaluated how you applied your **{track}** learning (from {stages_list}) in the interview. Result: Reasoning **{(reasoning or 0):.0f}%**, Problem solving **{(problem_solving or 0):.0f}%**, Readiness **{readiness}**."},
        {"id": "now", "step_number": 4, "title": f"Where You Stand Now in {track}", "type": "after", "content": f"According to the AI evaluation, your current standing in **{track}** is **{readiness}** readiness. Your scores reflect how you applied what you learned in **{stages_list}** and the content you followed during the interview."},
        {"id": "conclusion", "step_number": 5, "title": f"AI Evaluation Summary — {track}", "type": "conclusion", "content": f"The AI has evaluated your **{track}** journey: started at {before_score:.0f}% ({before_level}); you studied {stages_list}" + (f" and content: {content_followed_str}" if content_followed else "") + f"; evaluation readiness **{readiness}** (Reasoning {(reasoning or 0):.0f}%, Problem solving {(problem_solving or 0):.0f}%). Focus next on the dimensions and stages where gaps remain."},
    ]

    ai_summary = (
        f"Our AI has evaluated your **{track}** assessment, the content you followed ({stages_list}"
        + (f": {content_followed_str}" if content_followed else "") + "), and your evaluation interview. "
        f"You started at {before_score:.0f}% (level {before_level}) with strengths and gaps in **{dim_list}**. "
        f"You completed the stages **{stages_list}** and the related content. "
        f"The AI evaluation gave Reasoning {(reasoning or 0):.0f}% and Problem solving {(problem_solving or 0):.0f}%, readiness **{readiness}** — reflecting how you applied your **{track}** learning in the interview. "
        f"According to this evaluation, you stand at **{readiness}** in **{track}**."
    )
    current_standing = (
        f"**According to your AI evaluation,** you currently stand at **{readiness}** readiness in **{track}**. "
        f"Your evaluation scores (Reasoning {(reasoning or 0):.0f}%, Problem solving {(problem_solving or 0):.0f}%) reflect how you applied what you learned in **{stages_list}** and the content you followed. "
        + (f"Focus next on: " + ", ".join(gaps[:2]) + "." if gaps else "Continue building on the dimensions and stages you demonstrated.")
    )

    improvements_after = [f"Application of {track} content ({stages_list}) in the evaluation interview"] if stage_names else []
    if (reasoning or 0) >= 50 or (problem_solving or 0) >= 50:
        improvements_after.append(f"Evaluation scores reflect progress in {track}")

    return {
        "headline": f"Your AI evaluation ({track}): {before_level} → {readiness}" if readiness else f"Your AI evaluation ({track})",
        "summary": f"Our AI has evaluated your **{track}** assessment, path ({stages_list}), and interview. You started at {before_score:.0f}% ({before_level}). Your AI evaluation shows Reasoning {(reasoning or 0):.0f}%, Problem solving {(problem_solving or 0):.0f}%, **{readiness}** readiness — tied to what you learned.",
        "ai_summary": ai_summary,
        "current_standing": current_standing,
        "dashboard_metrics": metrics,
        "story_sections": story,
        "content_followed": content_followed,
        "stage_names": stage_names,
        "before_summary": {
            "overall_score": before_score,
            "level": before_level,
            "strengths": strengths[:5],
            "gaps": gaps[:5],
            "highlight_quotes": [((item.get("user_answer") or "").strip()[:80] + "...") for item in qa[:2] if (item.get("user_answer") or "").strip()],
        },
        "after_summary": {
            "reasoning_score": float(reasoning) if reasoning is not None else None,
            "problem_solving_score": float(problem_solving) if problem_solving is not None else None,
            "readiness_level": readiness,
            "improvements": improvements_after if improvements_after else [f"Evaluation reflects your {track} learning"],
            "sustained_gaps": gaps[:3] if gaps else [],
        },
    }
