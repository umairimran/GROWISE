"""
Progress & Dashboard router - Complete progress tracking and analytics
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user

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
        "improvement": self._calculate_improvement(history) if len(history) > 1 else None
    }


def _calculate_improvement(history: List) -> dict:
    """Calculate improvement metrics"""
    if len(history) < 2:
        return None
    
    first_score = history[0]['score']
    latest_score = history[-1]['score']
    improvement_percentage = ((latest_score - first_score) / first_score) * 100
    
    return {
        "first_attempt_score": first_score,
        "latest_attempt_score": latest_score,
        "improvement_percentage": round(improvement_percentage, 2),
        "level_progression": f"{history[0]['detected_level']} → {history[-1]['detected_level']}"
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
        "progression": self._calculate_evaluation_progression(history) if len(history) > 1 else None
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


