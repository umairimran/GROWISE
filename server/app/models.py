"""
SQLAlchemy models mapping to database schema
"""
from sqlalchemy import (
    Column, Integer, String, Text, TIMESTAMP, ForeignKey,
    CheckConstraint, UniqueConstraint, DECIMAL, Boolean, text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="check_user_role"),
    )

    # Relationships
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    track_selections = relationship("UserTrackSelection", back_populates="user", cascade="all, delete-orphan")
    assessment_sessions = relationship("AssessmentSession", back_populates="user", cascade="all, delete-orphan")
    skill_profile = relationship("SkillProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    learning_paths = relationship("LearningPath", back_populates="user", cascade="all, delete-orphan")
    content_progress = relationship("UserContentProgress", back_populates="user", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    evaluation_sessions = relationship("EvaluationSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    session_id = Column(String(255), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    expires_at = Column(TIMESTAMP, nullable=False)
    last_activity = Column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    user = relationship("User", back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    token_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    reset_token = Column(String(255), unique=True, nullable=False, index=True)
    is_used = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    expires_at = Column(TIMESTAMP, nullable=False)

    # Relationships
    user = relationship("User", back_populates="password_reset_tokens")


class Track(Base):
    __tablename__ = "tracks"

    track_id = Column(Integer, primary_key=True, index=True)
    track_name = Column(String(255), unique=True, nullable=False)
    description = Column(Text, nullable=False)

    # Relationships
    user_selections = relationship("UserTrackSelection", back_populates="track", cascade="all, delete-orphan")
    assessment_sessions = relationship("AssessmentSession", back_populates="track", cascade="all, delete-orphan")
    questions = relationship("AssessmentQuestionPool", back_populates="track", cascade="all, delete-orphan")
    knowledge_base = relationship("KnowledgeBase", back_populates="track", cascade="all, delete-orphan")


class UserTrackSelection(Base):
    __tablename__ = "user_track_selection"

    selection_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.track_id", ondelete="CASCADE"), nullable=False)
    selected_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationships
    user = relationship("User", back_populates="track_selections")
    track = relationship("Track", back_populates="user_selections")


class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    session_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.track_id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False)
    started_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    completed_at = Column(TIMESTAMP, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'completed')", name="check_assessment_status"),
    )

    # Relationships
    user = relationship("User", back_populates="assessment_sessions")
    track = relationship("Track", back_populates="assessment_sessions")
    session_questions = relationship("AssessmentSessionQuestion", back_populates="session", cascade="all, delete-orphan")
    responses = relationship("AssessmentResponse", back_populates="session", cascade="all, delete-orphan")
    result = relationship("AssessmentResult", back_populates="session", uselist=False, cascade="all, delete-orphan")


class AssessmentQuestionPool(Base):
    __tablename__ = "assessment_question_pool"

    question_id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.track_id", ondelete="CASCADE"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(20), nullable=False)
    difficulty = Column(String(20), nullable=False)

    __table_args__ = (
        CheckConstraint("question_type IN ('mcq', 'logic', 'open')", name="check_question_type"),
        CheckConstraint("difficulty IN ('low', 'medium', 'high')", name="check_difficulty"),
    )

    # Relationships
    track = relationship("Track", back_populates="questions")
    session_questions = relationship("AssessmentSessionQuestion", back_populates="question", cascade="all, delete-orphan")
    responses = relationship("AssessmentResponse", back_populates="question", cascade="all, delete-orphan")


class AssessmentSessionQuestion(Base):
    __tablename__ = "assessment_session_questions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("assessment_sessions.session_id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("assessment_question_pool.question_id", ondelete="CASCADE"), nullable=False)

    # Relationships
    session = relationship("AssessmentSession", back_populates="session_questions")
    question = relationship("AssessmentQuestionPool", back_populates="session_questions")


class AssessmentResponse(Base):
    __tablename__ = "assessment_responses"

    response_id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("assessment_sessions.session_id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("assessment_question_pool.question_id", ondelete="CASCADE"), nullable=False)
    user_answer = Column(Text, nullable=False)
    ai_score = Column(DECIMAL(3, 2), nullable=True)
    ai_explanation = Column(Text, nullable=False)
    submitted_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    __table_args__ = (
        CheckConstraint("ai_score >= 0 AND ai_score <= 1", name="check_ai_score_range"),
    )

    # Relationships
    session = relationship("AssessmentSession", back_populates="responses")
    question = relationship("AssessmentQuestionPool", back_populates="responses")


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    result_id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("assessment_sessions.session_id", ondelete="CASCADE"), unique=True, nullable=False)
    overall_score = Column(DECIMAL(5, 2), nullable=True)
    detected_level = Column(String(20), nullable=False)
    ai_reasoning = Column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint("overall_score >= 0 AND overall_score <= 100", name="check_overall_score_range"),
        CheckConstraint("detected_level IN ('beginner', 'intermediate', 'advanced')", name="check_detected_level"),
    )

    # Relationships
    session = relationship("AssessmentSession", back_populates="result")
    learning_paths = relationship("LearningPath", back_populates="result", cascade="all, delete-orphan")


class SkillProfile(Base):
    __tablename__ = "skill_profiles"

    profile_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, nullable=False)
    strengths = Column(Text, nullable=False)
    weaknesses = Column(Text, nullable=False)
    thinking_pattern = Column(Text, nullable=False)

    # Relationships
    user = relationship("User", back_populates="skill_profile")


