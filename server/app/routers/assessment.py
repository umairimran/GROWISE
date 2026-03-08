"""
Assessment router - handles AI-driven skill assessment
"""
import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user, get_admin_user
from app.services.ai_service import ai_service
from app.ai_services.assessment_dimensions_generator import (
    generate_assessment_dimensions,
    _make_code as make_dimension_code,
)
from app.ai_services.assessment_question_generator import generate_assessment_questions
from app.ai_services.answer_evaluator import evaluate_answers_batch
from app.ai_services.learning_path_generator import generate_learning_path_stages
from app.ai_services.comprehensive_assessment_report import generate_comprehensive_report

log = logging.getLogger(__name__)

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

    # ------------------------------------------------------------------
    # Fetch this track's assessment dimensions (or generate on-the-fly if missing)
    # ------------------------------------------------------------------
    dimensions_rows = (
        db.query(models.AssessmentDimension)
        .filter(models.AssessmentDimension.track_id == session_data.track_id)
        .all()
    )

    if not dimensions_rows:
        # Track has no dimensions yet — generate and store them now
        # (e.g. track was created before dimension generator, or background task failed)
        generated = await generate_assessment_dimensions(track.track_name)
        for dim in generated:
            code = (dim.get("code") or make_dimension_code(dim["name"]))[:150]
            db.add(
                models.AssessmentDimension(
                    track_id=session_data.track_id,
                    code=code,
                    name=dim["name"],
                    description=dim["description"],
                    weight=dim["weight"],
                )
            )
        db.commit()
        dimensions_rows = (
            db.query(models.AssessmentDimension)
            .filter(models.AssessmentDimension.track_id == session_data.track_id)
            .all()
        )

    # Build dimension dicts and a code→id lookup for storing FK
    dimensions = [
        {
            "code": d.code,
            "name": d.name,
            "description": d.description,
            "weight": float(d.weight),
        }
        for d in dimensions_rows
    ]
    dim_code_to_id = {d.code: d.dimension_id for d in dimensions_rows}

    # ------------------------------------------------------------------
    # Generate 10 dimension-aware questions (always use proper generator now)
    # ------------------------------------------------------------------
    ai_questions = await generate_assessment_questions(
        track_name=track.track_name,
        dimensions=dimensions,
        count=10,
    )

    # ------------------------------------------------------------------
    # Store questions in the pool and link them to this session
    # ------------------------------------------------------------------
    for q_data in ai_questions:
        dimension_id = dim_code_to_id.get(q_data.get("dimension_code"))

        question = models.AssessmentQuestionPool(
            track_id=session_data.track_id,
            dimension_id=dimension_id,
            question_text=q_data["question_text"],
            question_type=q_data["question_type"],
            difficulty=q_data["difficulty"],
        )
        db.add(question)
        db.flush()

        db.add(
            models.AssessmentSessionQuestion(
                session_id=new_session.session_id,
                question_id=question.question_id,
            )
        )

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
    
    # Get question with its dimension and track (for validation only)
    question = (
        db.query(models.AssessmentQuestionPool)
        .filter(models.AssessmentQuestionPool.question_id == answer_data.question_id)
        .first()
    )

    # ------------------------------------------------------------------
    # Store answer WITHOUT AI evaluation — batch evaluation happens on complete
    # This reduces API cost from N calls (one per question) to 1 call at completion.
    # ------------------------------------------------------------------
    response = models.AssessmentResponse(
        session_id=session_id,
        question_id=answer_data.question_id,
        user_answer=answer_data.user_answer,
        ai_score=None,
        ai_explanation="",
        criteria_scores=None,
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

    # Fetch track for context
    track = db.query(models.Track).filter(
        models.Track.track_id == session.track_id
    ).first()

    # Get all responses for this session
    responses = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id
    ).order_by(models.AssessmentResponse.response_id).all()


    if not responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No answers submitted yet"
        )

    # ------------------------------------------------------------------
    # Batch evaluate ALL answers in ONE API call (reduces cost from N to 1)
    # ------------------------------------------------------------------
    qa_for_batch = []
    valid_indices = []
    for i, resp in enumerate(responses):
        q = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == resp.question_id
        ).first()
        if not q:
            continue
        dim = None
        if q.dimension_id:
            dim = db.query(models.AssessmentDimension).filter(
                models.AssessmentDimension.dimension_id == q.dimension_id
            ).first()
        qa_for_batch.append({
            "question_text": q.question_text,
            "user_answer": resp.user_answer,
            "dimension_name": dim.name if dim else "General",
            "dimension_description": dim.description if dim else "",
            "dimension_weight": float(dim.weight) if dim else 1.0,
            "question_type": q.question_type,
        })
        valid_indices.append(i)

    evaluations = await evaluate_answers_batch(
        track_name=track.track_name if track else "General Track",
        track_description=(track.description or "") if track else "",
        questions_and_answers=qa_for_batch,
    )

    # Persist evaluations back to AssessmentResponse (same DB structure)
    for idx, ev in zip(valid_indices, evaluations):
        resp = responses[idx]
        resp.ai_score = ev["final_score"]
        resp.ai_explanation = ev.get("explanation", "") or ""
        resp.criteria_scores = json.dumps(ev.get("criteria_scores", {}))
    db.commit()
    for r in responses:
        db.refresh(r)

    # ------------------------------------------------------------------
    # Aggregate per-dimension scores
    # ------------------------------------------------------------------
    dim_scores: dict = defaultdict(list)   # dimension_id -> [final_score, ...]
    for resp in responses:
        q = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == resp.question_id
        ).first()
        if q and q.dimension_id:
            dim_scores[q.dimension_id].append(float(resp.ai_score) if resp.ai_score else 0.0)

    # Fetch dimension weights and store per-dimension result rows
    dimension_map: dict = {}  # dimension_id -> AssessmentDimension
    for dim_id in dim_scores:
        dim = db.query(models.AssessmentDimension).filter(
            models.AssessmentDimension.dimension_id == dim_id
        ).first()
        if dim:
            dimension_map[dim_id] = dim

    weighted_total = 0.0
    total_weight_used = 0.0

    for dim_id, scores in dim_scores.items():
        dim = dimension_map.get(dim_id)
        if not dim:
            continue
        avg_score = sum(scores) / len(scores)
        weight = float(dim.weight)
        contribution = round(avg_score * weight, 4)
        weighted_total += contribution
        total_weight_used += weight

        # Upsert: skip if already exists (idempotent)
        existing_dr = db.query(models.AssessmentDimensionResult).filter(
            models.AssessmentDimensionResult.session_id == session_id,
            models.AssessmentDimensionResult.dimension_id == dim_id,
        ).first()
        if not existing_dr:
            db.add(models.AssessmentDimensionResult(
                session_id=session_id,
                dimension_id=dim_id,
                dimension_score=round(avg_score, 3),
                weighted_contribution=contribution,
                questions_evaluated=len(scores),
            ))

    # ------------------------------------------------------------------
    # Calculate overall score
    # ------------------------------------------------------------------
    if total_weight_used > 0:
        # Dimension-aware: weighted average normalised to [0, 100]
        overall_score = round((weighted_total / total_weight_used) * 100, 2)
    else:
        # Fallback: plain average across all responses
        scores_all = [float(r.ai_score) for r in responses if r.ai_score]
        overall_score = round((sum(scores_all) / len(scores_all)) * 100, 2) if scores_all else 0.0

    # Determine skill level
    if overall_score >= 80:
        detected_level = "advanced"
    elif overall_score >= 60:
        detected_level = "intermediate"
    else:
        detected_level = "beginner"

    # Build full Q&A context for comprehensive report (and later for learning path)
    questions_and_answers = []
    for resp in responses:
        q = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == resp.question_id
        ).first()
        if not q:
            continue

        dim = None
        if q.dimension_id:
            dim = db.query(models.AssessmentDimension).filter(
                models.AssessmentDimension.dimension_id == q.dimension_id
            ).first()

        raw_criteria = resp.criteria_scores
        try:
            criteria_scores = json.loads(raw_criteria) if isinstance(raw_criteria, str) else (raw_criteria or {})
        except (ValueError, TypeError):
            criteria_scores = {}

        questions_and_answers.append({
            "question_text": q.question_text,
            "user_answer": resp.user_answer,
            "dimension": dim.name if dim else "General",
            "criteria_scores": criteria_scores,
            "final_score": float(resp.ai_score) if resp.ai_score else 0.0,
            "ai_explanation": resp.ai_explanation or "",
        })

    # Send ALL Q&A to AI for comprehensive report (used for content generation)
    comprehensive_report = await generate_comprehensive_report(
        track_name=track.track_name if track else "General Track",
        questions_and_answers=questions_and_answers,
        overall_score=overall_score,
        detected_level=detected_level,
    )
    ai_reasoning = comprehensive_report.get("executive_summary", "") or (
        f"Based on {len(responses)} responses with weighted average score {overall_score:.2f}%, "
        f"user demonstrates {detected_level} level understanding."
    )

    # Create assessment result
    result = models.AssessmentResult(
        session_id=session_id,
        overall_score=overall_score,
        detected_level=detected_level,
        ai_reasoning=ai_reasoning,
        comprehensive_report=json.dumps(comprehensive_report),
    )

    db.add(result)

    # Update session status
    session.status = "completed"
    session.completed_at = datetime.utcnow()

    response_data = [{"answer": r.user_answer, "score": float(r.ai_score)} for r in responses]

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

    # ------------------------------------------------------------------
    # Auto-generate learning path stages from raw Q&A context
    # ------------------------------------------------------------------
    try:
        # Generate stages (use comprehensive report's focus_areas_for_stages when available)
        focus_hint = None
        ctx = comprehensive_report.get("content_generation_context") or {}
        if isinstance(ctx.get("focus_areas_for_stages"), list) and ctx["focus_areas_for_stages"]:
            focus_hint = ctx["focus_areas_for_stages"]

        stages_data = await generate_learning_path_stages(
            track_name=track.track_name if track else "General Track",
            detected_level=detected_level,
            questions_and_answers=questions_and_answers,
            focus_areas_hint=focus_hint,
        )

        # Create learning_paths row
        learning_path = models.LearningPath(
            user_id=current_user.user_id,
            result_id=result.result_id,
        )
        db.add(learning_path)
        db.flush()

        # Create learning_path_stages rows
        for stage_data in stages_data:
            db.add(models.LearningPathStage(
                path_id=learning_path.path_id,
                stage_name=stage_data["stage_name"],
                stage_order=stage_data["stage_order"],
                focus_area=stage_data["focus_area"],
            ))

        db.commit()
        db.refresh(result)

        # Attach learning_path_id to the response (not a DB column — set dynamically)
        result.learning_path_id = learning_path.path_id
        log.info("✅  Learning path created for session %s: path_id=%s, stages=%s", session_id, learning_path.path_id, len(stages_data))

    except Exception as exc:
        log.error("❌  Learning path generation failed for session %s: %s", session_id, exc, exc_info=True)
        # Don't fail the whole request — path can be generated later
        db.rollback()

    # Build response with evaluated_responses so client has per-question scores
    response_data = schemas.AssessmentResultResponse.model_validate(result)
    return response_data.model_copy(
        update={
            "evaluated_responses": [
                schemas.AssessmentResponseResponse.model_validate(r) for r in responses
            ]
        }
    )


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

    # Attach learning_path_id if a path was generated for this result
    lp = db.query(models.LearningPath).filter(
        models.LearningPath.result_id == result.result_id
    ).first()
    if lp:
        result.learning_path_id = lp.path_id

    # Attach evaluated_responses so client has per-question scores
    responses = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id
    ).order_by(models.AssessmentResponse.response_id).all()
    response_data = schemas.AssessmentResultResponse.model_validate(result)
    return response_data.model_copy(
        update={"evaluated_responses": [schemas.AssessmentResponseResponse.model_validate(r) for r in responses]}
    )


