import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "../../src/api/generated";
import { assessmentService } from "../../src/api/services/assessment";
import { authService } from "../../src/api/services/auth";
import { apiClient } from "../../src/api/services/client";
import { chatService } from "../../src/api/services/chat";
import { contentService } from "../../src/api/services/content";
import { evaluationService } from "../../src/api/services/evaluation";
import { learningService } from "../../src/api/services/learning";
import { tracksService } from "../../src/api/services/tracks";
import { authStore } from "../../src/state/authStore";

vi.mock("../../src/api/services/client", () => ({
  apiClient: {
    call: vi.fn(),
  },
}));

const apiCallMock = vi.mocked(apiClient.call);

type ApiCall = { path: string; method: string };

const operationTrace = (): ApiCall[] =>
  apiCallMock.mock.calls.map(([call]) => ({ path: call.path as string, method: call.method as string }));

describe("migration service scenarios", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiCallMock.mockReset();
    authStore.clearSession();
    authStore.setCurrentUser(null);
  });

  it("covers auth register/login/refresh/me/logout and session state updates", async () => {
    const registeredUser = {
      user_id: 11,
      full_name: "New User",
      email: "new@growwise.test",
      role: "user",
      created_at: "2026-01-01T00:00:00Z",
    } as components["schemas"]["UserResponse"];

    const initialToken = {
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "bearer",
      session_id: "session-1",
    } as components["schemas"]["Token"];

    const refreshedToken = {
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "bearer",
      session_id: "session-2",
    } as components["schemas"]["Token"];

    const mePayload = {
      user_id: 11,
      full_name: "New User",
      email: "new@growwise.test",
      role: "user",
      created_at: "2026-01-01T00:00:00Z",
      active_sessions_count: 1,
    } as components["schemas"]["UserDetailedResponse"];

    apiCallMock
      .mockResolvedValueOnce(registeredUser)
      .mockResolvedValueOnce(initialToken)
      .mockResolvedValueOnce(refreshedToken)
      .mockResolvedValueOnce(mePayload)
      .mockResolvedValueOnce(undefined);

    await authService.register({
      email: "new@growwise.test",
      full_name: "New User",
      password: "Password123!",
    });
    await authService.loginJson({ email: "new@growwise.test", password: "Password123!" });
    await authService.refresh();
    await authService.me();
    await authService.logout();

    expect(authStore.getState().session.accessToken).toBeNull();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(operationTrace()).toEqual([
      { path: "/api/auth/register", method: "post" },
      { path: "/api/auth/login-json", method: "post" },
      { path: "/api/auth/refresh", method: "post" },
      { path: "/api/auth/me", method: "get" },
      { path: "/api/auth/logout", method: "post" },
    ]);
    expect(apiCallMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        auth: "none",
        retryUnauthorized: false,
      }),
    );
  });

  it("covers tracks + assessment lifecycle endpoint usage", async () => {
    apiCallMock
      .mockResolvedValueOnce(
        [{ track_id: 5, track_name: "Frontend", description: "Frontend track" }] as components["schemas"]["TrackResponse"][],
      )
      .mockResolvedValueOnce({ track_id: 5 } as components["schemas"]["UserTrackSelectionResponse"])
      .mockResolvedValueOnce({ session_id: 101, track_id: 5 } as components["schemas"]["AssessmentSessionResponse"])
      .mockResolvedValueOnce(
        [{ question_id: 201, question_text: "Q1", question_type: "open", difficulty: "medium" }] as components["schemas"]["AssessmentQuestionResponse"][],
      )
      .mockResolvedValueOnce({ response_id: 301, ai_score: "0.8" } as components["schemas"]["AssessmentResponseResponse"])
      .mockResolvedValueOnce(
        {
          session_id: 101,
          overall_score: "0.8",
          detected_level: "intermediate",
          ai_reasoning: "Solid.",
          learning_path_id: 12,
        } as components["schemas"]["AssessmentResultResponse"],
      )
      .mockResolvedValueOnce({ path_id: 12 } as components["schemas"]["LearningPathResponse"]);

    await tracksService.list();
    await tracksService.select(5);
    await assessmentService.createSession(5);
    await assessmentService.getSessionQuestions(101);
    await assessmentService.submitAnswer(101, { question_id: 201, user_answer: "Answer" });
    await assessmentService.completeSession(101);
    await assessmentService.getSessionLearningPath(101);

    expect(operationTrace()).toEqual([
      { path: "/api/tracks/", method: "get" },
      { path: "/api/tracks/select", method: "post" },
      { path: "/api/assessment/sessions", method: "post" },
      { path: "/api/assessment/sessions/{session_id}/questions", method: "get" },
      { path: "/api/assessment/sessions/{session_id}/submit", method: "post" },
      { path: "/api/assessment/sessions/{session_id}/complete", method: "post" },
      { path: "/api/assessment/sessions/{session_id}/learning-path", method: "get" },
    ]);
    expect(apiCallMock.mock.calls[4]?.[0]).toEqual(
      expect.objectContaining({
        body: { question_id: 201, user_answer: "Answer" },
        pathParams: { session_id: 101 },
      }),
    );
  });

  it("covers learning flow when stage content is generated, tracked, updated, and completed", async () => {
    apiCallMock
      .mockResolvedValueOnce({ path_id: 12 } as components["schemas"]["LearningPathResponse"])
      .mockResolvedValueOnce(
        [{ stage_id: 700, path_id: 12, stage_order: 1, stage_name: "Core", focus_area: "Fundamentals" }] as components["schemas"]["LearningPathStageResponse"][],
      )
      .mockResolvedValueOnce([] as components["schemas"]["StageContentWithProgress"][])
      .mockResolvedValueOnce({ stage_id: 700, content_count: 8 })
      .mockResolvedValueOnce(
        {
          content_id: 801,
          user_id: 11,
          completion_percentage: 0,
          time_spent_minutes: 0,
          is_completed: false,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
          completed_at: null,
          notes: null,
        } as components["schemas"]["UserContentProgressResponse"],
      )
      .mockResolvedValueOnce(
        {
          content_id: 801,
          user_id: 11,
          completion_percentage: 50,
          time_spent_minutes: 20,
          is_completed: false,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
          completed_at: null,
          notes: null,
        } as components["schemas"]["UserContentProgressResponse"],
      )
      .mockResolvedValueOnce(
        {
          content_id: 801,
          user_id: 11,
          completion_percentage: 100,
          time_spent_minutes: 25,
          is_completed: true,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
          completed_at: "2026-03-01T00:20:00Z",
          notes: null,
        } as components["schemas"]["UserContentProgressResponse"],
      )
      .mockResolvedValueOnce(
        {
          stage_id: 700,
          total_content_items: 8,
          completed_items: 1,
          completion_percentage: 12,
          total_time_spent_minutes: 25,
          estimated_time_remaining: 95,
        } as components["schemas"]["StageProgressSummary"],
      );

    await learningService.getMyCurrentPath();
    await learningService.getPathStages(12);
    await contentService.getStageContent(700);
    await contentService.generateStageContent({ stage_id: 700, content_count: 8 });
    await contentService.startContentProgress({
      content_id: 801,
      completion_percentage: 0,
      time_spent_minutes: 0,
      notes: null,
    });
    await contentService.updateContentProgress(801, {
      completion_percentage: 50,
      time_spent_minutes: 20,
      is_completed: false,
    });
    await contentService.completeContent(801);
    await contentService.getStageProgress(700);

    expect(operationTrace()).toEqual([
      { path: "/api/learning/my-current-path", method: "get" },
      { path: "/api/learning/paths/{path_id}/stages", method: "get" },
      { path: "/api/content/stage/{stage_id}", method: "get" },
      { path: "/api/content/generate", method: "post" },
      { path: "/api/content/progress", method: "post" },
      { path: "/api/content/progress/{content_id}", method: "put" },
      { path: "/api/content/{content_id}/complete", method: "post" },
      { path: "/api/content/stage/{stage_id}/progress", method: "get" },
    ]);
  });

  it("covers mentor chat create/reuse behavior with paging and message send", async () => {
    apiCallMock
      .mockResolvedValueOnce([{ chat_id: 900, stage_id: 700 }] as components["schemas"]["ChatSessionResponse"][])
      .mockResolvedValueOnce({ chat_id: 901, stage_id: 700 } as components["schemas"]["ChatSessionResponse"])
      .mockResolvedValueOnce(
        [{ message_id: 1001, chat_id: 901, sender: "user", message_text: "Hi" }] as components["schemas"]["ChatMessageResponse"][],
      )
      .mockResolvedValueOnce(
        { message_id: 1002, chat_id: 901, sender: "ai", message_text: "Hello" } as components["schemas"]["ChatMessageResponse"],
      );

    await chatService.getMySessions(700);
    await chatService.createSession(700);
    await chatService.getMessages(901, 25, 50);
    await chatService.sendMessage(901, "How should I approach this stage?");

    expect(operationTrace()).toEqual([
      { path: "/api/chat/my-sessions", method: "get" },
      { path: "/api/chat/sessions", method: "post" },
      { path: "/api/chat/sessions/{chat_id}/messages", method: "get" },
      { path: "/api/chat/sessions/{chat_id}/messages", method: "post" },
    ]);
    expect(apiCallMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        query: { stage_id: 700 },
      }),
    );
    expect(apiCallMock.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        query: { skip: 25, limit: 50 },
      }),
    );
  });

  it("covers evaluation session lifecycle APIs", async () => {
    apiCallMock
      .mockResolvedValueOnce({ evaluation_id: 777, path_id: 12, status: "in_progress" } as components["schemas"]["EvaluationSessionResponse"])
      .mockResolvedValueOnce({ evaluation_id: 777, path_id: 12, status: "in_progress" } as components["schemas"]["EvaluationSessionResponse"])
      .mockResolvedValueOnce([{ evaluation_id: 777, path_id: 12, status: "in_progress" }] as components["schemas"]["EvaluationSessionResponse"][])
      .mockResolvedValueOnce(
        {
          dialogue_id: 333,
          evaluation_id: 777,
          sequence_no: 1,
          speaker: "user",
          message_text: "Candidate response",
          timestamp: "2026-03-01T00:00:00Z",
        } as components["schemas"]["EvaluationDialogueResponse"],
      )
      .mockResolvedValueOnce([] as components["schemas"]["EvaluationDialogueResponse"][])
      .mockResolvedValueOnce(
        {
          evaluation_id: 777,
          reasoning_score: "0.82",
          problem_solving: "0.79",
          readiness_level: "mid",
          final_feedback: "Good progress.",
        } as components["schemas"]["EvaluationResultResponse"],
      )
      .mockResolvedValueOnce(
        {
          evaluation_id: 777,
          reasoning_score: "0.82",
          problem_solving: "0.79",
          readiness_level: "mid",
          final_feedback: "Good progress.",
        } as components["schemas"]["EvaluationResultResponse"],
      );

    await evaluationService.createSession(12);
    await evaluationService.getSession(777);
    await evaluationService.getMySessions();
    await evaluationService.respond(777, "I would start by scoping the issue.");
    await evaluationService.getDialogues(777);
    await evaluationService.complete(777);
    await evaluationService.getResult(777);

    expect(operationTrace()).toEqual([
      { path: "/api/evaluation/sessions", method: "post" },
      { path: "/api/evaluation/sessions/{evaluation_id}", method: "get" },
      { path: "/api/evaluation/my-sessions", method: "get" },
      { path: "/api/evaluation/sessions/{evaluation_id}/respond", method: "post" },
      { path: "/api/evaluation/sessions/{evaluation_id}/dialogues", method: "get" },
      { path: "/api/evaluation/sessions/{evaluation_id}/complete", method: "post" },
      { path: "/api/evaluation/sessions/{evaluation_id}/result", method: "get" },
    ]);
  });

  it("covers auth session management endpoints for list/get/revoke/revoke-all", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "session-current",
      tokenType: "bearer",
    });

    apiCallMock
      .mockResolvedValueOnce([{ session_id: "session-current" }] as components["schemas"]["UserSessionResponse"][])
      .mockResolvedValueOnce({ session_id: "session-2" } as components["schemas"]["UserSessionResponse"])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await authService.listSessions(true);
    await authService.getSession("session-2");
    await authService.revokeSession("session-2");
    await authService.revokeAllSessions(true);

    expect(operationTrace()).toEqual([
      { path: "/api/auth/sessions", method: "get" },
      { path: "/api/auth/sessions/{session_id}", method: "get" },
      { path: "/api/auth/sessions/{session_id}", method: "delete" },
      { path: "/api/auth/sessions", method: "delete" },
    ]);
  });
});
