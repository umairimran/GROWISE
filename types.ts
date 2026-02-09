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

export interface AssessmentResult {
  topic: string;
  score: number;
  totalQuestions: number;
  weaknesses: string[];
  strengths: string[];
  knowledgeGraph: { subject: string; A: number; fullMark: number }[]; // For Recharts
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