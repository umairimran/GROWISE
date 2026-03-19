import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type LearningPathResponse = components["schemas"]["LearningPathResponse"];
type LearningPathStageResponse = components["schemas"]["LearningPathStageResponse"];

export const learningService = {
  async getMyCurrentPath(): Promise<LearningPathResponse> {
    return apiClient.call({
      path: "/api/learning/my-current-path",
      method: "get",
      auth: "required",
    });
  },

  async getMyPaths(): Promise<LearningPathResponse[]> {
    return apiClient.call({
      path: "/api/learning/my-paths",
      method: "get",
      auth: "required",
    });
  },

  async getPathStages(pathId: number): Promise<LearningPathStageResponse[]> {
    return apiClient.call({
      path: "/api/learning/paths/{path_id}/stages",
      method: "get",
      pathParams: { path_id: pathId },
      auth: "required",
    });
  },
};
