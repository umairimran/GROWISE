"""
Progress & Dashboard router - Complete progress tracking and analytics
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user
from app.ai_services.path_completion_report_module import generate_path_completion_report
from app.ai_services.improvement_analysis_generator import generate_detailed_analysis, generate_structured_report

router = APIRouter(prefix="/api/progress", tags=["Progress & Dashboard"])


# ============================================================================
# Assessment Progress Tracking
# ============================================================================

@router.get("/assessments/history")
def get_assessment_history(
    track_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get complete assessment history with scores over time
    Shows improvement progression across multiple attempts
    """
    query = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.user_id == current_user.user_id,
        models.AssessmentSession.status == "completed"
    )
    
    if track_id:
        query = query.filter(models.AssessmentSession.track_id == track_id)
    
    sessions = query.order_by(models.AssessmentSession.started_at.asc()).all()
    
    history = []
    for session in sessions:
        result = db.query(models.AssessmentResult).filter(
            models.AssessmentResult.session_id == session.session_id
        ).first()
        
        if result:
            track = db.query(models.Track).filter(
                models.Track.track_id == session.track_id
            ).first()
            
            history.append({
                "session_id": session.session_id,
                "track_id": session.track_id,
                "track_name": track.track_name if track else "",
                "attempt_date": session.started_at,
                "completed_date": session.completed_at,
                "score": float(result.overall_score),
                "detected_level": result.detected_level,
                "ai_reasoning": result.ai_reasoning
            })
    
    return {
        "total_attempts": len(history),
        "history": history,
        "improvement": _calculate_improvement(history) if len(history) > 1 else None
    }


def _calculate_improvement(history: List) -> dict:
    """Calculate improvement metrics"""
    if len(history) < 2:
        return None

    first_score = history[0]["score"]
    latest_score = history[-1]["score"]

    # Avoid division by zero when first_score is 0
    if first_score is None or first_score == 0:
        improvement_percentage = 100.0 if latest_score and latest_score > 0 else 0.0
    else:
        improvement_percentage = ((latest_score - first_score) / first_score) * 100

    return {
        "first_attempt_score": first_score,
        "latest_attempt_score": latest_score,
        "improvement_percentage": round(improvement_percentage, 2),
        "level_progression": f"{history[0]['detected_level']} → {history[-1]['detected_level']}",
    }


@router.get("/assessments/compare/{session_id_1}/{session_id_2}")
def compare_assessments(
    session_id_1: int,
    session_id_2: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Compare two assessment attempts to see improvement
    """
    # Get both sessions
    session1 = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id_1,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    session2 = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id_2,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session1 or not session2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both assessment sessions not found"
        )
    
    # Get results
    result1 = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.session_id == session_id_1
    ).first()
    
    result2 = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.session_id == session_id_2
    ).first()
    
    if not result1 or not result2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both assessments must be completed"
        )
    
    # Get responses for detailed comparison
    responses1 = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id_1
    ).all()
    
    responses2 = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id_2
    ).all()
    
    return {
        "attempt_1": {
            "date": session1.started_at,
            "overall_score": float(result1.overall_score),
            "detected_level": result1.detected_level,
            "questions_answered": len(responses1),
            "average_question_score": float(result1.overall_score) / 100
        },
        "attempt_2": {
            "date": session2.started_at,
            "overall_score": float(result2.overall_score),
            "detected_level": result2.detected_level,
            "questions_answered": len(responses2),
            "average_question_score": float(result2.overall_score) / 100
        },
        "improvement": {
            "score_change": float(result2.overall_score) - float(result1.overall_score),
            "percentage_improvement": round(
                ((float(result2.overall_score) - float(result1.overall_score)) / float(result1.overall_score)) * 100, 2
            ),
            "level_change": f"{result1.detected_level} → {result2.detected_level}",
            "time_between_attempts": str(session2.started_at - session1.started_at)
        }
    }


# ============================================================================
# Learning Path Progress
# ============================================================================

@router.get("/learning-path/{path_id}")
def get_learning_path_progress(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get detailed progress for a learning path
    """
    # Verify path belongs to user
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found"
        )
    
    # Get all stages
    stages = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.path_id == path_id
    ).order_by(models.LearningPathStage.stage_order).all()
    
    stages_progress = []
    total_content = 0
    total_completed = 0
    total_time = 0
    
    for stage in stages:
        # Get all content for this stage
        content_items = db.query(models.StageContent).filter(
            models.StageContent.stage_id == stage.stage_id
        ).all()
        
        stage_total = len(content_items)
        stage_completed = 0
        stage_time = 0
        
        for content in content_items:
            progress = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == current_user.user_id,
                models.UserContentProgress.content_id == content.content_id
            ).first()
            
            if progress:
                if progress.is_completed:
                    stage_completed += 1
                stage_time += progress.time_spent_minutes
        
        total_content += stage_total
        total_completed += stage_completed
        total_time += stage_time
        
        stages_progress.append({
            "stage_id": stage.stage_id,
            "stage_name": stage.stage_name,
            "stage_order": stage.stage_order,
            "total_content": stage_total,
            "completed_content": stage_completed,
            "completion_percentage": int((stage_completed / stage_total * 100)) if stage_total > 0 else 0,
            "time_spent_minutes": stage_time
        })
    
    return {
        "path_id": path_id,
        "created_at": path.created_at,
        "overall_completion_percentage": int((total_completed / total_content * 100)) if total_content > 0 else 0,
        "total_content_items": total_content,
        "completed_items": total_completed,
        "total_time_spent_minutes": total_time,
        "total_time_spent_hours": round(total_time / 60, 2),
        "stages_progress": stages_progress
    }


