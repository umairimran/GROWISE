import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type AssessmentSessionResponse = components["schemas"]["AssessmentSessionResponse"];
type AssessmentQuestionResponse = components["schemas"]["AssessmentQuestionResponse"];
type AssessmentResponseResponse = components["schemas"]["AssessmentResponseResponse"];
type AssessmentResultResponse = components["schemas"]["AssessmentResultResponse"];
type LearningPathResponse = components["schemas"]["LearningPathResponse"];

export const assessmentService = {
  async createSession(trackId: number): Promise<AssessmentSessionResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions",
      method: "post",
      body: { track_id: trackId },
      auth: "required",
    });
  },

  async getSession(sessionId: number): Promise<AssessmentSessionResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}",
      method: "get",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },

  async getSessionQuestions(sessionId: number): Promise<AssessmentQuestionResponse[]> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}/questions",
      method: "get",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },

  async submitAnswer(
    sessionId: number,
    payload: components["schemas"]["AssessmentAnswerSubmit"],
  ): Promise<AssessmentResponseResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}/submit",
      method: "post",
      pathParams: { session_id: sessionId },
      body: payload,
      auth: "required",
    });
  },

  async completeSession(sessionId: number): Promise<AssessmentResultResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}/complete",
      method: "post",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },

  async getSessionResult(sessionId: number): Promise<AssessmentResultResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}/result",
      method: "get",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },

  async getSessionLearningPath(sessionId: number): Promise<LearningPathResponse> {
    return apiClient.call({
      path: "/api/assessment/sessions/{session_id}/learning-path",
      method: "get",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },
};
