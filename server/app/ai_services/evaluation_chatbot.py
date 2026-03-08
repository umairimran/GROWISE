"""
Evaluation Chatbot - AI Interviewer with Full Context
=====================================================
Reverse ChatGPT style: AI asks questions, user answers.
AI has complete context: track, assessment Q&A, stages, content consumed.

Used for:
  - generate_evaluation_intro: Opening message with full context
  - generate_evaluation_followup: Context-aware follow-up questions
  - evaluate_conversation: Final evaluation with full dialogue + context
"""

import json
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"


def _build_context_block(full_context: Dict[str, Any]) -> str:
    """Serialize full_context for AI prompt. Rich detail for context-aware, scenario-based questions."""
    if not full_context:
        return "No detailed context available."

    parts = []

    track = full_context.get("track_name", "")
    if track:
        parts.append(f"TRACK: {track}")

    assessment = full_context.get("assessment") or {}
    if assessment:
        parts.append("\n--- INITIAL ASSESSMENT ---")
        parts.append(f"Overall score: {assessment.get('overall_score', 'N/A')}%")
        parts.append(f"Detected level: {assessment.get('detected_level', 'N/A')}")
        qa = assessment.get("questions_and_answers") or []
        weak_areas = []
        strong_areas = []
        for i, item in enumerate(qa[:10], 1):
            q = item.get("question_text", "")
            a = (item.get("user_answer", "") or "")
            score = item.get("score", 0)
            dim = item.get("dimension", "")
            expl = (item.get("ai_explanation") or "").strip()
            parts.append(f"\n  Q{i} [{dim}]: {q}")
            parts.append(f"  Their answer: {a}")
            parts.append(f"  Score: {score:.2f}/1.0")
            if expl:
                parts.append(f"  Evaluator note: {expl}")
            if score < 0.6:
                weak_areas.append({"q": q[:120], "dim": dim, "expl": expl})
            elif score >= 0.75:
                strong_areas.append({"q": q[:80], "dim": dim})

        if weak_areas:
            parts.append("\n--- WEAK AREAS (probe these with scenario questions) ---")
            for w in weak_areas[:5]:
                parts.append(f"  • {w['q']}... [Dimension: {w['dim']}]")
                if w["expl"]:
                    parts.append(f"    Gap: {w['expl'][:150]}")

        if strong_areas:
            parts.append("\n--- STRONG AREAS (avoid re-testing; go deeper if needed) ---")
            for s in strong_areas[:3]:
                parts.append(f"  • {s['q']}... [{s['dim']}]")

    stages = full_context.get("stages") or []
    if stages:
        parts.append("\n--- LEARNING STAGES COMPLETED ---")
        for s in stages:
            name = s.get("stage_name", "")
            focus = (s.get("focus_area", "") or "")
            consumed = s.get("content_consumed") or []
            parts.append(f"  Stage: {name} | Focus: {focus}")
            for c in consumed[:5]:
                title = (c.get("title", "") or "")
                desc = (c.get("description", "") or "")[:80]
                parts.append(f"    - {title}" + (f" ({desc}...)" if desc else ""))

    content_consumed = full_context.get("content_consumed") or []
    if content_consumed:
        parts.append("\n--- EXACT CONTENT THEY STUDIED (use for scenario questions) ---")
        for c in content_consumed[:15]:
            title = (c.get("title", "") or "")
            desc = (c.get("description", "") or "")[:100]
            stage = c.get("stage_name", "")
            parts.append(f"  - [{stage}] {title}")
            if desc:
                parts.append(f"    {desc}")
    return "\n".join(parts) if parts else "No context."


def _build_dialogue_block(dialogue_history: List[Dict]) -> str:
    """Format dialogue history for prompt."""
    lines = []
    for d in dialogue_history:
        speaker = d.get("speaker", "unknown")
        text = (d.get("text", "") or "").strip()
        prefix = "Interviewer" if speaker == "ai" else "Candidate"
        lines.append(f"{prefix}: {text}")
    return "\n\n".join(lines) if lines else "No dialogue yet."