# ============================================================================
# Path Completion Report
# ============================================================================

@router.post("/path/{path_id}/complete-report", response_model=schemas.PathCompletionReportCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_path_completion_report(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Generate and store path completion report when path is 100% complete.
    Idempotent: returns existing report if already created.
    Uses path_completion_report_module for all logic.
    """
    try:
        result = await generate_path_completion_report(
            db=db,
            path_id=path_id,
            user_id=current_user.user_id,
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return schemas.PathCompletionReportCreateResponse(
        report_id=result.report_id,
        path_id=result.path_id,
        learning_summary=result.learning_summary,
        created_at=result.created_at,
    )


@router.get("/path/{path_id}/report", response_model=schemas.PathCompletionReportResponse)
def get_path_completion_report(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Retrieve path completion report for a path."""
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()

    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning path not found")

    report = db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == path_id
    ).first()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Path completion report not found")

    return report


def _build_before_context(db: Session, result: models.AssessmentResult) -> tuple:
    """Build before_context: assessment Q&A with scores. Returns (before_dict, before_context_list)."""
    session_questions = db.query(models.AssessmentSessionQuestion).filter(
        models.AssessmentSessionQuestion.session_id == result.session_id
    ).all()
    qa_list = []
    for sq in session_questions:
        q = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == sq.question_id
        ).first()
        r = db.query(models.AssessmentResponse).filter(
            models.AssessmentResponse.session_id == result.session_id,
            models.AssessmentResponse.question_id == sq.question_id,
        ).first()
        dim = "General"
        if q and q.dimension_id:
            d = db.query(models.AssessmentDimension).filter(
                models.AssessmentDimension.dimension_id == q.dimension_id
            ).first()
            dim = d.name if d else "General"
        if q and r:
            qa_list.append({
                "question_text": q.question_text,
                "user_answer": r.user_answer or "",
                "score": float(r.ai_score) if r.ai_score else None,
                "dimension": dim,
                "ai_explanation": r.ai_explanation or None,
            })
    before_score = float(result.overall_score) if result.overall_score else 0
    before_level = result.detected_level or ""
    before_dict = {"score": before_score, "level": before_level, "questions_and_answers": qa_list}
    schema_list = [
        schemas.ImprovementAnalysisBeforeContextItem(
            question_text=item["question_text"],
            user_answer=item["user_answer"],
            score=item.get("score"),
            dimension=item.get("dimension"),
            ai_explanation=item.get("ai_explanation"),
        )
        for item in qa_list
    ]
    return before_dict, schema_list


