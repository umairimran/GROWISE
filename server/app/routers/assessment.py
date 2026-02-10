"""
Assessment router - handles AI-driven skill assessment
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user, get_admin_user
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/assessment", tags=["Assessment"])


# ============================================================================
# Assessment Question Pool Management (Admin)
# ============================================================================

@router.post("/questions", response_model=schemas.AssessmentQuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(
    question_data: schemas.AssessmentQuestionCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Add a question to the assessment pool (Admin only)
    """
    new_question = models.AssessmentQuestionPool(**question_data.model_dump())
    db.add(new_question)
    db.commit()
    db.refresh(new_question)
    return new_question


@router.get("/questions/track/{track_id}", response_model=List[schemas.AssessmentQuestionResponse])
def get_questions_by_track(
    track_id: int,
    db: Session = Depends(get_db),
    difficulty: str = None
):
    """
    Get assessment questions for a specific track
    """
    query = db.query(models.AssessmentQuestionPool).filter(
        models.AssessmentQuestionPool.track_id == track_id
    )
    
    if difficulty:
        query = query.filter(models.AssessmentQuestionPool.difficulty == difficulty)
    
    questions = query.all()
    return questions


# ============================================================================
# Assessment Session Management
# ============================================================================

@router.post("/sessions", response_model=schemas.AssessmentSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment_session(
    session_data: schemas.AssessmentSessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Start a new assessment session for a user
    """
    # Verify track exists
    track = db.query(models.Track).filter(
        models.Track.track_id == session_data.track_id
    ).first()
    
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )
    
    # Create assessment session
    new_session = models.AssessmentSession(
        user_id=current_user.user_id,
        track_id=session_data.track_id,
        status="in_progress"
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    # Generate AI-powered questions dynamically
    ai_questions = await ai_service.generate_assessment_questions(
        track_name=track.track_name,
        difficulty="medium",
        count=5
    )
    
    # Add questions to pool and link to session
    for q_data in ai_questions:
        # Create question in pool
        question = models.AssessmentQuestionPool(
            track_id=session_data.track_id,
            question_text=q_data["question_text"],
            question_type=q_data["question_type"],
            difficulty=q_data["difficulty"]
        )
        db.add(question)
        db.flush()
        
        # Link question to session
        session_question = models.AssessmentSessionQuestion(
            session_id=new_session.session_id,
            question_id=question.question_id
        )
        db.add(session_question)
    
    db.commit()
    db.refresh(new_session)
    
    return new_session


@router.get("/sessions/{session_id}", response_model=schemas.AssessmentSessionResponse)
def get_assessment_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get details of an assessment session
    """
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found"
        )
    
    return session


@router.get("/sessions/{session_id}/questions", response_model=List[schemas.AssessmentQuestionResponse])
def get_session_questions(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all questions for an assessment session
    """
    # Verify session belongs to user
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found"
        )
    
    # Get questions for this session
    session_questions = db.query(models.AssessmentSessionQuestion).filter(
        models.AssessmentSessionQuestion.session_id == session_id
    ).all()
    
    questions = [sq.question for sq in session_questions]
    return questions


# ============================================================================
# Assessment Response Submission
# ============================================================================

@router.post("/sessions/{session_id}/submit", response_model=schemas.AssessmentResponseResponse)
async def submit_answer(
    session_id: int,
    answer_data: schemas.AssessmentAnswerSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Submit an answer for a question in the assessment
    """
    # Verify session
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found"
        )
    
    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment already completed"
        )
    
    # Verify question belongs to this session
    session_question = db.query(models.AssessmentSessionQuestion).filter(
        models.AssessmentSessionQuestion.session_id == session_id,
        models.AssessmentSessionQuestion.question_id == answer_data.question_id
    ).first()
    
    if not session_question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question not part of this assessment"
        )
    
    # Get question details
    question = db.query(models.AssessmentQuestionPool).filter(
        models.AssessmentQuestionPool.question_id == answer_data.question_id
    ).first()
    
    # AI evaluates the answer with comprehensive analysis
    ai_evaluation = await ai_service.evaluate_answer(
        question_text=question.question_text,
        user_answer=answer_data.user_answer,
        question_type=question.question_type
    )
    
    # Save response with detailed feedback (all in explanation field)
    response = models.AssessmentResponse(
        session_id=session_id,
        question_id=answer_data.question_id,
        user_answer=answer_data.user_answer,
        ai_score=ai_evaluation['score'],
        ai_explanation=ai_evaluation['explanation']
    )
    
    db.add(response)
    db.commit()
    db.refresh(response)
    
    return response


@router.post("/sessions/{session_id}/complete", response_model=schemas.AssessmentResultResponse)
async def complete_assessment(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Complete the assessment and generate results with AI analysis
    """
    # Verify session
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found"
        )
    
    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment already completed"
        )
    
    # Get all responses for this session
    responses = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id
    ).all()
    
    if not responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No answers submitted yet"
        )
    
    # Calculate overall score
    total_score = sum([float(r.ai_score) for r in responses if r.ai_score])
    overall_score = (total_score / len(responses)) * 100
    
    # Determine skill level
    if overall_score >= 80:
        detected_level = "advanced"
    elif overall_score >= 60:
        detected_level = "intermediate"
    else:
        detected_level = "beginner"
    
    # AI generates reasoning
    response_data = [{"answer": r.user_answer, "score": float(r.ai_score)} for r in responses]
    ai_reasoning = f"Based on {len(responses)} responses with average score {overall_score:.2f}, user demonstrates {detected_level} level understanding."
    
    # Create assessment result
    result = models.AssessmentResult(
        session_id=session_id,
        overall_score=overall_score,
        detected_level=detected_level,
        ai_reasoning=ai_reasoning
    )
    
    db.add(result)
    
    # Update session status
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    
    # Generate skill profile
    skill_profile_data = await ai_service.analyze_skill_profile(
        responses=response_data,
        overall_score=overall_score
    )
    
    # Check if user already has a skill profile
    existing_profile = db.query(models.SkillProfile).filter(
        models.SkillProfile.user_id == current_user.user_id
    ).first()
    
    if existing_profile:
        # Update existing profile
        existing_profile.strengths = skill_profile_data["strengths"]
        existing_profile.weaknesses = skill_profile_data["weaknesses"]
        existing_profile.thinking_pattern = skill_profile_data["thinking_pattern"]
    else:
        # Create new profile
        skill_profile = models.SkillProfile(
            user_id=current_user.user_id,
            strengths=skill_profile_data["strengths"],
            weaknesses=skill_profile_data["weaknesses"],
            thinking_pattern=skill_profile_data["thinking_pattern"]
        )
        db.add(skill_profile)
    
    db.commit()
    db.refresh(result)
    
    return result


@router.get("/sessions/{session_id}/result", response_model=schemas.AssessmentResultResponse)
def get_assessment_result(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get the result of a completed assessment
    """
    # Verify session belongs to user
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment session not found"
        )
    
    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.session_id == session_id
    ).first()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not completed yet"
        )
    
    return result


@router.get("/my-sessions", response_model=List[schemas.AssessmentSessionResponse])
def get_my_assessment_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all assessment sessions for the current user
    """
    sessions = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.user_id == current_user.user_id
    ).order_by(models.AssessmentSession.started_at.desc()).all()
    
    return sessions

