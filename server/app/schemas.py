"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Literal
from datetime import datetime
from decimal import Decimal


# ============================================================================
# User & Authentication Schemas
# ============================================================================

class UserBase(BaseModel):
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    user_id: int
    role: Literal["user", "admin"]
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    session_id: Optional[str] = None


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None


class TokenRefresh(BaseModel):
    refresh_token: str


# ============================================================================
# User Session Schemas
# ============================================================================

class UserSessionResponse(BaseModel):
    session_id: str
    user_id: int
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_active: bool
    created_at: datetime
    expires_at: datetime
    last_activity: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Password Management Schemas
# ============================================================================

class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=8)


class PasswordResetTokenResponse(BaseModel):
    token_id: int
    user_id: int
    is_used: bool
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# User Management Schemas (Enhanced)
# ============================================================================

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class UserDetailedResponse(UserResponse):
    """Extended user response with session count"""
    active_sessions_count: Optional[int] = 0
    last_login: Optional[datetime] = None


# ============================================================================
# Track Schemas
# ============================================================================

class TrackBase(BaseModel):
    track_name: str
    description: str


class TrackCreate(TrackBase):
    pass


class TrackResponse(TrackBase):
    track_id: int

    class Config:
        from_attributes = True


class UserTrackSelectionCreate(BaseModel):
    track_id: int


class UserTrackSelectionResponse(BaseModel):
    selection_id: int
    user_id: int
    track_id: int
    selected_at: datetime
    track: TrackResponse

    class Config:
        from_attributes = True


# ============================================================================
# Assessment Schemas
# ============================================================================

class AssessmentQuestionCreate(BaseModel):
    track_id: int
    question_text: str
    question_type: Literal["mcq", "logic", "open"]
    difficulty: Literal["low", "medium", "high"]


class AssessmentQuestionResponse(BaseModel):
    question_id: int
    track_id: int
    question_text: str
    question_type: str
    difficulty: str

    class Config:
        from_attributes = True


class AssessmentSessionCreate(BaseModel):
    track_id: int


class AssessmentSessionResponse(BaseModel):
    session_id: int
    user_id: int
    track_id: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AssessmentAnswerSubmit(BaseModel):
    question_id: int
    user_answer: str


class AssessmentResponseResponse(BaseModel):
    response_id: int
    session_id: int
    question_id: int
    user_answer: str
    ai_score: Optional[Decimal] = None
    ai_explanation: str
    submitted_at: datetime

    class Config:
        from_attributes = True


class AssessmentResultResponse(BaseModel):
    result_id: int
    session_id: int
    overall_score: Optional[Decimal] = None
    detected_level: str
    ai_reasoning: str

    class Config:
        from_attributes = True


# ============================================================================
# Skill Profile Schemas
# ============================================================================

class SkillProfileCreate(BaseModel):
    strengths: str
    weaknesses: str
    thinking_pattern: str


class SkillProfileResponse(BaseModel):
    profile_id: int
    user_id: int
    strengths: str
    weaknesses: str
    thinking_pattern: str

    class Config:
        from_attributes = True


# ============================================================================
# Learning Path Schemas
# ============================================================================

class LearningPathStageCreate(BaseModel):
    stage_name: str
    stage_order: int
    focus_area: str


class LearningPathStageResponse(BaseModel):
    stage_id: int
    path_id: int
    stage_name: str
    stage_order: int
    focus_area: str

    class Config:
        from_attributes = True


class LearningPathCreate(BaseModel):
    result_id: int


class LearningPathResponse(BaseModel):
    path_id: int
    user_id: int
    result_id: int
    created_at: datetime
    stages: List[LearningPathStageResponse] = []

    class Config:
        from_attributes = True


# ============================================================================
# Stage Content Schemas
# ============================================================================

class StageContentCreate(BaseModel):
    content_type: Literal["video", "documentation", "article", "exercise", "tutorial", "practice"]
    title: str
    description: str
    url: Optional[str] = None
    content_text: Optional[str] = None
    difficulty_level: Literal["beginner", "intermediate", "advanced"]
    order_index: int
    estimated_duration: Optional[int] = None  # in minutes
    source_platform: Optional[str] = None
    tags: Optional[str] = None


class StageContentResponse(BaseModel):
    content_id: int
    stage_id: int
    content_type: str
    title: str
    description: str
    url: Optional[str] = None
    content_text: Optional[str] = None
    difficulty_level: str
    order_index: int
    estimated_duration: Optional[int] = None
    source_platform: Optional[str] = None
    tags: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StageContentWithProgress(StageContentResponse):
    """Content item with user's progress"""
    progress: Optional["UserContentProgressResponse"] = None


class GenerateStageContentRequest(BaseModel):
    """Request to generate AI-powered content for a stage"""
    stage_id: int
    content_count: Optional[int] = 8  # Number of content items to generate


# ============================================================================
# User Content Progress Schemas
# ============================================================================

class UserContentProgressCreate(BaseModel):
    content_id: int
    completion_percentage: Optional[int] = 0
    time_spent_minutes: Optional[int] = 0
    notes: Optional[str] = None


class UserContentProgressUpdate(BaseModel):
    is_completed: Optional[bool] = None
    completion_percentage: Optional[int] = None
    time_spent_minutes: Optional[int] = None
    notes: Optional[str] = None


class UserContentProgressResponse(BaseModel):
    progress_id: int
    user_id: int
    content_id: int
    is_completed: bool
    completion_percentage: int
    time_spent_minutes: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class StageProgressSummary(BaseModel):
    """Summary of user's progress for a stage"""
    stage_id: int
    stage_name: str
    total_content_items: int
    completed_items: int
    completion_percentage: int
    total_time_spent_minutes: int
    estimated_time_remaining: int


# ============================================================================
# Knowledge Base Schemas
# ============================================================================

class KnowledgeBaseCreate(BaseModel):
    track_id: int
    content: str
    source: str
    embedding_vector: str


class KnowledgeBaseResponse(BaseModel):
    kb_id: int
    track_id: int
    content: str
    source: str

    class Config:
        from_attributes = True


# ============================================================================
# Chat Schemas
# ============================================================================

class ChatSessionCreate(BaseModel):
    stage_id: int


class ChatSessionResponse(BaseModel):
    chat_id: int
    user_id: int
    stage_id: int
    started_at: datetime

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    message_text: str


class ChatMessageResponse(BaseModel):
    message_id: int
    chat_id: int
    sender: str
    message_text: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Evaluation Schemas
# ============================================================================

class EvaluationSessionCreate(BaseModel):
    path_id: int


class EvaluationSessionResponse(BaseModel):
    evaluation_id: int
    user_id: int
    path_id: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EvaluationDialogueCreate(BaseModel):
    message_text: str


class EvaluationDialogueResponse(BaseModel):
    dialogue_id: int
    evaluation_id: int
    speaker: str
    message_text: str
    sequence_no: int

    class Config:
        from_attributes = True


class EvaluationResultResponse(BaseModel):
    result_id: int
    evaluation_id: int
    reasoning_score: Optional[Decimal] = None
    problem_solving: Optional[Decimal] = None
    final_feedback: str
    readiness_level: str

    class Config:
        from_attributes = True