def _build_after_context_from_db(
    db: Session, path_id: int, user_id: int, eval_result: Optional[models.EvaluationResult], dialogue_rows: List
) -> tuple:
    """Build after_context (stages, content, evaluation scores) from DB. Returns (after_dict for AI, after_context schema)."""
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == user_id,
    ).first()
    if not path:
        return {}, None

    report = db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == path_id
    ).first()
    learning_summary = (report.learning_summary or "") if report else ""
    stages_data = []
    content_consumed = []
    if report and report.full_context:
        stages = report.full_context.get("stages") or []
        for s in stages:
            consumed = s.get("content_consumed") or []
            titles = [c.get("title") or "" for c in consumed]
            stages_data.append({
                "stage_name": s.get("stage_name", ""),
                "focus_area": s.get("focus_area", ""),
                "content_titles": titles,
            })
            content_consumed.extend(consumed)
    else:
        stages = db.query(models.LearningPathStage).filter(
            models.LearningPathStage.path_id == path_id
        ).order_by(models.LearningPathStage.stage_order).all()
        for stage in stages:
            sc = db.query(models.StageContent).filter(
                models.StageContent.stage_id == stage.stage_id
            ).all()
            titles = []
            for c in sc:
                p = db.query(models.UserContentProgress).filter(
                    models.UserContentProgress.user_id == user_id,
                    models.UserContentProgress.content_id == c.content_id,
                    models.UserContentProgress.is_completed == True,
                ).first()
                if p:
                    titles.append(c.title or "")
            stages_data.append({
                "stage_name": stage.stage_name,
                "focus_area": stage.focus_area or "",
                "content_titles": titles,
            })

    content_summary = ""
    if content_consumed:
        content_summary = " | ".join((c.get("title") or c.get("stage_name", "") for c in content_consumed[:20]))

    evaluation_scores = None
    readiness_level = None
    if eval_result:
        evaluation_scores = {
            "reasoning_score": float(eval_result.reasoning_score) if eval_result.reasoning_score is not None else None,
            "problem_solving": float(eval_result.problem_solving) if eval_result.problem_solving is not None else None,
        }
        readiness_level = eval_result.readiness_level

    dialogue_for_ai = [
        {"speaker": d.speaker, "text": d.message_text}
        for d in dialogue_rows
    ]

    after_dict_for_ai = {
        "evaluation_scores": evaluation_scores,
        "readiness_level": readiness_level,
        "learning_summary": learning_summary,
        "stages_summary": stages_data,
        "content_summary": content_summary,
        "dialogue_transcript": dialogue_for_ai,
    }
    # track_name is set by get_improvement_analysis when building the full response

    after_context_schema = schemas.ImprovementAnalysisAfterContext(
        stages_summary=stages_data,
        content_summary=content_summary or None,
        learning_summary=learning_summary or None,
        evaluation_scores=evaluation_scores,
        readiness_level=readiness_level,
    )
    return after_dict_for_ai, after_context_schema


