"""
Content router - handles learning content and user progress
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/content", tags=["Learning Content"])


# ============================================================================
# Content Generation (Automatic)
# ============================================================================

@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_content_for_stage(
    request: schemas.GenerateStageContentRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Generate AI-powered learning content for a stage
    This endpoint automatically creates videos, docs, exercises, etc.
    """
    # Verify stage exists and belongs to user's learning path
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == request.stage_id
    ).first()
    
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning stage not found"
        )
    
    # Verify stage belongs to user's learning path
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Learning stage does not belong to you"
        )
    
    # Check if content already exists for this stage
    existing_content = db.query(models.StageContent).filter(
        models.StageContent.stage_id == request.stage_id
    ).first()
    
    if existing_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content already generated for this stage. Use GET to retrieve it."
        )
    
    # Get assessment result to determine difficulty level
    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()
    
    # Get track info
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == result.session_id
    ).first()
    
    track = db.query(models.Track).filter(
        models.Track.track_id == session.track_id
    ).first()
    
    # Generate content using AI
    content_items = await ai_service.generate_stage_content(
        stage_name=stage.stage_name,
        focus_area=stage.focus_area,
        difficulty_level=result.detected_level,
        track_name=track.track_name,
        content_count=request.content_count
    )
    
    # Save content to database
    created_content = []
    for idx, item in enumerate(content_items, start=1):
        content = models.StageContent(
            stage_id=request.stage_id,
            content_type=item["content_type"],
            title=item["title"],
            description=item["description"],
            url=item.get("url"),
            content_text=item.get("content_text"),
            difficulty_level=item["difficulty_level"],
            order_index=idx,
            estimated_duration=item.get("estimated_duration"),
            source_platform=item.get("source_platform"),
            tags=item.get("tags")
        )
        db.add(content)
        created_content.append(content)
    
    db.commit()
    
    return {
        "message": f"Successfully generated {len(created_content)} content items",
        "stage_id": request.stage_id,
        "content_count": len(created_content)
    }


# ============================================================================
# Get Content for Stage
# ============================================================================

@router.get("/stage/{stage_id}", response_model=List[schemas.StageContentWithProgress])
def get_stage_content(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all learning content for a stage with user's progress
    """
    # Verify stage exists and belongs to user
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == stage_id
    ).first()
    
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning stage not found"
        )
    
    # Verify stage belongs to user's learning path
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Learning stage does not belong to you"
        )
    
    # Get all content for this stage
    content_items = db.query(models.StageContent).filter(
        models.StageContent.stage_id == stage_id
    ).order_by(models.StageContent.order_index).all()
    
    # Get user's progress for each content item
    result = []
    for content in content_items:
        progress = db.query(models.UserContentProgress).filter(
            models.UserContentProgress.user_id == current_user.user_id,
            models.UserContentProgress.content_id == content.content_id
        ).first()
        
        content_dict = schemas.StageContentResponse.model_validate(content).model_dump()
        content_dict["progress"] = schemas.UserContentProgressResponse.model_validate(progress).model_dump() if progress else None
        result.append(schemas.StageContentWithProgress(**content_dict))
    
    return result


# ============================================================================
# User Progress Management
# ============================================================================

@router.post("/progress", response_model=schemas.UserContentProgressResponse, status_code=status.HTTP_201_CREATED)
def start_content(
    progress_data: schemas.UserContentProgressCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Start tracking progress for a content item
    """
    # Verify content exists
    content = db.query(models.StageContent).filter(
        models.StageContent.content_id == progress_data.content_id
    ).first()
    
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
    
    # Check if progress already exists
    existing_progress = db.query(models.UserContentProgress).filter(
        models.UserContentProgress.user_id == current_user.user_id,
        models.UserContentProgress.content_id == progress_data.content_id
    ).first()
    
    if existing_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Progress already exists for this content. Use PUT to update."
        )
    
    # Create progress record
    progress = models.UserContentProgress(
        user_id=current_user.user_id,
        content_id=progress_data.content_id,
        completion_percentage=progress_data.completion_percentage or 0,
        time_spent_minutes=progress_data.time_spent_minutes or 0,
        notes=progress_data.notes
    )
    
    db.add(progress)
    db.commit()
    db.refresh(progress)
    
    return progress