class LearningPath(Base):
    __tablename__ = "learning_paths"

    path_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    result_id = Column(Integer, ForeignKey("assessment_results.result_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationships
    user = relationship("User", back_populates="learning_paths")
    result = relationship("AssessmentResult", back_populates="learning_paths")
    stages = relationship("LearningPathStage", back_populates="path", cascade="all, delete-orphan")
    evaluation_sessions = relationship("EvaluationSession", back_populates="path", cascade="all, delete-orphan")


class LearningPathStage(Base):
    __tablename__ = "learning_path_stages"

    stage_id = Column(Integer, primary_key=True, index=True)
    path_id = Column(Integer, ForeignKey("learning_paths.path_id", ondelete="CASCADE"), nullable=False)
    stage_name = Column(String(255), nullable=False)
    stage_order = Column(Integer, nullable=False)
    focus_area = Column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint("path_id", "stage_order", name="unique_path_stage_order"),
    )

    # Relationships
    path = relationship("LearningPath", back_populates="stages")
    content_items = relationship("StageContent", back_populates="stage", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="stage", cascade="all, delete-orphan")


class StageContent(Base):
    __tablename__ = "stage_content"

    content_id = Column(Integer, primary_key=True, index=True)
    stage_id = Column(Integer, ForeignKey("learning_path_stages.stage_id", ondelete="CASCADE"), nullable=False)
    content_type = Column(String(20), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    url = Column(String(1000), nullable=True)
    content_text = Column(Text, nullable=True)
    difficulty_level = Column(String(20), nullable=False)
    order_index = Column(Integer, nullable=False)
    estimated_duration = Column(Integer, nullable=True)  # in minutes
    source_platform = Column(String(100), nullable=True)
    tags = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    __table_args__ = (
        CheckConstraint("content_type IN ('video', 'documentation', 'article', 'exercise', 'tutorial', 'practice')", name="check_content_type"),
        CheckConstraint("difficulty_level IN ('beginner', 'intermediate', 'advanced')", name="check_content_difficulty"),
        UniqueConstraint("stage_id", "order_index", name="unique_stage_content_order"),
    )

    # Relationships
    stage = relationship("LearningPathStage", back_populates="content_items")
    user_progress = relationship("UserContentProgress", back_populates="content", cascade="all, delete-orphan")


class UserContentProgress(Base):
    __tablename__ = "user_content_progress"

    progress_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    content_id = Column(Integer, ForeignKey("stage_content.content_id", ondelete="CASCADE"), nullable=False)
    is_completed = Column(Boolean, default=False)
    completion_percentage = Column(Integer, default=0)
    time_spent_minutes = Column(Integer, default=0)
    started_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    completed_at = Column(TIMESTAMP, nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("completion_percentage >= 0 AND completion_percentage <= 100", name="check_completion_percentage"),
        UniqueConstraint("user_id", "content_id", name="unique_user_content"),
    )

    # Relationships
    user = relationship("User", back_populates="content_progress")
    content = relationship("StageContent", back_populates="user_progress")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    kb_id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.track_id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    source = Column(String(500), nullable=False)
    embedding_vector = Column(Text, nullable=False)

    # Relationships
    track = relationship("Track", back_populates="knowledge_base")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    chat_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    stage_id = Column(Integer, ForeignKey("learning_path_stages.stage_id", ondelete="CASCADE"), nullable=False)
    started_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    stage = relationship("LearningPathStage", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="chat", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    message_id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chat_sessions.chat_id", ondelete="CASCADE"), nullable=False)
    sender = Column(String(10), nullable=False)
    message_text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    __table_args__ = (
        CheckConstraint("sender IN ('user', 'ai')", name="check_message_sender"),
    )

    # Relationships
    chat = relationship("ChatSession", back_populates="messages")


class EvaluationSession(Base):
    __tablename__ = "evaluation_sessions"

    evaluation_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    path_id = Column(Integer, ForeignKey("learning_paths.path_id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False)
    started_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    completed_at = Column(TIMESTAMP, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'completed')", name="check_evaluation_status"),
    )

    # Relationships
    user = relationship("User", back_populates="evaluation_sessions")
    path = relationship("LearningPath", back_populates="evaluation_sessions")
    dialogues = relationship("EvaluationDialogue", back_populates="evaluation", cascade="all, delete-orphan")
    result = relationship("EvaluationResult", back_populates="evaluation", uselist=False, cascade="all, delete-orphan")


class EvaluationDialogue(Base):
    __tablename__ = "evaluation_dialogues"

    dialogue_id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluation_sessions.evaluation_id", ondelete="CASCADE"), nullable=False)
    speaker = Column(String(10), nullable=False)
    message_text = Column(Text, nullable=False)
    sequence_no = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint("speaker IN ('ai', 'user')", name="check_dialogue_speaker"),
    )

    # Relationships
    evaluation = relationship("EvaluationSession", back_populates="dialogues")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    result_id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("evaluation_sessions.evaluation_id", ondelete="CASCADE"), unique=True, nullable=False)
    reasoning_score = Column(DECIMAL(5, 2), nullable=True)
    problem_solving = Column(DECIMAL(5, 2), nullable=True)
    final_feedback = Column(Text, nullable=False)
    readiness_level = Column(String(20), nullable=False)

    __table_args__ = (
        CheckConstraint("reasoning_score >= 0 AND reasoning_score <= 100", name="check_reasoning_score_range"),
        CheckConstraint("problem_solving >= 0 AND problem_solving <= 100", name="check_problem_solving_range"),
        CheckConstraint("readiness_level IN ('junior', 'mid', 'senior_ready')", name="check_readiness_level"),
    )

    # Relationships
    evaluation = relationship("EvaluationSession", back_populates="result")