def _build_chart_data(
    db: Session,
    path_id: int,
    user_id: int,
    result: models.AssessmentResult,
    eval_result: Optional[models.EvaluationResult],
    track_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Build chart-ready data from DB: score progression, time by stage, dimension scores, activity timeline. All from stored data."""
    chart_data = {
        "score_progression": [],
        "time_spent_by_stage": [],
        "dimension_scores": [],
        "activity_timeline": [],
    }

    track_suffix = f" ({track_name})" if track_name else ""
    before_label = f"Initial assessment{track_suffix}" if track_name else "Initial assessment"
    before_score = float(result.overall_score) if result.overall_score is not None else 0
    chart_data["score_progression"].append({"label": before_label, "value": round(before_score), "order": 1})
    if eval_result:
        r = float(eval_result.reasoning_score) if eval_result.reasoning_score is not None else 0
        p = float(eval_result.problem_solving) if eval_result.problem_solving is not None else 0
        chart_data["score_progression"].append({
            "label": f"Reasoning{track_suffix}" if track_name else "Reasoning (evaluation)",
            "value": round(r),
            "order": 2,
        })
        chart_data["score_progression"].append({
            "label": f"Problem solving{track_suffix}" if track_name else "Problem solving (evaluation)",
            "value": round(p),
            "order": 3,
        })

    dim_results = db.query(models.AssessmentDimensionResult).filter(
        models.AssessmentDimensionResult.session_id == result.session_id
    ).all()
    for dr in dim_results:
        dim = db.query(models.AssessmentDimension).filter(
            models.AssessmentDimension.dimension_id == dr.dimension_id
        ).first()
        name = dim.name if dim else f"Dimension {dr.dimension_id}"
        chart_data["dimension_scores"].append({
            "dimension": name,
            "score": round(float(dr.dimension_score) * 100) if dr.dimension_score is not None else 0,
        })

    stages = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.path_id == path_id
    ).order_by(models.LearningPathStage.stage_order).all()
    for stage in stages:
        content_items = db.query(models.StageContent).filter(
            models.StageContent.stage_id == stage.stage_id
        ).all()
        total_minutes = 0
        completed = 0
        for c in content_items:
            prog = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == user_id,
                models.UserContentProgress.content_id == c.content_id,
            ).first()
            if prog:
                total_minutes += prog.time_spent_minutes or 0
                if prog.is_completed:
                    completed += 1
        chart_data["time_spent_by_stage"].append({
            "stage_name": stage.stage_name or "",
            "minutes": total_minutes,
            "content_count": completed,
        })

    assess_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    if assess_session and assess_session.completed_at:
        chart_data["activity_timeline"].append({
            "date": assess_session.completed_at.isoformat() if hasattr(assess_session.completed_at, "isoformat") else str(assess_session.completed_at),
            "event_type": "assessment",
            "label": "Assessment completed",
        })

    for stage in stages:
        for c in db.query(models.StageContent).filter(models.StageContent.stage_id == stage.stage_id).all():
            prog = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == user_id,
                models.UserContentProgress.content_id == c.content_id,
                models.UserContentProgress.is_completed == True,
            ).first()
            if prog and prog.completed_at:
                chart_data["activity_timeline"].append({
                    "date": prog.completed_at.isoformat() if hasattr(prog.completed_at, "isoformat") else str(prog.completed_at),
                    "event_type": "content",
                    "label": f"Completed: {(c.title or '')[:40]}",
                })

    eval_session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.path_id == path_id,
        models.EvaluationSession.user_id == user_id,
        models.EvaluationSession.status == "completed",
    ).order_by(models.EvaluationSession.completed_at.desc()).first()
    if eval_session and eval_session.completed_at:
        chart_data["activity_timeline"].append({
            "date": eval_session.completed_at.isoformat() if hasattr(eval_session.completed_at, "isoformat") else str(eval_session.completed_at),
            "event_type": "evaluation",
            "label": "AI evaluation completed",
        })

    chart_data["activity_timeline"].sort(key=lambda x: x.get("date", ""))

    return chart_data


@router.get("/path/{path_id}/improvement-analysis", response_model=schemas.ImprovementAnalysisResponse)
async def get_improvement_analysis(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Compare before (assessment) vs after (evaluation) for a path. Rich before/after context and AI detailed analysis."""
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()

    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning path not found")

    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment result not found")

    assessment_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    track = None
    track_name = None
    if assessment_session:
        track = db.query(models.Track).filter(
            models.Track.track_id == assessment_session.track_id
        ).first()
        track_name = track.track_name if track else None

    before_dict, before_context_list = _build_before_context(db, result)
    before = {
        "score": before_dict["score"],
        "level": before_dict["level"],
    }

    eval_session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.path_id == path_id,
        models.EvaluationSession.user_id == current_user.user_id,
        models.EvaluationSession.status == "completed"
    ).order_by(models.EvaluationSession.completed_at.desc()).first()

    after = None
    improvement_summary = None
    improvement_percentage = None
    final_feedback = None
    dialogues = None
    after_context_schema = None
    detailed_analysis = None
    structured_report = None

    dialogue_rows = []
    eval_result = None
    if eval_session:
        eval_result = db.query(models.EvaluationResult).filter(
            models.EvaluationResult.evaluation_id == eval_session.evaluation_id
        ).first()
        dialogue_rows = db.query(models.EvaluationDialogue).filter(
            models.EvaluationDialogue.evaluation_id == eval_session.evaluation_id
        ).order_by(models.EvaluationDialogue.sequence_no.asc()).all()

        if eval_result:
            after = {
                "reasoning_score": float(eval_result.reasoning_score) if eval_result.reasoning_score else 0,
                "problem_solving": float(eval_result.problem_solving) if eval_result.problem_solving else 0,
                "readiness_level": eval_result.readiness_level,
            }
            final_feedback = eval_result.final_feedback

            before_score = before["score"]
            reasoning = float(eval_result.reasoning_score) if eval_result.reasoning_score is not None else 0
            problem_solving = float(eval_result.problem_solving) if eval_result.problem_solving else 0
            after_composite = (reasoning + problem_solving) / 2.0 if (reasoning is not None and problem_solving is not None) else reasoning
            if before_score is not None and after_composite is not None:
                denom = max(float(before_score), 1.0)
                improvement_percentage = round(((after_composite - before_score) / denom) * 100, 2)
            improved = improvement_percentage is not None and improvement_percentage > 0
            level_str = (before["level"] or "").replace("_", " ").title()
            after_level_str = (after["readiness_level"] or "").replace("_", " ").title()
            track_ref = f" for {track_name}" if track_name else ""
            if improved:
                improvement_summary = (
                    f"Before the platform: {before_score:.1f}% (initial assessment{track_ref}, {level_str}). "
                    f"After completing your {track_name or 'learning'} path and AI evaluation: Reasoning {reasoning:.1f}%, Problem solving {problem_solving:.1f}%, Readiness {after_level_str}."
                )
            else:
                improvement_summary = (
                    f"Before the platform: {before_score:.1f}% (initial assessment{track_ref}, {level_str}). "
                    f"After completing your {track_name or 'learning'} path and AI evaluation: Reasoning {reasoning:.1f}%, Problem solving {problem_solving:.1f}%, Readiness {after_level_str}. "
                    f"Comparison uses assessment score vs. average of evaluation scores."
                )

        after_dict_for_ai, after_context_schema = _build_after_context_from_db(
            db, path_id, current_user.user_id,
            eval_result if eval_session else None,
            dialogue_rows,
        )
        if report := db.query(models.PathCompletionReport).filter(
            models.PathCompletionReport.path_id == path_id
        ).first():
            after_dict_for_ai["learning_summary"] = report.learning_summary or ""
        after_dict_for_ai["track_name"] = track_name

        structured_report = await generate_structured_report(before_dict, after_dict_for_ai, track_name=track_name)
        chart_data = _build_chart_data(db, path_id, current_user.user_id, result, eval_result, track_name=track_name)
        structured_report["chart_data"] = chart_data
        structured_report["track_name"] = track_name

        existing = db.query(models.ProgressAnalysisReport).filter(
            models.ProgressAnalysisReport.path_id == path_id,
            models.ProgressAnalysisReport.user_id == current_user.user_id,
        ).first()
        if existing:
            existing.structured_report = structured_report
            existing.evaluation_id = eval_session.evaluation_id if eval_session else None
            db.add(existing)
        else:
            new_report = models.ProgressAnalysisReport(
                path_id=path_id,
                user_id=current_user.user_id,
                evaluation_id=eval_session.evaluation_id if eval_session else None,
                structured_report=structured_report,
            )
            db.add(new_report)
        db.commit()

        dialogues = [
            schemas.ImprovementAnalysisDialogueItem(
                speaker=d.speaker,
                message_text=d.message_text,
                sequence_no=d.sequence_no,
            )
            for d in dialogue_rows
        ]

    if structured_report is None:
        cached = db.query(models.ProgressAnalysisReport).filter(
            models.ProgressAnalysisReport.path_id == path_id,
            models.ProgressAnalysisReport.user_id == current_user.user_id,
        ).first()
        if cached and cached.structured_report:
            structured_report = cached.structured_report
            if track_name and isinstance(structured_report, dict):
                structured_report["track_name"] = track_name

    if structured_report and "chart_data" not in structured_report:
        eval_result_for_chart = None
        es = db.query(models.EvaluationSession).filter(
            models.EvaluationSession.path_id == path_id,
            models.EvaluationSession.user_id == current_user.user_id,
            models.EvaluationSession.status == "completed",
        ).order_by(models.EvaluationSession.completed_at.desc()).first()
        if es:
            eval_result_for_chart = db.query(models.EvaluationResult).filter(
                models.EvaluationResult.evaluation_id == es.evaluation_id
            ).first()
        structured_report["chart_data"] = _build_chart_data(
            db, path_id, current_user.user_id, result, eval_result_for_chart, track_name=track_name
        )

    return schemas.ImprovementAnalysisResponse(
        path_id=path_id,
        track_name=track_name,
        before=before,
        after=after,
        improvement_summary=improvement_summary,
        improvement_percentage=improvement_percentage,
        final_feedback=final_feedback,
        dialogues=dialogues,
        before_context=before_context_list,
        after_context=after_context_schema,
        detailed_analysis=detailed_analysis,
        structured_report=structured_report,
    )


