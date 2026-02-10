"""
Learning router - handles AI-generated learning paths and stages
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user
from app.services.learning_service import learning_service
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/learning", tags=["Learning Paths"])


@router.post("/paths", response_model=schemas.LearningPathResponse, status_code=status.HTTP_201_CREATED)
async def create_learning_path(
    path_data: schemas.LearningPathCreate,
    auto_generate_content: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Generate AI-powered personalized learning path based on assessment results
    If auto_generate_content=True, automatically generates learning materials for each stage
    """
    # Verify assessment result exists and belongs to user
    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path_data.result_id
    ).first()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment result not found"
        )
    
    # Verify the assessment session belongs to current user
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id,
        models.AssessmentSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment result does not belong to you"
        )
    
    # Get track info
    track = db.query(models.Track).filter(
        models.Track.track_id == session.track_id
    ).first()
    
    # Get user's skill profile
    skill_profile = db.query(models.SkillProfile).filter(
        models.SkillProfile.user_id == current_user.user_id
    ).first()
    
    if not skill_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Skill profile not found. Complete assessment first."
        )
    
    profile_dict = {
        "strengths": skill_profile.strengths,
        "weaknesses": skill_profile.weaknesses,
        "thinking_pattern": skill_profile.thinking_pattern
    }
    
    # Generate AI-powered learning path with stages (and optionally content)
    learning_path = await learning_service.create_learning_path_with_stages(
        db=db,
        user_id=current_user.user_id,
        result_id=path_data.result_id,
        track_name=track.track_name,
        detected_level=result.detected_level,
        skill_profile=profile_dict,
        auto_generate_content=auto_generate_content
    )
    
    return learning_path


@router.get("/paths/{path_id}", response_model=schemas.LearningPathResponse)
def get_learning_path(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get a specific learning path with all stages
    """
    learning_path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not learning_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not found"
        )
    
    return learning_path


@router.get("/my-paths", response_model=List[schemas.LearningPathResponse])
def get_my_learning_paths(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all learning paths for current user
    """
    paths = db.query(models.LearningPath).filter(
        models.LearningPath.user_id == current_user.user_id
    ).order_by(models.LearningPath.created_at.desc()).all()
    
    return paths


@router.get("/my-current-path", response_model=schemas.LearningPathResponse)
def get_my_current_path(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get user's most recent learning path
    """
    path = db.query(models.LearningPath).filter(
        models.LearningPath.user_id == current_user.user_id
    ).order_by(models.LearningPath.created_at.desc()).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No learning path found. Complete assessment first."
        )
    
    return path


@router.get("/stages/{stage_id}", response_model=schemas.LearningPathStageResponse)
def get_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get details of a specific learning stage
    """
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == stage_id
    ).first()
    
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning stage not found"
        )
    
    # Verify the stage belongs to user's path
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Stage does not belong to your learning path"
        )
    
    return stage


@router.get("/paths/{path_id}/stages", response_model=List[schemas.LearningPathStageResponse])
def get_path_stages(
    path_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all stages for a learning path in order
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
    
    stages = learning_service.get_all_stages_for_path(db, path_id)
    return stages


@router.get("/skill-profile", response_model=schemas.SkillProfileResponse)
def get_my_skill_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get current user's skill profile
    """
    profile = db.query(models.SkillProfile).filter(
        models.SkillProfile.user_id == current_user.user_id
    ).first()
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Skill profile not found. Complete assessment first."
        )
    
    return profile

