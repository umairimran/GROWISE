-- ============================================================================
-- GROWWISE DATABASE SCHEMA
-- Complete normalized AI-centric database design
-- Supports dynamic assessment, learning paths, and evaluation workflows
-- ============================================================================

-- Drop tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS evaluation_results CASCADE;
DROP TABLE IF EXISTS evaluation_dialogues CASCADE;
DROP TABLE IF EXISTS evaluation_sessions CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS knowledge_base CASCADE;
DROP TABLE IF EXISTS user_content_progress CASCADE;
DROP TABLE IF EXISTS stage_content CASCADE;
DROP TABLE IF EXISTS learning_path_stages CASCADE;
DROP TABLE IF EXISTS learning_paths CASCADE;
DROP TABLE IF EXISTS skill_profiles CASCADE;
DROP TABLE IF EXISTS assessment_results CASCADE;
DROP TABLE IF EXISTS assessment_responses CASCADE;
DROP TABLE IF EXISTS assessment_session_questions CASCADE;
DROP TABLE IF EXISTS assessment_question_pool CASCADE;
DROP TABLE IF EXISTS assessment_sessions CASCADE;
DROP TABLE IF EXISTS user_track_selection CASCADE;
DROP TABLE IF EXISTS tracks CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- PHASE 1: USER & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster email lookups during authentication
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- PHASE 1B: SESSION MANAGEMENT & PASSWORD RESET
-- ============================================================================

CREATE TABLE user_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_token ON user_sessions USING hash (access_token);

CREATE TABLE password_reset_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_token ON password_reset_tokens(reset_token);
CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at);

-- ============================================================================
-- PHASE 2: TRACK / DOMAIN SELECTION
-- ============================================================================

CREATE TABLE tracks (
    track_id SERIAL PRIMARY KEY,
    track_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE user_track_selection (
    selection_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster user track lookups
CREATE INDEX idx_user_track_selection_user ON user_track_selection(user_id);
CREATE INDEX idx_user_track_selection_track ON user_track_selection(track_id);

-- ============================================================================
-- PHASE 3: RUNTIME ASSESSMENT ENGINE
-- ============================================================================

CREATE TABLE assessment_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
);

CREATE INDEX idx_assessment_sessions_user ON assessment_sessions(user_id);
CREATE INDEX idx_assessment_sessions_status ON assessment_sessions(status);

CREATE TABLE assessment_question_pool (
    question_id SERIAL PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('mcq', 'logic', 'open')),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('low', 'medium', 'high'))
);

CREATE INDEX idx_assessment_questions_track ON assessment_question_pool(track_id);
CREATE INDEX idx_assessment_questions_difficulty ON assessment_question_pool(difficulty);
CREATE INDEX idx_assessment_questions_type ON assessment_question_pool(question_type);

CREATE TABLE assessment_session_questions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES assessment_sessions(session_id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES assessment_question_pool(question_id) ON DELETE CASCADE
);

CREATE INDEX idx_assessment_session_questions_session ON assessment_session_questions(session_id);
CREATE INDEX idx_assessment_session_questions_question ON assessment_session_questions(question_id);