# ============================================================================
# Evaluation Progress
# ============================================================================

@router.get("/evaluations/history")
def get_evaluation_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all evaluation attempts with scores over time
    """
    sessions = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.user_id == current_user.user_id,
        models.EvaluationSession.status == "completed"
    ).order_by(models.EvaluationSession.started_at.asc()).all()
    
    history = []
    for session in sessions:
        result = db.query(models.EvaluationResult).filter(
            models.EvaluationResult.evaluation_id == session.evaluation_id
        ).first()
        
        if result:
            # Get path info
            path = db.query(models.LearningPath).filter(
                models.LearningPath.path_id == session.path_id
            ).first()
            
            # Get track via assessment result
            assessment_result = db.query(models.AssessmentResult).filter(
                models.AssessmentResult.result_id == path.result_id
            ).first()
            
            assessment_session = db.query(models.AssessmentSession).filter(
                models.AssessmentSession.session_id == assessment_result.session_id
            ).first()
            
            track = db.query(models.Track).filter(
                models.Track.track_id == assessment_session.track_id
            ).first()
            
            history.append({
                "evaluation_id": session.evaluation_id,
                "track_name": track.track_name if track else "",
                "attempt_date": session.started_at,
                "completed_date": session.completed_at,
                "reasoning_score": float(result.reasoning_score),
                "problem_solving_score": float(result.problem_solving),
                "readiness_level": result.readiness_level,
                "final_feedback": result.final_feedback
            })
    
    return {
        "total_evaluations": len(history),
        "history": history,
        "progression": _calculate_evaluation_progression(history) if len(history) > 1 else None
    }


def _calculate_evaluation_progression(history: List) -> dict:
    """Calculate evaluation progression"""
    if len(history) < 2:
        return None
    
    first = history[0]
    latest = history[-1]
    
    return {
        "first_evaluation": {
            "date": first['attempt_date'],
            "reasoning_score": first['reasoning_score'],
            "problem_solving": first['problem_solving_score'],
            "readiness": first['readiness_level']
        },
        "latest_evaluation": {
            "date": latest['attempt_date'],
            "reasoning_score": latest['reasoning_score'],
            "problem_solving": latest['problem_solving_score'],
            "readiness": latest['readiness_level']
        },
        "improvement": {
            "reasoning_improvement": round(latest['reasoning_score'] - first['reasoning_score'], 2),
            "problem_solving_improvement": round(latest['problem_solving_score'] - first['problem_solving_score'], 2),
            "readiness_progression": f"{first['readiness_level']} → {latest['readiness_level']}"
        }
    }


# ============================================================================
# Complete Dashboard Summary
# ============================================================================

@router.get("/dashboard")
def get_user_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Complete dashboard with all progress metrics
    """
    # Get all track selections
    track_selections = db.query(models.UserTrackSelection).filter(
        models.UserTrackSelection.user_id == current_user.user_id
    ).all()
    
    # Get assessment stats
    total_assessments = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.user_id == current_user.user_id,
        models.AssessmentSession.status == "completed"
    ).count()
    
    # Get latest assessment result
    latest_assessment = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.user_id == current_user.user_id,
        models.AssessmentSession.status == "completed"
    ).order_by(models.AssessmentSession.started_at.desc()).first()
    
    latest_result = None
    if latest_assessment:
        result = db.query(models.AssessmentResult).filter(
            models.AssessmentResult.session_id == latest_assessment.session_id
        ).first()
        if result:
            latest_result = {
                "score": float(result.overall_score),
                "level": result.detected_level,
                "date": latest_assessment.started_at
            }
    
    # Get learning paths
    learning_paths = db.query(models.LearningPath).filter(
        models.LearningPath.user_id == current_user.user_id
    ).all()
    
    # Calculate total content completion
    total_content_items = 0
    completed_content_items = 0
    total_learning_time = 0
    
    for path in learning_paths:
        stages = db.query(models.LearningPathStage).filter(
            models.LearningPathStage.path_id == path.path_id
        ).all()
        
        for stage in stages:
            content_items = db.query(models.StageContent).filter(
                models.StageContent.stage_id == stage.stage_id
            ).all()
            
            total_content_items += len(content_items)
            
            for content in content_items:
                progress = db.query(models.UserContentProgress).filter(
                    models.UserContentProgress.user_id == current_user.user_id,
                    models.UserContentProgress.content_id == content.content_id
                ).first()
                
                if progress:
                    if progress.is_completed:
                        completed_content_items += 1
                    total_learning_time += progress.time_spent_minutes
    
    # Get evaluation stats
    total_evaluations = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.user_id == current_user.user_id,
        models.EvaluationSession.status == "completed"
    ).count()
    
    # Get latest evaluation
    latest_evaluation_session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.user_id == current_user.user_id,
        models.EvaluationSession.status == "completed"
    ).order_by(models.EvaluationSession.started_at.desc()).first()
    
    latest_evaluation = None
    if latest_evaluation_session:
        eval_result = db.query(models.EvaluationResult).filter(
            models.EvaluationResult.evaluation_id == latest_evaluation_session.evaluation_id
        ).first()
        if eval_result:
            latest_evaluation = {
                "reasoning_score": float(eval_result.reasoning_score),
                "problem_solving": float(eval_result.problem_solving),
                "readiness_level": eval_result.readiness_level,
                "date": latest_evaluation_session.started_at
            }
    
    # Get skill profile
    skill_profile = db.query(models.SkillProfile).filter(
        models.SkillProfile.user_id == current_user.user_id
    ).first()
    
    return {
        "user": {
            "user_id": current_user.user_id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "member_since": current_user.created_at
        },
        "tracks": {
            "total_selected": len(track_selections),
            "tracks": [{"track_id": ts.track_id, "selected_at": ts.selected_at} for ts in track_selections]
        },
        "assessments": {
            "total_completed": total_assessments,
            "latest_result": latest_result
        },
        "learning": {
            "total_learning_paths": len(learning_paths),
            "total_content_items": total_content_items,
            "completed_items": completed_content_items,
            "completion_percentage": int((completed_content_items / total_content_items * 100)) if total_content_items > 0 else 0,
            "total_time_hours": round(total_learning_time / 60, 2)
        },
        "evaluations": {
            "total_completed": total_evaluations,
            "latest_result": latest_evaluation
        },
        "skill_profile": {
            "strengths": skill_profile.strengths if skill_profile else "",
            "weaknesses": skill_profile.weaknesses if skill_profile else "",
            "thinking_pattern": skill_profile.thinking_pattern if skill_profile else ""
        } if skill_profile else None
    }


