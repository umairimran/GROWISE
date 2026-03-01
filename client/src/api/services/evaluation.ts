import type { components } from "../generated/openapi";
import { apiClient } from "./client";

export type EvaluationSessionResponse = components["schemas"]["EvaluationSessionResponse"];
export type EvaluationDialogueResponse = components["schemas"]["EvaluationDialogueResponse"];
export type EvaluationResultResponse = components["schemas"]["EvaluationResultResponse"];

export const evaluationService = {
  async createSession(pathId: number): Promise<EvaluationSessionResponse> {
    return apiClient.call({
      path: "/api/evaluation/sessions",
      method: "post",
      body: { path_id: pathId },
      auth: "required",
    });
  },

  async getSession(evaluationId: number): Promise<EvaluationSessionResponse> {
    return apiClient.call({
      path: "/api/evaluation/sessions/{evaluation_id}",
      method: "get",
      pathParams: { evaluation_id: evaluationId },
      auth: "required",
    });
  },

  async getMySessions(): Promise<EvaluationSessionResponse[]> {
    return apiClient.call({
      path: "/api/evaluation/my-sessions",
      method: "get",
      auth: "required",
    });
  },

  async respond(
    evaluationId: number,
    messageText: string,
  ): Promise<EvaluationDialogueResponse> {
    return apiClient.call({
      path: "/api/evaluation/sessions/{evaluation_id}/respond",
      method: "post",
      pathParams: { evaluation_id: evaluationId },
      body: { message_text: messageText },
      auth: "required",
    });
  },

  async getDialogues(evaluationId: number): Promise<EvaluationDialogueResponse[]> {
    return apiClient.call({
      path: "/api/evaluation/sessions/{evaluation_id}/dialogues",
      method: "get",
      pathParams: { evaluation_id: evaluationId },
      auth: "required",
    });
  },

  async complete(evaluationId: number): Promise<EvaluationResultResponse> {
    return apiClient.call({
      path: "/api/evaluation/sessions/{evaluation_id}/complete",
      method: "post",
      pathParams: { evaluation_id: evaluationId },
      auth: "required",
    });
  },

  async getResult(evaluationId: number): Promise<EvaluationResultResponse> {
    return apiClient.call({
      path: "/api/evaluation/sessions/{evaluation_id}/result",
      method: "get",
      pathParams: { evaluation_id: evaluationId },
      auth: "required",
    });
  },
};
