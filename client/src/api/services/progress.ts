import {
  adaptImprovementAnalysis,
  adaptLearningPathProgress,
  adaptPathCompletionReport,
  adaptPathCompletionReportCreate,
  adaptProgressAssessmentComparison,
  adaptProgressAssessmentHistory,
  adaptProgressDashboardSummary,
  adaptProgressEvaluationHistory,
  adaptProgressTimelineAnalytics,
  type ImprovementAnalysis,
  type LearningPathProgress,
  type PathCompletionReport,
  type PathCompletionReportCreate,
  type ProgressAssessmentComparison,
  type ProgressAssessmentHistory,
  type ProgressDashboardSummary,
  type ProgressEvaluationHistory,
  type ProgressTimelineAnalytics,
} from "../adapters/progress";
import { apiClient, rawHttpClient } from "./client";

export type {
  ImprovementAnalysis,
  ImprovementAnalysisDialogueItem,
  LearningPathProgress,
  PathCompletionReport,
  PathCompletionReportCreate,
  ProgressAssessmentComparison,
  ProgressAssessmentHistory,
  ProgressAssessmentHistoryImprovement,
  ProgressAssessmentHistoryItem,
  ProgressDashboardAssessmentResult,
  ProgressDashboardEvaluationResult,
  ProgressDashboardSkillProfile,
  ProgressDashboardSummary,
  ProgressEvaluationHistory,
  ProgressEvaluationHistoryItem,
  ProgressEvaluationHistoryProgression,
  ProgressEvaluationHistoryProgressionSnapshot,
  ProgressTimelineAnalytics,
  ProgressTimelineEvent,
  ProgressTimelineEventType,
} from "../adapters/progress";

export const progressService = {
  async getDashboard(): Promise<ProgressDashboardSummary> {
    const response = await apiClient.call({
      path: "/api/progress/dashboard",
      method: "get",
      auth: "required",
    });

    return adaptProgressDashboardSummary(response);
  },

  async getTimeline(days = 30): Promise<ProgressTimelineAnalytics> {
    const response = await apiClient.call({
      path: "/api/progress/analytics/timeline",
      method: "get",
      query: { days },
      auth: "required",
    });

    return adaptProgressTimelineAnalytics(response);
  },

  async getAssessmentHistory(trackId?: number): Promise<ProgressAssessmentHistory> {
    const response = await apiClient.call({
      path: "/api/progress/assessments/history",
      method: "get",
      query: trackId ? { track_id: trackId } : undefined,
      auth: "required",
    });

    return adaptProgressAssessmentHistory(response);
  },

  async compareAssessments(
    sessionId1: number,
    sessionId2: number,
  ): Promise<ProgressAssessmentComparison> {
    const response = await apiClient.call({
      path: "/api/progress/assessments/compare/{session_id_1}/{session_id_2}",
      method: "get",
      pathParams: { session_id_1: sessionId1, session_id_2: sessionId2 },
      auth: "required",
    });

    return adaptProgressAssessmentComparison(response);
  },

  async getEvaluationHistory(): Promise<ProgressEvaluationHistory> {
    const response = await apiClient.call({
      path: "/api/progress/evaluations/history",
      method: "get",
      auth: "required",
    });

    return adaptProgressEvaluationHistory(response);
  },

  async getLearningPathProgress(pathId: number): Promise<LearningPathProgress> {
    const response = await apiClient.call({
      path: "/api/progress/learning-path/{path_id}",
      method: "get",
      pathParams: { path_id: pathId },
      auth: "required",
    });

    return adaptLearningPathProgress(response);
  },

  async createPathCompletionReport(pathId: number): Promise<PathCompletionReportCreate> {
    const response = await rawHttpClient.request<unknown>({
      path: `/api/progress/path/${pathId}/complete-report`,
      method: "POST",
      auth: "required",
    });

    return adaptPathCompletionReportCreate(response);
  },

  async getPathCompletionReport(pathId: number): Promise<PathCompletionReport> {
    const response = await rawHttpClient.request<unknown>({
      path: `/api/progress/path/${pathId}/report`,
      method: "GET",
      auth: "required",
    });

    return adaptPathCompletionReport(response);
  },

  async getImprovementAnalysis(pathId: number): Promise<ImprovementAnalysis> {
    const response = await rawHttpClient.request<unknown>({
      path: `/api/progress/path/${pathId}/improvement-analysis`,
      method: "GET",
      auth: "required",
    });

    return adaptImprovementAnalysis(response);
  },
};
