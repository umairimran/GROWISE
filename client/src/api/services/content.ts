import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type GenerateStageContentRequest = components["schemas"]["GenerateStageContentRequest"];
type StageContentWithProgress = components["schemas"]["StageContentWithProgress"];
type StageProgressSummary = components["schemas"]["StageProgressSummary"];
type UserContentProgressCreate = components["schemas"]["UserContentProgressCreate"];
type UserContentProgressUpdate = components["schemas"]["UserContentProgressUpdate"];
type UserContentProgressResponse = components["schemas"]["UserContentProgressResponse"];

type StageContentGenerationResult = {
  message?: string;
  stage_id?: number;
  content_count?: number;
};

export const contentService = {
  async getStageContent(stageId: number): Promise<StageContentWithProgress[]> {
    return apiClient.call({
      path: "/api/content/stage/{stage_id}",
      method: "get",
      pathParams: { stage_id: stageId },
      auth: "required",
    });
  },

  async generateStageContent(
    payload: GenerateStageContentRequest,
  ): Promise<StageContentGenerationResult> {
    return apiClient.call({
      path: "/api/content/generate",
      method: "post",
      body: payload,
      auth: "required",
    }) as Promise<StageContentGenerationResult>;
  },

  async startContentProgress(
    payload: UserContentProgressCreate,
  ): Promise<UserContentProgressResponse> {
    return apiClient.call({
      path: "/api/content/progress",
      method: "post",
      body: payload,
      auth: "required",
    });
  },

  async updateContentProgress(
    contentId: number,
    payload: UserContentProgressUpdate,
  ): Promise<UserContentProgressResponse> {
    return apiClient.call({
      path: "/api/content/progress/{content_id}",
      method: "put",
      pathParams: { content_id: contentId },
      body: payload,
      auth: "required",
    });
  },

  async completeContent(contentId: number): Promise<UserContentProgressResponse> {
    return apiClient.call({
      path: "/api/content/{content_id}/complete",
      method: "post",
      pathParams: { content_id: contentId },
      auth: "required",
    });
  },

  async getStageProgress(stageId: number): Promise<StageProgressSummary> {
    return apiClient.call({
      path: "/api/content/stage/{stage_id}/progress",
      method: "get",
      pathParams: { stage_id: stageId },
      auth: "required",
    });
  },
};
