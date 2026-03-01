import { authStore } from "../../state/authStore";
import type { components } from "../generated/openapi";
import { apiClient } from "./client";

type UserCreate = components["schemas"]["UserCreate"];
type UserLogin = components["schemas"]["UserLogin"];
type TokenRefresh = components["schemas"]["TokenRefresh"];
type PasswordChange = components["schemas"]["PasswordChange"];
type PasswordResetRequest = components["schemas"]["PasswordResetRequest"];
type PasswordResetConfirm = components["schemas"]["PasswordResetConfirm"];
type UserUpdate = components["schemas"]["UserUpdate"];
type UserResponse = components["schemas"]["UserResponse"];
type UserDetailedResponse = components["schemas"]["UserDetailedResponse"];
type UserSessionResponse = components["schemas"]["UserSessionResponse"];
type TokenResponse = components["schemas"]["Token"];

export const authService = {
  async register(payload: UserCreate): Promise<UserResponse> {
    return apiClient.call({
      path: "/api/auth/register",
      method: "post",
      body: payload,
      auth: "none",
      retryUnauthorized: false,
    });
  },

  async loginJson(payload: UserLogin): Promise<TokenResponse> {
    const token = await apiClient.call({
      path: "/api/auth/login-json",
      method: "post",
      body: payload,
      auth: "none",
      retryUnauthorized: false,
    });

    authStore.setSessionFromToken(token);
    return token;
  },

  async refresh(refreshToken?: string): Promise<TokenResponse> {
    const token = await apiClient.call({
      path: "/api/auth/refresh",
      method: "post",
      body: {
        refresh_token: refreshToken ?? authStore.getState().session.refreshToken ?? "",
      } satisfies TokenRefresh,
      auth: "none",
      retryUnauthorized: false,
    });

    authStore.setSessionFromToken(token);
    return token;
  },

  async logout(sessionId?: string): Promise<void> {
    await apiClient.call({
      path: "/api/auth/logout",
      method: "post",
      query: sessionId ? { session_id: sessionId } : undefined,
      auth: "required",
    });

    const currentSessionId = authStore.getState().session.sessionId;
    if (!sessionId || sessionId === currentSessionId) {
      authStore.clearSession();
    }
  },

  async me(): Promise<UserDetailedResponse> {
    const user = await apiClient.call({
      path: "/api/auth/me",
      method: "get",
      auth: "required",
    });
    authStore.setCurrentUser(user);
    return user;
  },

  async updateMe(payload: UserUpdate): Promise<UserResponse> {
    const user = await apiClient.call({
      path: "/api/auth/me",
      method: "put",
      body: payload,
      auth: "required",
    });

    const currentUser = authStore.getState().currentUser;
    if (currentUser) {
      authStore.setCurrentUser({
        ...currentUser,
        full_name: user.full_name,
        email: user.email,
      });
    }

    return user;
  },

  async deleteMe(): Promise<void> {
    await apiClient.call({
      path: "/api/auth/me",
      method: "delete",
      auth: "required",
    });

    authStore.clearSession();
  },

  async changePassword(payload: PasswordChange): Promise<void> {
    await apiClient.call({
      path: "/api/auth/password/change",
      method: "post",
      body: payload,
      auth: "required",
    });
  },

  async requestPasswordReset(payload: PasswordResetRequest): Promise<void> {
    await apiClient.call({
      path: "/api/auth/password/reset/request",
      method: "post",
      body: payload,
      auth: "none",
      retryUnauthorized: false,
    });
  },

  async confirmPasswordReset(payload: PasswordResetConfirm): Promise<void> {
    await apiClient.call({
      path: "/api/auth/password/reset/confirm",
      method: "post",
      body: payload,
      auth: "none",
      retryUnauthorized: false,
    });
  },

  async listSessions(activeOnly = true): Promise<UserSessionResponse[]> {
    return apiClient.call({
      path: "/api/auth/sessions",
      method: "get",
      query: { active_only: activeOnly },
      auth: "required",
    });
  },

  async getSession(sessionId: string): Promise<UserSessionResponse> {
    return apiClient.call({
      path: "/api/auth/sessions/{session_id}",
      method: "get",
      pathParams: { session_id: sessionId },
      auth: "required",
    });
  },

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.call({
      path: "/api/auth/sessions/{session_id}",
      method: "delete",
      pathParams: { session_id: sessionId },
      auth: "required",
    });

    if (sessionId === authStore.getState().session.sessionId) {
      authStore.clearSession();
    }
  },

  async revokeAllSessions(exceptCurrent = false): Promise<void> {
    await apiClient.call({
      path: "/api/auth/sessions",
      method: "delete",
      query: { except_current: exceptCurrent },
      auth: "required",
    });

    if (!exceptCurrent) {
      authStore.clearSession();
    }
  },
};