def _count_exchanges(dialogue_history: List[Dict]) -> int:
    """Count back-and-forth exchanges (pairs of interviewer + candidate)."""
    ai_count = sum(1 for d in dialogue_history if d.get("speaker") == "ai")
    user_count = sum(1 for d in dialogue_history if d.get("speaker") == "user")
    return min(ai_count, user_count)


# ---------------------------------------------------------------------------
# Intro
# ---------------------------------------------------------------------------

_INTRO_SYSTEM = """You are a senior engineer conducting a real technical interview. You are HUMAN: warm but professional, curious, not robotic.

You have complete context: their track, every assessment question they answered (with scores and evaluator notes), their weak areas, the exact content they studied (titles, descriptions), and learning stages.

CRITICAL RULES:
- Sound like a real person. Vary sentence length. Use natural transitions. No bullet points or lists in your speech.
- NEVER ask generic questions like "Tell me about X" or "How would you apply your learning?"
- Ask ONE concrete, scenario-based question. Example: "Imagine you're building [specific thing from their track] and [specific problem]. Walk me through how you'd approach it."
- Reference something specific from their context: a weak area, a content title they studied, or a dimension they struggled in.
- This is a proper interview: 12–18 exchanges. Take your time. One question per message.
- No markdown, no JSON, no emojis. Plain conversational text."""

_INTRO_USER_TEMPLATE = """=== FULL CANDIDATE CONTEXT (use this to craft your first question) ===
{context_block}

=== YOUR TASK ===
Write a short, human opening (2–3 paragraphs) that:
1. Greets them naturally and briefly mentions you've reviewed their assessment and learning path.
2. Sets the tone: this is a conversation, not a quiz. You'll ask scenario-based questions. Expect 12–18 back-and-forth exchanges.
3. Asks your FIRST question — a concrete scenario. It MUST:
   - Be specific to their track and to content they actually studied (use titles from CONTENT CONSUMED)
   - Pose a realistic situation: "Imagine you're...", "Suppose a client asks you to...", "You're debugging X when Y happens..."
   - Target a weak area from their assessment if possible, or test practical application of something they learned
   - Be ONE question, not multiple. Let them answer fully before you follow up.

Do NOT be generic. Do NOT sound like a chatbot. Write as a real interviewer would speak."""


async def generate_evaluation_intro(context: Dict[str, Any]) -> str:
    """Generate AI interviewer intro with full context."""
    if USE_MOCK_AI:
        return _mock_intro(context)

    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_intro(context)

    full_context = context.get("full_context") or {}
    context_block = _build_context_block(full_context)
    if not full_context:
        context_block += f"\n\nTrack: {context.get('track_name', '')}"
        context_block += f"\nInitial score: {context.get('overall_score', 0)}%"
        context_block += f"\nLevel: {context.get('detected_level', '')}"
        context_block += f"\nCompletion: {context.get('completion_rate', 0)}%"

    prompt = _INTRO_USER_TEMPLATE.format(context_block=context_block)
    messages = [
        {"role": "system", "content": _INTRO_SYSTEM},
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.5, timeout=60.0)
        return raw.strip() if raw and len(raw.strip()) > 50 else _mock_intro(context)
    except Exception:
        return _mock_intro(context)


def _mock_intro(context: Dict) -> str:
    track = context.get("track_name", "") or "your track"
    level = context.get("detected_level", "intermediate")
    score = context.get("overall_score", 0)
    completion = context.get("completion_rate", 0)
    full_ctx = context.get("full_context") or {}
    assessment = full_ctx.get("assessment") or {}
    qa = assessment.get("questions_and_answers") or []
    content = full_ctx.get("content_consumed") or []
    weak = [x for x in qa if x.get("score", 1) < 0.6]
    content_titles = [c.get("title", "") for c in content[:3] if c.get("title")]

    first_content = content_titles[0] if content_titles else "the material"
    weak_dim = weak[0].get("dimension", "practical application") if weak else "practical application"

    return f"""Hi. I've gone through your assessment and learning path — {int(score)}% on the initial assessment, {level} level, and you've completed about {completion}% of the path. I've got a good sense of what you've been working on.

This will be a conversation, not a quiz. I'll ask scenario-based questions. Expect maybe 12 to 18 back-and-forth exchanges. Take your time with your answers.

First question: Imagine you're working on a {track} project and you need to apply what you learned from {first_content}. A teammate pushes back on your approach and says it won't scale. Walk me through how you'd respond — what would you ask them, and how would you adjust your design?""".strip()


