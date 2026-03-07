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
    """Serialize full_context for AI prompt."""
    if not full_context:
        return "No detailed context available."

    parts = []

    track = full_context.get("track_name", "")
    if track:
        parts.append(f"TRACK: {track}")

    assessment = full_context.get("assessment") or {}
    if assessment:
        parts.append("\n--- ASSESSMENT (Initial) ---")
        parts.append(f"Overall score: {assessment.get('overall_score', 'N/A')}%")
        parts.append(f"Detected level: {assessment.get('detected_level', 'N/A')}")
        qa = assessment.get("questions_and_answers") or []
        for i, item in enumerate(qa[:8], 1):
            q = item.get("question_text", "")[:200]
            a = (item.get("user_answer", "") or "")[:150]
            score = item.get("score", 0)
            dim = item.get("dimension", "")
            parts.append(f"  Q{i}: {q}...")
            parts.append(f"  User answer: {a}...")
            parts.append(f"  Score: {score} | Dimension: {dim}")

    stages = full_context.get("stages") or []
    if stages:
        parts.append("\n--- STAGES FOLLOWED ---")
        for s in stages:
            name = s.get("stage_name", "")
            focus = (s.get("focus_area", "") or "")[:200]
            consumed = s.get("content_consumed") or []
            parts.append(f"  Stage: {name}")
            parts.append(f"  Focus: {focus}...")
            parts.append(f"  Content completed: {len(consumed)} items")

    content_consumed = full_context.get("content_consumed") or []
    if content_consumed:
        parts.append("\n--- CONTENT CONSUMED ---")
        for c in content_consumed[:12]:
            title = (c.get("title", "") or "")[:100]
            stage = c.get("stage_name", "")
            parts.append(f"  - [{stage}] {title}")

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


# ---------------------------------------------------------------------------
# Intro
# ---------------------------------------------------------------------------

_INTRO_SYSTEM = """You are an expert technical interviewer conducting a skill evaluation.
You have FULL CONTEXT about the candidate:
- Their chosen track and initial assessment (questions they answered, scores, weak areas)
- The learning stages they completed
- The exact content (articles, tutorials, docs) they consumed

Your role: Ask probing questions to assess depth of understanding, not just recall.
Be conversational. Reference their learning journey. Act like a senior engineer in an interview.
Reply in plain text. No markdown, no JSON."""

_INTRO_USER_TEMPLATE = """=== CANDIDATE CONTEXT ===
{context_block}

=== YOUR TASK ===
Write a welcoming opening message (2-4 short paragraphs) that:
1. Introduces yourself as the AI interviewer
2. Summarizes what you know about their journey (track, initial level, what they learned)
3. Explains the interview format (conversational, 10-15 exchanges)
4. Asks the FIRST question - something that tests practical application of what they learned

Be specific. Reference their track and weak areas from the assessment. Then ask one clear question to start."""


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
    track = context.get("track_name", "")
    level = context.get("detected_level", "")
    score = context.get("overall_score", 0)
    completion = context.get("completion_rate", 0)
    learning_summary = context.get("learning_summary", "")

    block = ""
    if learning_summary:
        block = f"\n\n📚 **What You Learned:**\n{learning_summary[:400]}...\n\n"

    return f"""👋 **Welcome to your AI-Powered Skill Evaluation Interview!**

I'm your AI interviewer. I have full context about your journey:

📊 **Your Journey:**
• **Track:** {track}
• **Initial Assessment:** {int(score)}% ({level.title()} level)
• **Path Completion:** {completion}%
{block}
🎯 **Format:** We'll have a natural conversation (10-15 messages). I'll ask questions based on your learning. Answer naturally.

**First question:** Based on your learning in {track}, describe a real-world project where you'd apply what you've learned. What key decisions would you make?""".strip()


# ---------------------------------------------------------------------------
# Follow-up
# ---------------------------------------------------------------------------

_FOLLOWUP_SYSTEM = """You are an expert technical interviewer. You have FULL CONTEXT about the candidate:
- Their track, initial assessment (questions, answers, scores, weak areas)
- Stages they completed and content they consumed

Your role: Ask follow-up questions to assess depth. Reference their answers. Probe for understanding.
If you have enough information (8+ exchanges, substantive answers), say you have enough to evaluate.
Reply in plain text only. No markdown."""

_FOLLOWUP_USER_TEMPLATE = """=== CANDIDATE CONTEXT ===
{context_block}

=== DIALOGUE SO FAR ===
{dialogue_block}

=== YOUR TASK ===
The candidate just responded. Either:
A) Ask a follow-up question that probes deeper (reference their answer or a weak area from assessment), OR
B) If you have enough to evaluate (8+ exchanges, good depth), say: "Thank you for your detailed responses. I have enough information to evaluate your skills now."

Reply with ONLY your next message (one paragraph or question)."""


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
    prompt = _FOLLOWUP_USER_TEMPLATE.format(
        context_block=context_block,
        dialogue_block=dialogue_block,
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
    if len(dialogue_history) < 10:
        return (
            "Thank you for your response. Can you describe how you would apply your learning "
            "in a practical scenario? What challenges might you face?"
        )
    return "Thank you for your detailed responses. I have enough information to evaluate your skills now."


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
