import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type ChatMessageResponse = components["schemas"]["ChatMessageResponse"];
type ChatSessionResponse = components["schemas"]["ChatSessionResponse"];

export const chatService = {
  async createSession(stageId: number): Promise<ChatSessionResponse> {
    return apiClient.call({
      path: "/api/chat/sessions",
      method: "post",
      body: { stage_id: stageId },
      auth: "required",
    });
  },

  async getMySessions(stageId?: number): Promise<ChatSessionResponse[]> {
    return apiClient.call({
      path: "/api/chat/my-sessions",
      method: "get",
      query: stageId ? { stage_id: stageId } : undefined,
      auth: "required",
    });
  },

  async getMessages(chatId: number, skip = 0, limit = 100): Promise<ChatMessageResponse[]> {
    return apiClient.call({
      path: "/api/chat/sessions/{chat_id}/messages",
      method: "get",
      pathParams: { chat_id: chatId },
      query: { skip, limit },
      auth: "required",
    });
  },

  async sendMessage(chatId: number, messageText: string): Promise<ChatMessageResponse> {
    return apiClient.call({
      path: "/api/chat/sessions/{chat_id}/messages",
      method: "post",
      pathParams: { chat_id: chatId },
      body: { message_text: messageText },
      auth: "required",
    });
  },
};
