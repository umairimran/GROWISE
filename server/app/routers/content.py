"""
Content router - handles learning content and user progress
"""
import logging
import json
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth_middleware import get_current_user
from app.database import get_db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/content", tags=["Learning Content"])


def _map_source_type_to_content_type(source_type: str) -> str:
    """Map content_search source_type to stage_content content_type."""
    st = (source_type or "article").strip().lower()
    mapping = {
        "article": "article",
        "tutorial": "tutorial",
        "documentation": "documentation",
        "blog": "article",
        "video": "video",
    }
    return mapping.get(st, "article")


def _normalize_difficulty(level: str) -> str:
    """Ensure difficulty is one of beginner, intermediate, advanced."""
    if not level:
        return "intermediate"
    level = str(level).strip().lower()
    if level in ("beginner", "intermediate", "advanced"):
        return level
    if level in ("junior", "entry", "starter"):
        return "beginner"
    if level in ("senior", "expert", "pro"):
        return "advanced"
    return "intermediate"


def _content_search_to_stage_items(
    search_result: Dict[str, Any],
    difficulty_level: str,
    track_name: str,
    stage_name: str,
    content_count: int,
) -> List[Dict[str, Any]]:
    """
    Map content_search_service output to stage_content format for DB storage.
    """
    difficulty_level = _normalize_difficulty(difficulty_level)
    content_list = search_result.get("content") or []
    items: List[Dict[str, Any]] = []
    for i, item in enumerate(content_list):
        if i >= content_count:
            break
        title = (item.get("title") or "Resource").strip()[:500]
        url = (item.get("url") or "").strip()
        if not url or not url.startswith("http"):
            url = None
        summary = (item.get("summary") or "").strip()[:1000]
        key_points = item.get("key_points") or []
        source_type = item.get("source_type") or "article"
        content_type = _map_source_type_to_content_type(source_type)
        content_text = None
        if key_points:
            content_text = "\n".join(f"- {p}" for p in key_points if p)[:5000]
        elif summary:
            content_text = summary
        description = summary or f"Learn about {stage_name}"
        if len(description) > 1000:
            description = description[:997] + "..."
        duration = 20
        if content_type == "video":
            duration = 30
        elif content_type == "documentation":
            duration = 25
        elif content_type == "tutorial":
            duration = 25
        items.append({
            "content_type": content_type,
            "title": title,
            "description": description,
            "url": url,
            "content_text": content_text,
            "difficulty_level": difficulty_level,
            "estimated_duration": duration,
            "source_platform": source_type.replace("_", " ").title()[:100],
            "tags": f"{track_name}, {stage_name}, {difficulty_level}",
        })
    return items


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

    # Build a concise learner profile context from the assessment report (profile-focused content).
    # This does NOT change any DB schema or request payload — it only enriches the generation prompt.
    report: Dict[str, Any] = {}
    try:
        if result and getattr(result, "comprehensive_report", None):
            raw = result.comprehensive_report
            report = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        report = {}

    executive_summary = (report.get("executive_summary") or "").strip()
    learning_priorities = report.get("learning_priorities") if isinstance(report.get("learning_priorities"), list) else []
    weaknesses = report.get("weaknesses") if isinstance(report.get("weaknesses"), list) else []
    strengths = report.get("strengths") if isinstance(report.get("strengths"), list) else []
    content_ctx = report.get("content_generation_context") if isinstance(report.get("content_generation_context"), dict) else {}

    top_weaknesses = []
    for w in weaknesses[:4]:
        if not isinstance(w, dict):
            continue
        area = str(w.get("area") or "").strip()
        rec = str(w.get("recommendation") or "").strip()
        pr = str(w.get("priority") or "").strip().lower()
        if area:
            top_weaknesses.append(f"- {area}{f' (priority: {pr})' if pr else ''}{f': {rec}' if rec else ''}")

    top_strengths = []
    for s in strengths[:3]:
        if not isinstance(s, dict):
            continue
        area = str(s.get("area") or "").strip()
        if area:
            top_strengths.append(f"- {area}")

    key_topics = content_ctx.get("key_topics") if isinstance(content_ctx.get("key_topics"), list) else []
    focus_areas_hint = content_ctx.get("focus_areas_for_stages") if isinstance(content_ctx.get("focus_areas_for_stages"), list) else []
    gap_severity = str(content_ctx.get("gap_severity") or "").strip().lower()

    profile_context_lines: List[str] = []
    if executive_summary:
        profile_context_lines.append(f"Executive summary: {executive_summary}")
    if gap_severity:
        profile_context_lines.append(f"Gap severity: {gap_severity}")
    if key_topics:
        profile_context_lines.append(f"Key topics to focus: {', '.join(str(t) for t in key_topics[:8] if t)}")
    if focus_areas_hint:
        profile_context_lines.append(
            f"Suggested focus areas for stages: {', '.join(str(a) for a in focus_areas_hint[:8] if a)}"
        )
    if top_strengths:
        profile_context_lines.append("Strengths:\n" + "\n".join(top_strengths))
    if top_weaknesses:
        profile_context_lines.append("Weaknesses (prioritise resources to fix these):\n" + "\n".join(top_weaknesses))
    if learning_priorities:
        topics = []
        for p in learning_priorities[:5]:
            if isinstance(p, dict) and p.get("topic"):
                topics.append(str(p["topic"]).strip())
        if topics:
            profile_context_lines.append("Learning priorities:\n- " + "\n- ".join(topics))

    learner_profile_context = "\n".join(profile_context_lines).strip() or None
    
    # Generate content using content_search_service (Google Search agent)
    stage_input = {
        "stage_id": request.stage_id,
        "stage_name": stage.stage_name,
        "focus_area": stage.focus_area,
        "difficulty_level": result.detected_level,
        "track_name": track.track_name,
        "learner_profile_context": learner_profile_context,
    }
    try:
        from app.ai_services.content_search_service import search_content

        search_result = await search_content(stage_input)
        content_items = _content_search_to_stage_items(
            search_result=search_result,
            difficulty_level=result.detected_level,
            track_name=track.track_name,
            stage_name=stage.stage_name,
            content_count=request.content_count or 8,
        )
    except Exception as exc:
        log.error("Content search failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Content generation failed: {exc}",
        ) from exc
    
    if not content_items:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No content could be generated for this stage. Please try again.",
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


