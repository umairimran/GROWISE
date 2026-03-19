export type ViewState = 'HOME' | 'LOGIN' | 'SIGNUP' | 'SKILL_SELECTION' | 'ASSESSMENT_INTRO' | 'ASSESSMENT_ACTIVE' | 'ASSESSMENT_RESULT' | 'DASHBOARD' | 'COURSE_VIEW' | 'VALIDATOR' | 'BLOG';

export interface User {
  id: string;
  name: string;
  email: string;
  isPro: boolean;
}

export type QuestionType = 'multiple_choice' | 'free_text';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[]; // Only for multiple_choice
  correctIndex?: number; // Only for multiple_choice
  difficulty: 'Basic' | 'Medium' | 'Advanced' | 'Niche';
  topic: string;
  explanation?: string; // For immediate feedback
}

/** AI-generated comprehensive report (from assessment complete) */
export interface ComprehensiveReport {
  executive_summary: string;
  overall_assessment: string;
  strengths: Array<{
    area: string;
    evidence: string;
    question_indices?: number[];
  }>;
  weaknesses: Array<{
    area: string;
    evidence: string;
    question_indices?: number[];
    priority: "high" | "medium" | "low";
    recommendation: string;
  }>;
  dimension_breakdown?: Array<{
    dimension: string;
    score: number;
    analysis: string;
    gaps: string[];
  }>;
  learning_priorities?: Array<{
    topic: string;
    rationale: string;
  }>;
  content_generation_context?: {
    key_topics: string[];
    recommended_difficulty: string;
    gap_severity: string;
    focus_areas_for_stages: string[];
  };
}

export interface AssessmentResult {
  topic: string;
  score: number;
  totalQuestions: number;
  weaknesses: string[];
  strengths: string[];
  knowledgeGraph: { subject: string; A: number; fullMark: number }[]; // For Recharts
  sessionId?: number;
  learningPathId?: number | null;
  detectedLevel?: string;
  aiReasoning?: string;
  /** Full AI-generated report (for detailed display & content generation) */
  comprehensiveReport?: ComprehensiveReport | null;
}

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  content: string; // Markdown
  isCompleted: boolean;
  type: 'text' | 'video' | 'interactive';
}

export interface Course {
  id: string;
  title: string;
  modules: CourseModule[];
  progress: number; // 0-100
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