@router.post("/sessions/{session_id}/regenerate-path", response_model=schemas.LearningPathResponse)
async def regenerate_learning_path(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Regenerate the learning path for a completed assessment.
    Use when path generation failed (e.g. 429) during complete.
    """
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id,
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment must be completed first",
        )

    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not completed yet")

    track = db.query(models.Track).filter(models.Track.track_id == session.track_id).first()
    responses = db.query(models.AssessmentResponse).filter(
        models.AssessmentResponse.session_id == session_id
    ).all()
    if not responses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No responses found for this session",
        )

    questions_and_answers = []
    for resp in responses:
        q = db.query(models.AssessmentQuestionPool).filter(
            models.AssessmentQuestionPool.question_id == resp.question_id
        ).first()
        if not q:
            continue
        dim = None
        if q.dimension_id:
            dim = db.query(models.AssessmentDimension).filter(
                models.AssessmentDimension.dimension_id == q.dimension_id
            ).first()
        raw_criteria = resp.criteria_scores
        try:
            criteria_scores = json.loads(raw_criteria) if isinstance(raw_criteria, str) else (raw_criteria or {})
        except (ValueError, TypeError):
            criteria_scores = {}
        questions_and_answers.append({
            "question_text": q.question_text,
            "user_answer": resp.user_answer,
            "dimension": dim.name if dim else "General",
            "criteria_scores": criteria_scores,
            "final_score": float(resp.ai_score) if resp.ai_score else 0.0,
            "ai_explanation": resp.ai_explanation or "",
        })

    focus_hint = None
    if result.comprehensive_report:
        try:
            report = json.loads(result.comprehensive_report) if isinstance(result.comprehensive_report, str) else result.comprehensive_report
            ctx = report.get("content_generation_context") or {}
            if isinstance(ctx.get("focus_areas_for_stages"), list) and ctx["focus_areas_for_stages"]:
                focus_hint = ctx["focus_areas_for_stages"]
        except (ValueError, TypeError):
            pass

    stages_data = await generate_learning_path_stages(
        track_name=track.track_name if track else "General Track",
        detected_level=result.detected_level,
        questions_and_answers=questions_and_answers,
        focus_areas_hint=focus_hint,
    )

    existing = db.query(models.LearningPath).filter(
        models.LearningPath.result_id == result.result_id
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    learning_path = models.LearningPath(
        user_id=current_user.user_id,
        result_id=result.result_id,
    )
    db.add(learning_path)
    db.flush()

    for stage_data in stages_data:
        db.add(models.LearningPathStage(
            path_id=learning_path.path_id,
            stage_name=stage_data["stage_name"],
            stage_order=stage_data["stage_order"],
            focus_area=stage_data["focus_area"],
        ))

    db.commit()
    db.refresh(learning_path)
    log.info("✅  Learning path regenerated for session %s: path_id=%s, stages=%s", session_id, learning_path.path_id, len(stages_data))
    return learning_path


@router.get("/sessions/{session_id}/learning-path", response_model=schemas.LearningPathResponse)
def get_session_learning_path(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Retrieve the AI-generated learning path (stages only) for a completed session.
    """
    session = db.query(models.AssessmentSession).filter(
        models.AssessmentSession.session_id == session_id,
        models.AssessmentSession.user_id == current_user.user_id,
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    result = db.query(models.AssessmentResult).filter(
        models.AssessmentResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not completed yet")

    lp = db.query(models.LearningPath).filter(
        models.LearningPath.result_id == result.result_id
    ).first()
    if not lp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning path not yet generated for this session",
        )

    return lp


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

