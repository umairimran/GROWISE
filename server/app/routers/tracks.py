"""
Tracks router - handles learning track management and user selections
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user, get_admin_user

router = APIRouter(prefix="/api/tracks", tags=["Tracks"])


@router.post("/", response_model=schemas.TrackResponse, status_code=status.HTTP_201_CREATED)
def create_track(
    track_data: schemas.TrackCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Create a new learning track (Admin only)
    """
    # Check if track already exists
    existing_track = db.query(models.Track).filter(
        models.Track.track_name == track_data.track_name
    ).first()
    
    if existing_track:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track with this name already exists"
        )
    
    new_track = models.Track(**track_data.model_dump())
    db.add(new_track)
    db.commit()
    db.refresh(new_track)
    
    return new_track


@router.get("/", response_model=List[schemas.TrackResponse])
def get_all_tracks(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """
    Get all available learning tracks
    """
    tracks = db.query(models.Track).offset(skip).limit(limit).all()
    return tracks


# ============================================================================
# User Track Selection Endpoints (static paths BEFORE dynamic /{track_id})
# ============================================================================

@router.post("/select", response_model=schemas.UserTrackSelectionResponse, status_code=status.HTTP_201_CREATED)
def select_track(
    selection_data: schemas.UserTrackSelectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    User selects a learning track
    """
    # Verify track exists
    track = db.query(models.Track).filter(
        models.Track.track_id == selection_data.track_id
    ).first()
    
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )
    
    # Check if user already selected this track
    existing_selection = db.query(models.UserTrackSelection).filter(
        models.UserTrackSelection.user_id == current_user.user_id,
        models.UserTrackSelection.track_id == selection_data.track_id
    ).first()
    
    if existing_selection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track already selected"
        )
    
    new_selection = models.UserTrackSelection(
        user_id=current_user.user_id,
        track_id=selection_data.track_id
    )
    
    db.add(new_selection)
    db.commit()
    db.refresh(new_selection)
    
    return new_selection


@router.get("/my-selections", response_model=List[schemas.UserTrackSelectionResponse])
def get_my_track_selections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get current user's track selections
    """
    selections = db.query(models.UserTrackSelection).filter(
        models.UserTrackSelection.user_id == current_user.user_id
    ).all()
    return selections


@router.get("/my-current-track", response_model=schemas.TrackResponse)
def get_my_current_track(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get user's most recently selected track
    """
    selection = db.query(models.UserTrackSelection).filter(
        models.UserTrackSelection.user_id == current_user.user_id
    ).order_by(models.UserTrackSelection.selected_at.desc()).first()
    
    if not selection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No track selected yet"
        )
    
    return selection.track


# ============================================================================
# Track CRUD by ID (dynamic path /{track_id})
# ============================================================================

@router.get("/{track_id}", response_model=schemas.TrackResponse)
def get_track(
    track_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific track by ID
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )
    return track


@router.put("/{track_id}", response_model=schemas.TrackResponse)
def update_track(
    track_id: int,
    track_data: schemas.TrackCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Update a track (Admin only)
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )
    
    for key, value in track_data.model_dump().items():
        setattr(track, key, value)
    
    db.commit()
    db.refresh(track)
    return track


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Delete a track (Admin only)
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )
    
    db.delete(track)
    db.commit()
    return None

