import { beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "../../src/state/authStore";
import { authService } from "../../src/api/services/auth";
import { apiClient } from "../../src/api/services/client";
import type { components } from "../../src/api/generated";

vi.mock("../../src/api/services/client", () => ({
  apiClient: {
    call: vi.fn(),
  },
}));

const apiCallMock = vi.mocked(apiClient.call);

const userResponseFixture: components["schemas"]["UserResponse"] = {
  user_id: 7,
  email: "updated@growwise.test",
  full_name: "Updated User",
  role: "user",
  created_at: "2026-03-01T00:00:00Z",
};

const userDetailsFixture: components["schemas"]["UserDetailedResponse"] = {
  ...userResponseFixture,
  active_sessions_count: 2,
  last_login: "2026-03-01T00:00:00Z",
};

describe("Phase 8 auth service wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiCallMock.mockReset();
    authStore.clearSession();
    authStore.setCurrentUser(null);
  });

  it("updates current profile via PUT /api/auth/me and patches store user", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "session-1",
      tokenType: "bearer",
    });
    authStore.setCurrentUser(userDetailsFixture);

    apiCallMock.mockResolvedValueOnce(userResponseFixture);

    const updatedUser = await authService.updateMe({
      email: userResponseFixture.email,
      full_name: userResponseFixture.full_name,
    });

    expect(updatedUser.email).toBe(userResponseFixture.email);
    expect(apiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/auth/me",
        method: "put",
        body: {
          email: userResponseFixture.email,
          full_name: userResponseFixture.full_name,
        },
        auth: "required",
      }),
    );

    expect(authStore.getState().currentUser?.email).toBe(userResponseFixture.email);
    expect(authStore.getState().currentUser?.full_name).toBe(userResponseFixture.full_name);
  });

  it("deletes account via DELETE /api/auth/me and clears auth session", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "session-1",
      tokenType: "bearer",
    });

    apiCallMock.mockResolvedValueOnce(undefined);

    await authService.deleteMe();

    expect(apiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/auth/me",
        method: "delete",
        auth: "required",
      }),
    );
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().session.accessToken).toBeNull();
  });

  it("revokeSession clears local auth when current session is revoked", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "current-session",
      tokenType: "bearer",
    });

    apiCallMock.mockResolvedValueOnce(undefined);

    await authService.revokeSession("current-session");

    expect(apiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/auth/sessions/{session_id}",
        method: "delete",
        pathParams: { session_id: "current-session" },
        auth: "required",
      }),
    );
    expect(authStore.getState().isAuthenticated).toBe(false);
  });

  it("revokeAllSessions(true) keeps current session active", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "current-session",
      tokenType: "bearer",
    });

    apiCallMock.mockResolvedValueOnce(undefined);

    await authService.revokeAllSessions(true);

    expect(apiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/auth/sessions",
        method: "delete",
        query: { except_current: true },
        auth: "required",
      }),
    );
    expect(authStore.getState().isAuthenticated).toBe(true);
  });

  it("revokeAllSessions(false) clears local auth state", async () => {
    authStore.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      sessionId: "current-session",
      tokenType: "bearer",
    });

    apiCallMock.mockResolvedValueOnce(undefined);

    await authService.revokeAllSessions(false);

    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().session.refreshToken).toBeNull();
  });
});
