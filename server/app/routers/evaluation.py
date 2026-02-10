"""
Evaluation router - handles conversation-based skill evaluation
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/evaluation", tags=["Skill Evaluation"])


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
    
    # Get assessment session for track info
    assessment_session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    
    # Get track info
    track = db.query(models.Track).filter(
        models.Track.track_id == assessment_session.track_id
    ).first()
    
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
    
    # Simple AI response (can be enhanced with real AI)
    if len(previous_dialogues) < 10:
        ai_response_text = f"Thank you for your response. Let me ask you another question to assess your understanding better..."
    else:
        ai_response_text = "Thank you for your detailed responses. We have enough information to evaluate your skills now."
    
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
    
    path_info = {
        "path_id": path.path_id,
        "result_id": path.result_id
    }
    
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