CREATE TABLE assessment_responses (
    response_id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES assessment_sessions(session_id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES assessment_question_pool(question_id) ON DELETE CASCADE,
    user_answer TEXT NOT NULL,
    ai_score DECIMAL(3,2) CHECK (ai_score >= 0 AND ai_score <= 1),
    ai_explanation TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assessment_responses_session ON assessment_responses(session_id);
CREATE INDEX idx_assessment_responses_question ON assessment_responses(question_id);

CREATE TABLE assessment_results (
    result_id SERIAL PRIMARY KEY,
    session_id INTEGER UNIQUE NOT NULL REFERENCES assessment_sessions(session_id) ON DELETE CASCADE,
    overall_score DECIMAL(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
    detected_level VARCHAR(20) NOT NULL CHECK (detected_level IN ('beginner', 'intermediate', 'advanced')),
    ai_reasoning TEXT NOT NULL
);

CREATE INDEX idx_assessment_results_session ON assessment_results(session_id);
CREATE INDEX idx_assessment_results_level ON assessment_results(detected_level);

-- ============================================================================
-- PHASE 4: SKILL INTELLIGENCE
-- ============================================================================

CREATE TABLE skill_profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    strengths TEXT NOT NULL,
    weaknesses TEXT NOT NULL,
    thinking_pattern TEXT NOT NULL
);

CREATE INDEX idx_skill_profiles_user ON skill_profiles(user_id);

-- ============================================================================
-- PHASE 5: AI-GENERATED LEARNING PATH
-- ============================================================================

CREATE TABLE learning_paths (
    path_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL REFERENCES assessment_results(result_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_paths_user ON learning_paths(user_id);
CREATE INDEX idx_learning_paths_result ON learning_paths(result_id);

CREATE TABLE learning_path_stages (
    stage_id SERIAL PRIMARY KEY,
    path_id INTEGER NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,
    stage_name VARCHAR(255) NOT NULL,
    stage_order INTEGER NOT NULL,
    focus_area TEXT NOT NULL,
    UNIQUE(path_id, stage_order)
);

CREATE INDEX idx_learning_path_stages_path ON learning_path_stages(path_id);
CREATE INDEX idx_learning_path_stages_order ON learning_path_stages(path_id, stage_order);

-- ============================================================================
-- PHASE 5B: LEARNING CONTENT & RESOURCES
-- ============================================================================

CREATE TABLE stage_content (
    content_id SERIAL PRIMARY KEY,
    stage_id INTEGER NOT NULL REFERENCES learning_path_stages(stage_id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'documentation', 'article', 'exercise', 'tutorial', 'practice')),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    url VARCHAR(1000),
    content_text TEXT,
    difficulty_level VARCHAR(20) NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    order_index INTEGER NOT NULL,
    estimated_duration INTEGER,
    source_platform VARCHAR(100),
    tags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stage_id, order_index)
);

CREATE INDEX idx_stage_content_stage ON stage_content(stage_id);
CREATE INDEX idx_stage_content_type ON stage_content(content_type);
CREATE INDEX idx_stage_content_difficulty ON stage_content(difficulty_level);
CREATE INDEX idx_stage_content_order ON stage_content(stage_id, order_index);

CREATE TABLE user_content_progress (
    progress_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content_id INTEGER NOT NULL REFERENCES stage_content(content_id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    time_spent_minutes INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    notes TEXT,
    UNIQUE(user_id, content_id)
);

CREATE INDEX idx_user_content_progress_user ON user_content_progress(user_id);
CREATE INDEX idx_user_content_progress_content ON user_content_progress(content_id);
CREATE INDEX idx_user_content_progress_completed ON user_content_progress(user_id, is_completed);

-- ============================================================================
-- PHASE 6: RAG-BASED CONTEXTUAL CHAT ASSISTANT
-- ============================================================================

CREATE TABLE knowledge_base (
    kb_id SERIAL PRIMARY KEY,
    track_id INTEGER NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source VARCHAR(500) NOT NULL,
    embedding_vector TEXT NOT NULL
);

CREATE INDEX idx_knowledge_base_track ON knowledge_base(track_id);

CREATE TABLE chat_sessions (
    chat_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    stage_id INTEGER NOT NULL REFERENCES learning_path_stages(stage_id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_stage ON chat_sessions(stage_id);

CREATE TABLE chat_messages (
    message_id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chat_sessions(chat_id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'ai')),
    message_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- ============================================================================
-- PHASE 7: CHAT-BASED PROJECT EVALUATION
-- ============================================================================

CREATE TABLE evaluation_sessions (
    evaluation_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    path_id INTEGER NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
);

CREATE INDEX idx_evaluation_sessions_user ON evaluation_sessions(user_id);
CREATE INDEX idx_evaluation_sessions_path ON evaluation_sessions(path_id);
CREATE INDEX idx_evaluation_sessions_status ON evaluation_sessions(status);

CREATE TABLE evaluation_dialogues (
    dialogue_id SERIAL PRIMARY KEY,
    evaluation_id INTEGER NOT NULL REFERENCES evaluation_sessions(evaluation_id) ON DELETE CASCADE,
    speaker VARCHAR(10) NOT NULL CHECK (speaker IN ('ai', 'user')),
    message_text TEXT NOT NULL,
    sequence_no INTEGER NOT NULL
);

CREATE INDEX idx_evaluation_dialogues_evaluation ON evaluation_dialogues(evaluation_id);
CREATE INDEX idx_evaluation_dialogues_sequence ON evaluation_dialogues(evaluation_id, sequence_no);

CREATE TABLE evaluation_results (
    result_id SERIAL PRIMARY KEY,
    evaluation_id INTEGER UNIQUE NOT NULL REFERENCES evaluation_sessions(evaluation_id) ON DELETE CASCADE,
    reasoning_score DECIMAL(5,2) CHECK (reasoning_score >= 0 AND reasoning_score <= 100),
    problem_solving DECIMAL(5,2) CHECK (problem_solving >= 0 AND problem_solving <= 100),
    final_feedback TEXT NOT NULL,
    readiness_level VARCHAR(20) NOT NULL CHECK (readiness_level IN ('junior', 'mid', 'senior_ready'))
);

CREATE INDEX idx_evaluation_results_evaluation ON evaluation_results(evaluation_id);
CREATE INDEX idx_evaluation_results_readiness ON evaluation_results(readiness_level);

-- ============================================================================
-- SAMPLE DATA INSERTION (Optional - for testing)
-- ============================================================================

-- Insert sample admin user
INSERT INTO users (full_name, email, password_hash, role) VALUES
('Admin User', 'admin@growwise.com', '$2b$10$examplehash', 'admin');

-- Insert sample tracks
INSERT INTO tracks (track_name, description) VALUES
('Full Stack Development', 'Complete web development including frontend, backend, and databases'),
('Data Science', 'Machine learning, AI, and data analysis'),
('DevOps Engineering', 'CI/CD, cloud infrastructure, and automation');

-- ============================================================================
-- USEFUL QUERIES FOR VERIFICATION
-- ============================================================================

-- Verify all tables are created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Check all foreign key constraints
-- SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS referenced_table
-- FROM pg_constraint WHERE contype = 'f';

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Database flow reminder:
-- users → user_sessions, password_reset_tokens
-- users → user_track_selection → assessment_sessions → assessment_session_questions →
-- assessment_responses → assessment_results → skill_profiles → learning_paths → 
-- learning_path_stages → stage_content → user_content_progress → 
-- chat_sessions → chat_messages → evaluation_sessions → 
-- evaluation_dialogues → evaluation_results