# ============================================================================
# Time-Based Analytics
# ============================================================================

@router.get("/analytics/timeline")
def get_timeline_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get timeline of learning activity
    """
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get content completion timeline
    content_progress = db.query(models.UserContentProgress).filter(
        models.UserContentProgress.user_id == current_user.user_id,
        models.UserContentProgress.started_at >= start_date
    ).order_by(models.UserContentProgress.started_at.asc()).all()
    
    # Get assessment timeline
    assessments = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.user_id == current_user.user_id,
        models.AssessmentSession.started_at >= start_date
    ).order_by(models.AssessmentSession.started_at.asc()).all()
    
    # Get evaluation timeline
    evaluations = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.user_id == current_user.user_id,
        models.EvaluationSession.started_at >= start_date
    ).order_by(models.EvaluationSession.started_at.asc()).all()
    
    timeline = []
    
    # Add content events
    for progress in content_progress:
        timeline.append({
            "type": "content_progress",
            "date": progress.started_at,
            "details": {
                "content_id": progress.content_id,
                "completed": progress.is_completed,
                "time_spent": progress.time_spent_minutes
            }
        })
    
    # Add assessment events
    for assessment in assessments:
        result = db.query(models.AssessmentResult).filter(
            models.AssessmentResult.session_id == assessment.session_id
        ).first()
        
        timeline.append({
            "type": "assessment",
            "date": assessment.started_at,
            "details": {
                "session_id": assessment.session_id,
                "track_id": assessment.track_id,
                "score": float(result.overall_score) if result else None,
                "level": result.detected_level if result else None
            }
        })
    
    # Add evaluation events
    for evaluation in evaluations:
        eval_result = db.query(models.EvaluationResult).filter(
            models.EvaluationResult.evaluation_id == evaluation.evaluation_id
        ).first()
        
        timeline.append({
            "type": "evaluation",
            "date": evaluation.started_at,
            "details": {
                "evaluation_id": evaluation.evaluation_id,
                "reasoning_score": float(eval_result.reasoning_score) if eval_result else None,
                "readiness_level": eval_result.readiness_level if eval_result else None
            }
        })
    
    # Sort by date
    timeline.sort(key=lambda x: x['date'])
    
    return {
        "period_days": days,
        "start_date": start_date,
        "end_date": datetime.utcnow(),
        "total_events": len(timeline),
        "timeline": timeline
    }