# ---------------------------------------------------------------------------
# Follow-up
# ---------------------------------------------------------------------------

_FOLLOWUP_SYSTEM = """You are a senior engineer in a real technical interview. Be HUMAN: natural, attentive, occasionally use brief acknowledgments ("Interesting.", "Got it.") before your next question.

You have full context: their track, assessment (questions, scores, weak areas), the exact content they studied, and the full dialogue so far.

CRITICAL RULES:
- Sound like a real person. No robotic phrasing. No "Thank you for your response. Can you please..."
- NEVER ask generic questions. Every question must be a CONCRETE SCENARIO tied to their track, their answer, or content they studied.
- Reference what they just said. Build on it. "You mentioned X — what happens when Y?" or "In that scenario, how would you handle [edge case]?"
- One question per message. Let them answer fully. Proper interview pacing.
- Interview length: 12–18 exchanges. Only wrap up when you have 12+ substantive exchanges AND they've given enough depth.
- When wrapping up: sound human. "I think I have a good picture. Let me put together my feedback." Not robotic.
- No markdown. Plain text only."""

_FOLLOWUP_USER_TEMPLATE = """=== CANDIDATE CONTEXT ===
{context_block}

=== CONVERSATION SO FAR ===
{dialogue_block}

=== EXCHANGE COUNT ===
{exchange_count} back-and-forth exchanges so far. (Aim for 12–18 before wrapping up.)

=== YOUR TASK ===
The candidate just responded.

If fewer than 12 exchanges OR their answers lack depth:
  - Ask ONE follow-up question. It MUST:
    * Reference something specific they said (quote or paraphrase)
    * Be a concrete scenario: "So if that fails, what would you do?", "Imagine the client pushes back on X — how do you respond?", "Walk me through how you'd debug that."
    * Target a weak area from their assessment, or probe deeper into what they just said
  - Sound natural. Brief acknowledgment of their answer, then the question.
  - Do NOT ask generic questions like "Can you elaborate?" or "What challenges might you face?"

If 12+ exchanges AND they've given substantive, detailed answers:
  - Wrap up naturally. "I've got a clear picture. Let me put together my evaluation." or similar. Human, not robotic.

Reply with ONLY your next message (one short paragraph)."""


async def generate_evaluation_followup(
    dialogue_history: List[Dict],
    full_context: Dict[str, Any],
) -> str:
    """Generate context-aware follow-up question."""
    if USE_MOCK_AI:
        return _mock_followup(dialogue_history)

    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_followup(dialogue_history)

    context_block = _build_context_block(full_context)
    dialogue_block = _build_dialogue_block(dialogue_history)
    exchange_count = _count_exchanges(dialogue_history)
    prompt = _FOLLOWUP_USER_TEMPLATE.format(
        context_block=context_block,
        dialogue_block=dialogue_block,
        exchange_count=exchange_count,
    )
    messages = [
        {"role": "system", "content": _FOLLOWUP_SYSTEM},
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.4, timeout=45.0)
        return raw.strip() if raw and len(raw.strip()) > 20 else _mock_followup(dialogue_history)
    except Exception:
        return _mock_followup(dialogue_history)


def _mock_followup(dialogue_history: List[Dict]) -> str:
    user_msgs = [d for d in dialogue_history if d.get("speaker") == "user"]
    ai_msgs = [d for d in dialogue_history if d.get("speaker") == "ai"]
    exchanges = min(len(user_msgs), len(ai_msgs))

    if exchanges >= 6:
        return "I've got a clear picture. Let me put together my evaluation."
    if user_msgs:
        return (
            "Got it. Imagine that approach fails in production and you're debugging at 2am. "
            "What's your first step — what would you check, and what would you log?"
        )
    return (
        "Interesting. So in that scenario, what's the first thing that could go wrong? "
        "And how would you handle it?"
    )


# ---------------------------------------------------------------------------
# Final Evaluation
# ---------------------------------------------------------------------------