@router.put("/progress/{content_id}", response_model=schemas.UserContentProgressResponse)
def update_content_progress(
    content_id: int,
    progress_data: schemas.UserContentProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Update progress for a content item
    """
    progress = db.query(models.UserContentProgress).filter(
        models.UserContentProgress.user_id == current_user.user_id,
        models.UserContentProgress.content_id == content_id
    ).first()
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progress not found. Use POST to start tracking."
        )
    
    # Update fields
    if progress_data.is_completed is not None:
        progress.is_completed = progress_data.is_completed
        if progress_data.is_completed and not progress.completed_at:
            from datetime import datetime
            progress.completed_at = datetime.utcnow()
    
    if progress_data.completion_percentage is not None:
        progress.completion_percentage = progress_data.completion_percentage
    
    if progress_data.time_spent_minutes is not None:
        progress.time_spent_minutes = progress_data.time_spent_minutes
    
    if progress_data.notes is not None:
        progress.notes = progress_data.notes
    
    db.commit()
    db.refresh(progress)
    
    return progress


@router.post("/{content_id}/complete", response_model=schemas.UserContentProgressResponse)
def mark_content_complete(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Mark a content item as completed
    """
    # Check if progress exists
    progress = db.query(models.UserContentProgress).filter(
        models.UserContentProgress.user_id == current_user.user_id,
        models.UserContentProgress.content_id == content_id
    ).first()
    
    if not progress:
        # Create progress if it doesn't exist
        content = db.query(models.StageContent).filter(
            models.StageContent.content_id == content_id
        ).first()
        
        if not content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Content not found"
            )
        
        progress = models.UserContentProgress(
            user_id=current_user.user_id,
            content_id=content_id,
            is_completed=True,
            completion_percentage=100
        )
        db.add(progress)
    else:
        progress.is_completed = True
        progress.completion_percentage = 100
    
    from datetime import datetime
    progress.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(progress)
    
    return progress


@router.get("/stage/{stage_id}/progress", response_model=schemas.StageProgressSummary)
def get_stage_progress(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get user's progress summary for a stage
    """
    # Verify stage exists and belongs to user
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == stage_id
    ).first()
    
    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning stage not found"
        )
    
    # Verify stage belongs to user's learning path
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Learning stage does not belong to you"
        )
    
    # Get all content for this stage
    content_items = db.query(models.StageContent).filter(
        models.StageContent.stage_id == stage_id
    ).all()
    
    total_content = len(content_items)
    
    if total_content == 0:
        return schemas.StageProgressSummary(
            stage_id=stage_id,
            stage_name=stage.stage_name,
            total_content_items=0,
            completed_items=0,
            completion_percentage=0,
            total_time_spent_minutes=0,
            estimated_time_remaining=0
        )
    
    # Get user's progress
    completed_count = 0
    total_time_spent = 0
    total_estimated_time = 0
    
    for content in content_items:
        progress = db.query(models.UserContentProgress).filter(
            models.UserContentProgress.user_id == current_user.user_id,
            models.UserContentProgress.content_id == content.content_id
        ).first()
        
        if progress and progress.is_completed:
            completed_count += 1
        
        if progress:
            total_time_spent += progress.time_spent_minutes
        
        if content.estimated_duration:
            total_estimated_time += content.estimated_duration
    
    completion_percentage = int((completed_count / total_content) * 100) if total_content > 0 else 0
    estimated_remaining = max(0, total_estimated_time - total_time_spent)
    
    return schemas.StageProgressSummary(
        stage_id=stage_id,
        stage_name=stage.stage_name,
        total_content_items=total_content,
        completed_items=completed_count,
        completion_percentage=completion_percentage,
        total_time_spent_minutes=total_time_spent,
        estimated_time_remaining=estimated_remaining
    )


@router.get("/my-progress", response_model=List[schemas.UserContentProgressResponse])
def get_my_content_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    completed_only: bool = False
):
    """
    Get all content progress for current user
    """
    query = db.query(models.UserContentProgress).filter(
        models.UserContentProgress.user_id == current_user.user_id
    )
    
    if completed_only:
        query = query.filter(models.UserContentProgress.is_completed == True)
    
    progress_list = query.order_by(models.UserContentProgress.started_at.desc()).all()
    
    return progress_list


@router.get("/{content_id}", response_model=schemas.StageContentResponse)
def get_content_item(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get a specific content item
    """
    content = db.query(models.StageContent).filter(
        models.StageContent.content_id == content_id
    ).first()
    
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
    
    # Verify content belongs to user's learning path
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == content.stage_id
    ).first()
    
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id,
        models.LearningPath.user_id == current_user.user_id
    ).first()
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Content does not belong to your learning path"
        )
    
    return content


