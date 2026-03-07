"""
Path Completion Report Module
============================
Self-contained module that generates a path completion report from a path_id.

Input:  path_id, user_id, db (SQLAlchemy Session)
Output: PathCompletionReport (learning_summary + full_context)

Flow:
  1. Validate path exists and belongs to user
  2. Check path is 100% complete (all content items marked done)
  3. Gather context: stages, content consumed, assessment Q&A, track
  4. Generate learning_summary (AI when USE_MOCK_AI=false, else template)
  5. Build full_context and persist report

AI Usage:
  - learning_summary: Uses AI when USE_MOCK_AI=false (OpenAI/Gemini via ai_provider)
  - When USE_MOCK_AI=true: Returns a template built from stage names + content titles
"""

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from dotenv import load_dotenv

from app import models
from app.ai_services.learning_summary_generator import generate_learning_summary

load_dotenv()

USE_MOCK_AI: bool = os.getenv("USE_MOCK_AI", "true").lower() == "true"


@dataclass
class PathCompletionReportResult:
    """Result of report generation."""

    report_id: int
    path_id: int
    user_id: int
    learning_summary: str
    full_context: Dict[str, Any]
    created_at: Any


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_path(
    db: Session,
    path_id: int,
    user_id: int,
) -> Tuple[Optional[models.LearningPath], Optional[str]]:
    """
    Validate path exists and belongs to user.
    Returns (path, error_message). If error_message is set, path is None.
    """
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == user_id,
    ).first()

    if not path:
        return None, "Learning path not found"
    return path, None


def _check_existing_report(
    db: Session,
    path_id: int,
) -> Optional[models.PathCompletionReport]:
    """Return existing report if one exists for this path."""
    return db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == path_id
    ).first()


# ---------------------------------------------------------------------------
# Context Gathering
# ---------------------------------------------------------------------------


def _gather_context(
    db: Session,
    path: models.LearningPath,
    user_id: int,
) -> Tuple[Optional[str], Optional[Dict], Optional[str]]:
    """
    Gather all context needed for the report.
    Returns (error_message, context_dict, track_name).
    If error_message is set, context_dict and track_name may be None.
    """
    stages = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.path_id == path.path_id
    ).order_by(models.LearningPathStage.stage_order).all()

    total_content = 0
    total_completed = 0
    content_consumed: List[Dict[str, Any]] = []
    stages_data: List[Dict[str, Any]] = []

    for stage in stages:
        content_items = db.query(models.StageContent).filter(
            models.StageContent.stage_id == stage.stage_id
        ).all()
        stage_content_consumed: List[Dict[str, Any]] = []

        for content in content_items:
            total_content += 1
            progress = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == user_id,
                models.UserContentProgress.content_id == content.content_id,
                models.UserContentProgress.is_completed == True,
            ).first()

            if progress:
                total_completed += 1
                item = {
                    "content_id": content.content_id,
                    "title": content.title,
                    "description": content.description or "",
                    "content_text": content.content_text,
                    "stage_name": stage.stage_name,
                    "completed_at": progress.completed_at.isoformat() if progress.completed_at else None,
                }
                content_consumed.append(item)
                stage_content_consumed.append(item)

        stages_data.append({
            "stage_id": stage.stage_id,
            "stage_name": stage.stage_name,
            "focus_area": stage.focus_area,
            "content_consumed": stage_content_consumed,
        })

    if total_content == 0:
        return "Path has no content yet. Generate content for stages first.", None, None
    if total_completed < total_content:
        return f"Path not yet complete. Completed {total_completed}/{total_content} items.", None, None

    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()
    if not result:
        return "Assessment result not found for this path.", None, None

    assessment_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    if not assessment_session:
        return "Assessment session not found for this path.", None, None

    track = db.query(models.Track).filter(
        models.Track.track_id == assessment_session.track_id
    ).first()
    if not track:
        return "Track not found for this path.", None, None

    session_questions = db.query(models.AssessmentSessionQuestion).filter(
        models.AssessmentSessionQuestion.session_id == result.session_id
    ).all()
    questions_and_answers: List[Dict[str, Any]] = []

    for sq in session_questions:
        question = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == sq.question_id
        ).first()
        response = db.query(models.AssessmentResponse).filter(
            models.AssessmentResponse.session_id == result.session_id,
            models.AssessmentResponse.question_id == sq.question_id,
        ).first()
        dimension = "General"
        if question and question.dimension_id:
            dim = db.query(models.AssessmentDimension).filter(
                models.AssessmentDimension.dimension_id == question.dimension_id
            ).first()
            dimension = dim.name if dim else "General"

        if question and response:
            questions_and_answers.append({
                "question_text": question.question_text,
                "user_answer": response.user_answer,
                "score": float(response.ai_score) if response.ai_score else 0,
                "dimension": dimension,
                "ai_explanation": response.ai_explanation or "",
            })

    context = {
        "track_name": track.track_name,
        "assessment": {
            "session_id": result.session_id,
            "overall_score": float(result.overall_score) if result.overall_score else 0,
            "detected_level": result.detected_level,
            "questions_and_answers": questions_and_answers,
        },
        "stages": stages_data,
        "content_consumed": content_consumed,
    }
    return None, context, track.track_name


# ---------------------------------------------------------------------------
# Report Generation (AI vs Mock)
# ---------------------------------------------------------------------------

# How learning_summary is generated:
#
# - USE_MOCK_AI=true (default):
#   Template built from stage names + content titles. No AI call.
#
# - USE_MOCK_AI=false:
#   Uses ai_provider (OpenAI or Gemini) to generate a 2-4 paragraph summary
#   from track_name, stages, and content_consumed. Falls back to mock if
#   provider is not configured or the call fails.


async def generate_path_completion_report(
    db: Session,
    path_id: int,
    user_id: int,
) -> PathCompletionReportResult:
    """
    Generate and persist a path completion report.

    Input:
        db: SQLAlchemy Session
        path_id: Learning path ID
        user_id: User ID (path must belong to this user)

    Returns:
        PathCompletionReportResult with report_id, learning_summary, full_context

    Raises:
        ValueError: With message describing validation failure
    """
    path, err = _validate_path(db, path_id, user_id)
    if err:
        raise ValueError(err)

    existing = _check_existing_report(db, path_id)
    if existing:
        return PathCompletionReportResult(
            report_id=existing.report_id,
            path_id=existing.path_id,
            user_id=existing.user_id,
            learning_summary=existing.learning_summary,
            full_context=existing.full_context,
            created_at=existing.created_at,
        )

    err, context, track_name = _gather_context(db, path, user_id)
    if err:
        raise ValueError(err)

    stages_for_summary = [
        {"stage_name": s["stage_name"], "focus_area": s["focus_area"]}
        for s in context["stages"]
    ]
    content_for_summary = [
        {
            "title": c["title"],
            "description": c["description"],
            "content_text": c.get("content_text"),
            "stage_name": c["stage_name"],
        }
        for c in context["content_consumed"]
    ]

    learning_summary = await generate_learning_summary(
        track_name=track_name,
        stages=stages_for_summary,
        content_consumed=content_for_summary,
    )

    report = models.PathCompletionReport(
        path_id=path_id,
        user_id=user_id,
        learning_summary=learning_summary,
        full_context=context,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return PathCompletionReportResult(
        report_id=report.report_id,
        path_id=report.path_id,
        user_id=report.user_id,
        learning_summary=report.learning_summary,
        full_context=report.full_context,
        created_at=report.created_at,
    )