_EVAL_SYSTEM = """You are an expert evaluator. You have FULL CONTEXT:
- Candidate's track, initial assessment (questions, answers, scores)
- Stages and content they completed
- The complete interview dialogue

Your task: Evaluate the candidate and return a JSON object with this EXACT structure:
{
  "reasoning_score": <number 0-100>,
  "problem_solving": <number 0-100>,
  "readiness_level": "junior" | "mid" | "senior_ready",
  "final_feedback": "<2-4 paragraph detailed feedback in markdown>"
}

Be fair. Consider: depth of answers, use of examples, connection to learned content, problem-solving approach."""

_EVAL_USER_TEMPLATE = """=== CANDIDATE CONTEXT ===
{context_block}

=== FULL INTERVIEW DIALOGUE ===
{dialogue_block}

=== YOUR TASK ===
Evaluate this candidate. Return ONLY a JSON object with: reasoning_score, problem_solving, readiness_level, final_feedback.
No other text."""


async def evaluate_conversation(
    dialogues: List[Dict],
    path_info: Dict[str, Any],
) -> Dict[str, Any]:
    """Evaluate full conversation with context. Returns scores and feedback."""
    if USE_MOCK_AI:
        return _mock_evaluate(dialogues, path_info)

    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    if not provider.is_configured():
        return _mock_evaluate(dialogues, path_info)

    full_context = path_info.get("full_context") or {}
    context_block = _build_context_block(full_context)
    dialogue_data = [{"speaker": d.get("speaker"), "text": d.get("text", "")} for d in dialogues]
    dialogue_block = _build_dialogue_block(dialogue_data)
    prompt = _EVAL_USER_TEMPLATE.format(
        context_block=context_block,
        dialogue_block=dialogue_block,
    )
    messages = [
        {"role": "system", "content": _EVAL_SYSTEM},
        {"role": "user", "content": prompt},
    ]

    try:
        raw = await provider.chat_complete(messages, temperature=0.2, timeout=60.0)
        data = _parse_eval_response(raw)
        if data:
            return data
    except Exception:
        pass

    return _mock_evaluate(dialogues, path_info)


def _parse_eval_response(raw: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from AI response."""
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
        if isinstance(data, dict):
            level = str(data.get("readiness_level", "mid")).lower()
            if level not in ("junior", "mid", "senior_ready"):
                level = "mid"
            return {
                "reasoning_score": float(data.get("reasoning_score", 75)),
                "problem_solving": float(data.get("problem_solving", 75)),
                "readiness_level": level,
                "final_feedback": str(data.get("final_feedback", "Evaluation complete.")),
            }
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _mock_evaluate(dialogues: List[Dict], path_info: Dict) -> Dict[str, Any]:
    """Mock evaluation with basic heuristics."""
    import random

    user_msgs = [d for d in dialogues if d.get("speaker") == "user"]
    avg_len = sum(len((m.get("text") or "").split()) for m in user_msgs) / len(user_msgs) if user_msgs else 0
    has_examples = any(
        "example" in (m.get("text") or "").lower() or "like" in (m.get("text") or "").lower()
        for m in user_msgs
    )

    reasoning = random.uniform(70, 95)
    problem = random.uniform(65, 92)
    if avg_len > 50:
        reasoning += 5
        problem += 3
    if has_examples:
        reasoning += 3
        problem += 5
    reasoning = min(100, reasoning)
    problem = min(100, problem)

    if reasoning >= 85 and problem >= 85:
        level = "senior_ready"
        feedback = f"**Exceptional Performance!** Reasoning: {int(reasoning)}/100, Problem Solving: {int(problem)}/100. Senior-ready."
    elif reasoning >= 70 and problem >= 70:
        level = "mid"
        feedback = f"**Strong Performance!** Reasoning: {int(reasoning)}/100, Problem Solving: {int(problem)}/100. Mid-level ready."
    else:
        level = "junior"
        feedback = f"**Good Foundation!** Reasoning: {int(reasoning)}/100, Problem Solving: {int(problem)}/100. Junior-level ready."

    return {
        "reasoning_score": round(reasoning, 2),
        "problem_solving": round(problem, 2),
        "readiness_level": level,
        "final_feedback": feedback,
    }
