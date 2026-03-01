import {
  adaptProgressAssessmentComparison,
  adaptProgressAssessmentHistory,
  adaptProgressDashboardSummary,
  adaptProgressEvaluationHistory,
  adaptProgressTimelineAnalytics,
  type ProgressAssessmentComparison,
  type ProgressAssessmentHistory,
  type ProgressDashboardSummary,
  type ProgressEvaluationHistory,
  type ProgressTimelineAnalytics,
} from "../adapters/progress";
import { apiClient } from "./client";

export type {
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
};
