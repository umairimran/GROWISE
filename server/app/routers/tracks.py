"""
Tracks router - handles learning track management and user selections
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import SessionLocal, get_db
from app import models, schemas
from app.auth_middleware import get_current_user, get_admin_user
from app.ai_services.assessment_dimensions_generator import (
    generate_assessment_dimensions,
    _make_code,
)

router = APIRouter(prefix="/api/tracks", tags=["Tracks"])


# ---------------------------------------------------------------------------
# Background helper – runs AFTER the HTTP response is already sent
# ---------------------------------------------------------------------------

async def _generate_and_store_dimensions(track_id: int, track_name: str) -> None:
    """
    Async background task: call the AI generator then persist every dimension
    in its own DB session so it never blocks the request/response cycle.

    All exceptions are caught so a failure here never crashes the server
    connection or affects subsequent requests.
    """
    try:
        dimensions = await generate_assessment_dimensions(track_name)

        db = SessionLocal()
        try:
            for dim in dimensions:
                db.add(
                    models.AssessmentDimension(
                        track_id=track_id,
                        code=dim["code"],
                        name=dim["name"],
                        description=dim["description"],
                        weight=dim["weight"],
                    )
                )
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        # Log the error without propagating — background failures must not
        # disconnect the keep-alive HTTP connection or crash the server.
        import logging
        logging.getLogger(__name__).error(
            "Failed to generate/store dimensions for track %s: %s",
            track_id,
            exc,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# Track CRUD
# ---------------------------------------------------------------------------

@router.post("/", response_model=schemas.TrackResponse, status_code=status.HTTP_201_CREATED)
async def create_track(
    track_data: schemas.TrackCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user),
):
    """
    Create a new learning track (Admin only).

    After the track is saved, dimensions are generated asynchronously in the
    background via the AI dimension generator — the response is returned
    immediately without waiting for AI generation to complete.
    """
    existing_track = db.query(models.Track).filter(
        models.Track.track_name == track_data.track_name
    ).first()

    if existing_track:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track with this name already exists",
        )

    new_track = models.Track(**track_data.model_dump())
    db.add(new_track)
    db.commit()
    db.refresh(new_track)

    # Fire-and-forget: generate + store dimensions without blocking the caller
    background_tasks.add_task(
        _generate_and_store_dimensions,
        new_track.track_id,
        new_track.track_name,
    )

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
# Track Assessment Dimensions (Admin)
# ============================================================================


@router.post(
    "/{track_id}/dimensions",
    response_model=schemas.AssessmentDimensionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_track_dimension(
    track_id: int,
    dimension_data: schemas.AssessmentDimensionCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user),
):
    """
    Create a new assessment dimension for a specific track (Admin only).
    Dimensions model different perspectives such as theory, problem solving,
    practical skills, communication, etc.
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found",
        )

    existing = db.query(models.AssessmentDimension).filter(
        models.AssessmentDimension.track_id == track_id,
        models.AssessmentDimension.name == dimension_data.name,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dimension with this name already exists for this track",
        )

    new_dimension = models.AssessmentDimension(
        track_id=track_id,
        code=_make_code(dimension_data.name),
        **dimension_data.model_dump(),
    )
    db.add(new_dimension)
    db.commit()
    db.refresh(new_dimension)
    return new_dimension


@router.get(
    "/{track_id}/dimensions",
    response_model=List[schemas.AssessmentDimensionResponse],
)
def get_track_dimensions(
    track_id: int,
    db: Session = Depends(get_db),
):
    """
    Get all assessment dimensions configured for a track.
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found",
        )

    dimensions = db.query(models.AssessmentDimension).filter(
        models.AssessmentDimension.track_id == track_id
    ).all()
    return dimensions


@router.put(
    "/dimensions/{dimension_id}",
    response_model=schemas.AssessmentDimensionResponse,
)
def update_track_dimension(
    dimension_id: int,
    dimension_data: schemas.AssessmentDimensionCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user),
):
    """
    Update an existing assessment dimension for a track (Admin only).
    """
    dimension = db.query(models.AssessmentDimension).filter(
        models.AssessmentDimension.dimension_id == dimension_id
    ).first()
    if not dimension:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dimension not found",
        )

    # Prevent duplicate names per track
    duplicate = db.query(models.AssessmentDimension).filter(
        models.AssessmentDimension.track_id == dimension.track_id,
        models.AssessmentDimension.name == dimension_data.name,
        models.AssessmentDimension.dimension_id != dimension_id,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Another dimension with this name already exists for this track",
        )

    for key, value in dimension_data.model_dump().items():
        setattr(dimension, key, value)

    db.commit()
    db.refresh(dimension)
    return dimension


@router.delete(
    "/dimensions/{dimension_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_track_dimension(
    dimension_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user),
):
    """
    Delete an assessment dimension from a track (Admin only).
    """
    dimension = db.query(models.AssessmentDimension).filter(
        models.AssessmentDimension.dimension_id == dimension_id
    ).first()
    if not dimension:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dimension not found",
        )

    db.delete(dimension)
    db.commit()
    return None


# ============================================================================
# User Track Selection Endpoints
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

