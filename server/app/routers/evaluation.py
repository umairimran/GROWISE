"""
Evaluation router - handles conversation-based skill evaluation
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Any, Dict, List
from datetime import datetime

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/evaluation", tags=["Skill Evaluation"])


def _get_full_context_for_path(
    db: Session,
    path_id: int,
    user_id: int,
) -> Dict[str, Any]:
    """Get full_context for evaluation: from PathCompletionReport or build from DB."""
    report = db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == path_id
    ).first()
    if report:
        return report.full_context

    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == user_id,
    ).first()
    if not path:
        return {}

    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()
    if not result:
        return {}

    stages = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.path_id == path_id
    ).order_by(models.LearningPathStage.stage_order).all()
    assessment_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    track = db.query(models.Track).filter(
        models.Track.track_id == assessment_session.track_id
    ).first() if assessment_session else None
    if not track:
        return {}

    session_questions = db.query(models.AssessmentSessionQuestion).filter(
        models.AssessmentSessionQuestion.session_id == result.session_id
    ).all()
    questions_and_answers = []
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
            questions_and_answers.append({
                "question_text": q.question_text,
                "user_answer": r.user_answer,
                "score": float(r.ai_score) if r.ai_score else 0,
                "dimension": dim,
                "ai_explanation": r.ai_explanation or "",
            })

    stages_data = []
    content_consumed = []
    for stage in stages:
        sc = db.query(models.StageContent).filter(
            models.StageContent.stage_id == stage.stage_id
        ).all()
        consumed = []
        for c in sc:
            p = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == user_id,
                models.UserContentProgress.content_id == c.content_id,
                models.UserContentProgress.is_completed == True,
            ).first()
            if p:
                item = {
                    "content_id": c.content_id,
                    "title": c.title,
                    "description": c.description or "",
                    "stage_name": stage.stage_name,
                }
                consumed.append(item)
                content_consumed.append(item)
        stages_data.append({
            "stage_id": stage.stage_id,
            "stage_name": stage.stage_name,
            "focus_area": stage.focus_area,
            "content_consumed": consumed,
        })

    return {
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


@router.post("/sessions", response_model=schemas.EvaluationSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_evaluation_session(
    session_data: schemas.EvaluationSessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Start a new AI interview evaluation session with full user context
    AI interviewer has access to:
    - All assessment scores and feedback
    - Learning path progress
    - Content completion status
    - Previous evaluation attempts
    """
    # Verify learning path exists and belongs to user
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == session_data.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found"
        )
    
    # Get assessment result to understand user's baseline
    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment result not found for this path"
        )
    # Get assessment session for track info
    assessment_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    if not assessment_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment session not found for this path"
        )
    # Get track info
    track = db.query(models.Track).filter(
        models.Track.track_id == assessment_session.track_id
    ).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track not found for this path"
        )
    
    # Get user's skill profile
    skill_profile = db.query(models.SkillProfile).filter(
        models.SkillProfile.user_id == current_user.user_id
    ).first()
    
    # Get learning path stages for context
    stages = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.path_id == session_data.path_id
    ).order_by(models.LearningPathStage.stage_order).all()
    
    # Get content completion rate
    total_content = 0
    completed_content = 0
    for stage in stages:
        stage_content = db.query(models.StageContent).filter(
            models.StageContent.stage_id == stage.stage_id
        ).all()
        total_content += len(stage_content)
        
        for content in stage_content:
            progress = db.query(models.UserContentProgress).filter(
                models.UserContentProgress.user_id == current_user.user_id,
                models.UserContentProgress.content_id == content.content_id,
                models.UserContentProgress.is_completed == True
            ).first()
            if progress:
                completed_content += 1
    
    completion_rate = int((completed_content / total_content * 100)) if total_content > 0 else 0

    # Load PathCompletionReport for learning_summary (if path is 100% complete)
    completion_report = db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == session_data.path_id
    ).first()

    # Get full_context: from PathCompletionReport or build from DB
    full_context = _get_full_context_for_path(db, session_data.path_id, current_user.user_id)

    # Create evaluation session
    new_session = models.EvaluationSession(
        user_id=current_user.user_id,
        path_id=session_data.path_id,
        status="in_progress"
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    # Generate context-aware initial message from AI
    context = {
        "track_name": track.track_name,
        "detected_level": result.detected_level,
        "overall_score": float(result.overall_score),
        "strengths": skill_profile.strengths if skill_profile else "",
        "weaknesses": skill_profile.weaknesses if skill_profile else "",
        "completion_rate": completion_rate,
        "stages_count": len(stages)
    }
    if completion_report:
        context["learning_summary"] = completion_report.learning_summary
    context["full_context"] = full_context

    initial_message = await ai_service.generate_evaluation_intro(context)
    
    # Add initial AI dialogue with context
    initial_dialogue = models.EvaluationDialogue(
        evaluation_id=new_session.evaluation_id,
        speaker="ai",
        message_text=initial_message,
        sequence_no=1
    )
    db.add(initial_dialogue)
    db.commit()
    
    return new_session


@router.get("/sessions/{evaluation_id}", response_model=schemas.EvaluationSessionResponse)
def get_evaluation_session(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get details of an evaluation session
    """
    session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.evaluation_id == evaluation_id,
        models.EvaluationSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation session not found"
        )
    
    return session


@router.get("/my-sessions", response_model=List[schemas.EvaluationSessionResponse])
def get_my_evaluation_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all evaluation sessions for current user
    """
    sessions = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.user_id == current_user.user_id
    ).order_by(models.EvaluationSession.started_at.desc()).all()
    
    return sessions


# ============================================================================
# Evaluation Dialogues
# ============================================================================

@router.post("/sessions/{evaluation_id}/respond", response_model=schemas.EvaluationDialogueResponse)
async def respond_to_evaluation(
    evaluation_id: int,
    dialogue_data: schemas.EvaluationDialogueCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Submit a response in the evaluation conversation
    """
    # Verify evaluation session
    session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.evaluation_id == evaluation_id,
        models.EvaluationSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation session not found"
        )
    
    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Evaluation already completed"
        )
    
    # Get current dialogue count for sequence number
    dialogue_count = db.query(models.EvaluationDialogue).filter(
        models.EvaluationDialogue.evaluation_id == evaluation_id
    ).count()
    
    # Save user response
    user_dialogue = models.EvaluationDialogue(
        evaluation_id=evaluation_id,
        speaker="user",
        message_text=dialogue_data.message_text,
        sequence_no=dialogue_count + 1
    )
    db.add(user_dialogue)
    db.commit()
    db.refresh(user_dialogue)
    
    # Generate AI follow-up question or feedback
    # Get previous dialogues for context
    previous_dialogues = db.query(models.EvaluationDialogue).filter(
        models.EvaluationDialogue.evaluation_id == evaluation_id
    ).order_by(models.EvaluationDialogue.sequence_no.asc()).all()
    
    dialogue_history = [
        {"speaker": d.speaker, "text": d.message_text}
        for d in previous_dialogues
    ]

    # Get full context for AI follow-up (from PathCompletionReport or build from DB)
    full_context = _get_full_context_for_path(db, session.path_id, current_user.user_id)

    ai_response_text = await ai_service.generate_evaluation_followup(
        dialogue_history=dialogue_history,
        full_context=full_context
    )
    
    # Save AI response
    ai_dialogue = models.EvaluationDialogue(
        evaluation_id=evaluation_id,
        speaker="ai",
        message_text=ai_response_text,
        sequence_no=dialogue_count + 2
    )
    db.add(ai_dialogue)
    db.commit()
    db.refresh(ai_dialogue)
    
    return ai_dialogue


@router.get("/sessions/{evaluation_id}/dialogues", response_model=List[schemas.EvaluationDialogueResponse])
def get_evaluation_dialogues(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all dialogues in an evaluation session
    """
    # Verify evaluation session belongs to user
    session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.evaluation_id == evaluation_id,
        models.EvaluationSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation session not found"
        )
    
    dialogues = db.query(models.EvaluationDialogue).filter(
        models.EvaluationDialogue.evaluation_id == evaluation_id
    ).order_by(models.EvaluationDialogue.sequence_no.asc()).all()
    
    return dialogues


# ============================================================================
# Complete Evaluation and Generate Results
# ============================================================================

@router.post("/sessions/{evaluation_id}/complete", response_model=schemas.EvaluationResultResponse)
async def complete_evaluation(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Complete the evaluation and generate AI-powered results
    """
    # Verify evaluation session
    session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.evaluation_id == evaluation_id,
        models.EvaluationSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation session not found"
        )
    
    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Evaluation already completed"
        )
    
    # Get all dialogues
    dialogues = db.query(models.EvaluationDialogue).filter(
        models.EvaluationDialogue.evaluation_id == evaluation_id
    ).order_by(models.EvaluationDialogue.sequence_no.asc()).all()
    
    if len(dialogues) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not enough conversation to evaluate. Continue the discussion."
        )
    
    # Get learning path info
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == session.path_id
    ).first()
    
    # Prepare dialogue data for AI evaluation
    dialogue_data = [
        {"speaker": d.speaker, "text": d.message_text, "sequence": d.sequence_no}
        for d in dialogues
    ]

    # Get full context (from PathCompletionReport or build from DB)
    completion_report = db.query(models.PathCompletionReport).filter(
        models.PathCompletionReport.path_id == path.path_id
    ).first()
    full_context = _get_full_context_for_path(db, path.path_id, current_user.user_id)
    path_info = {
        "path_id": path.path_id,
        "result_id": path.result_id,
        "full_context": full_context,
    }
    if completion_report:
        path_info["learning_summary"] = completion_report.learning_summary

    # AI evaluates conversation with full context
    evaluation_results = await ai_service.evaluate_conversation(
        dialogues=dialogue_data,
        path_info=path_info
    )
    
    # Create evaluation result
    result = models.EvaluationResult(
        evaluation_id=evaluation_id,
        reasoning_score=evaluation_results["reasoning_score"],
        problem_solving=evaluation_results["problem_solving"],
        final_feedback=evaluation_results["final_feedback"],
        readiness_level=evaluation_results["readiness_level"]
    )
    
    db.add(result)
    
    # Update session status
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(result)
    
    return result


@router.get("/sessions/{evaluation_id}/result", response_model=schemas.EvaluationResultResponse)
def get_evaluation_result(
    evaluation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get the result of a completed evaluation
    """
    # Verify evaluation session belongs to user
    session = db.query(models.EvaluationSession).filter(
        models.EvaluationSession.evaluation_id == evaluation_id,
        models.EvaluationSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation session not found"
        )
    
    result = db.query(models.EvaluationResult).filter(
        models.EvaluationResult.evaluation_id == evaluation_id
    ).first()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not completed yet"
        )
    
    return result

