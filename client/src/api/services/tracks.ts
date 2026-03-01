import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type TrackResponse = components["schemas"]["TrackResponse"];
type UserTrackSelectionResponse = components["schemas"]["UserTrackSelectionResponse"];

export const tracksService = {
  async list(skip = 0, limit = 100): Promise<TrackResponse[]> {
    return apiClient.call({
      path: "/api/tracks/",
      method: "get",
      query: { skip, limit },
      auth: "optional",
    });
  },

  async getById(trackId: number): Promise<TrackResponse> {
    return apiClient.call({
      path: "/api/tracks/{track_id}",
      method: "get",
      pathParams: { track_id: trackId },
      auth: "optional",
    });
  },

  async select(trackId: number): Promise<UserTrackSelectionResponse> {
    return apiClient.call({
      path: "/api/tracks/select",
      method: "post",
      body: { track_id: trackId },
      auth: "required",
    });
  },

  async getMyCurrentTrack(): Promise<TrackResponse> {
    return apiClient.call({
      path: "/api/tracks/my-current-track",
      method: "get",
      auth: "required",
    });
  },
};
