"""
Chat router - handles AI mentor conversations with RAG
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models, schemas
from app.auth_middleware import get_current_user, get_admin_user
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api/chat", tags=["AI Mentor Chat"])


# ============================================================================
# Knowledge Base Management (Admin)
# ============================================================================

@router.post("/knowledge", response_model=schemas.KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
def add_knowledge(
    knowledge_data: schemas.KnowledgeBaseCreate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Add content to knowledge base with embeddings (Admin only)
    """
    new_knowledge = models.KnowledgeBase(**knowledge_data.model_dump())
    db.add(new_knowledge)
    db.commit()
    db.refresh(new_knowledge)
    return new_knowledge


@router.get("/knowledge/track/{track_id}", response_model=List[schemas.KnowledgeBaseResponse])
def get_knowledge_by_track(
    track_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all knowledge base entries for a track
    """
    knowledge = db.query(models.KnowledgeBase).filter(
        models.KnowledgeBase.track_id == track_id
    ).all()
    return knowledge


# ============================================================================
# Chat Session Management
# ============================================================================

@router.post("/sessions", response_model=schemas.ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_chat_session(
    session_data: schemas.ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Start a new chat session for a learning stage
    """
    # Verify stage exists and belongs to user
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == session_data.stage_id
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
    
    # Create chat session
    new_session = models.ChatSession(
        user_id=current_user.user_id,
        stage_id=session_data.stage_id
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    # Send welcome message from AI
    welcome_message = models.ChatMessage(
        chat_id=new_session.chat_id,
        sender="ai",
        message_text=f"Welcome! I'm your AI mentor for {stage.stage_name}. I'm here to help you with {stage.focus_area}. What would you like to learn?"
    )
    db.add(welcome_message)
    db.commit()
    
    return new_session


@router.get("/sessions/{chat_id}", response_model=schemas.ChatSessionResponse)
def get_chat_session(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get details of a chat session
    """
    session = db.query(models.ChatSession).filter(
        models.ChatSession.chat_id == chat_id,
        models.ChatSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    return session


@router.get("/my-sessions", response_model=List[schemas.ChatSessionResponse])
def get_my_chat_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    stage_id: int = None
):
    """
    Get all chat sessions for current user, optionally filtered by stage
    """
    query = db.query(models.ChatSession).filter(
        models.ChatSession.user_id == current_user.user_id
    )
    
    if stage_id:
        query = query.filter(models.ChatSession.stage_id == stage_id)
    
    sessions = query.order_by(models.ChatSession.started_at.desc()).all()
    return sessions


# ============================================================================
# Chat Messages
# ============================================================================

@router.post("/sessions/{chat_id}/messages", response_model=schemas.ChatMessageResponse)
async def send_message(
    chat_id: int,
    message_data: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Send a message in a chat session and get AI mentor response
    """
    # Verify chat session belongs to user
    session = db.query(models.ChatSession).filter(
        models.ChatSession.chat_id == chat_id,
        models.ChatSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    # Save user message
    user_message = models.ChatMessage(
        chat_id=chat_id,
        sender="user",
        message_text=message_data.message_text
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    
    # Get stage context
    stage = db.query(models.LearningPathStage).filter(
        models.LearningPathStage.stage_id == session.stage_id
    ).first()
    
    # Get learning path to determine track
    path = db.query(models.LearningPath).filter(
        models.LearningPath.path_id == stage.path_id
    ).first()
    
    assessment_session = db.query(models.AssessmentSession).join(
        models.AssessmentResult
    ).filter(
        models.AssessmentResult.result_id == path.result_id
    ).first()
    
    track = db.query(models.Track).filter(
        models.Track.track_id == assessment_session.track_id
    ).first()
    
    # Get chat history for context
    previous_messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_id == chat_id
    ).order_by(models.ChatMessage.created_at.desc()).limit(10).all()
    
    chat_history = [
        {"sender": msg.sender, "text": msg.message_text}
        for msg in reversed(previous_messages)
    ]
    
    # Generate AI mentor response with RAG
    ai_response_text = await ai_service.get_mentor_response(
        user_message=message_data.message_text,
        stage_context=stage.focus_area,
        track_name=track.track_name,
        chat_history=chat_history
    )
    
    # Save AI response
    ai_message = models.ChatMessage(
        chat_id=chat_id,
        sender="ai",
        message_text=ai_response_text
    )
    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)
    
    return ai_message


@router.get("/sessions/{chat_id}/messages", response_model=List[schemas.ChatMessageResponse])
def get_chat_messages(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
):
    """
    Get all messages in a chat session
    """
    # Verify chat session belongs to user
    session = db.query(models.ChatSession).filter(
        models.ChatSession.chat_id == chat_id,
        models.ChatSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.chat_id == chat_id
    ).order_by(models.ChatMessage.created_at.asc()).offset(skip).limit(limit).all()
    
    return messages


@router.delete("/sessions/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_session(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Delete a chat session and all its messages
    """
    session = db.query(models.ChatSession).filter(
        models.ChatSession.chat_id == chat_id,
        models.ChatSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    db.delete(session)
    db.commit()
    return None

