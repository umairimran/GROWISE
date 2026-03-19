import { createHttpClient } from "../http";
import { createTypedApiClient } from "../client";
import type { AuthSessionManager } from "../http";
import { authStore } from "../../state/authStore";

const authSessionManager: AuthSessionManager = {
  getAccessToken: () => authStore.getState().session.accessToken,
  getRefreshToken: () => authStore.getState().session.refreshToken,
  getTokenType: () => authStore.getState().session.tokenType,
  setSession: (session) => {
    authStore.setSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenType: session.tokenType ?? undefined,
      sessionId: session.sessionId,
    });
  },
  clearSession: () => {
    authStore.clearSession();
  },
};

export const apiClient = createTypedApiClient({
  auth: authSessionManager,
});

/** Raw HTTP client for API paths not yet in OpenAPI spec (e.g. path completion report) */
export const rawHttpClient = createHttpClient({ auth: authSessionManager });
