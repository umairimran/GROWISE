import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../../src/api/http";
import type { components } from "../../src/api/generated";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const authUserFixture: components["schemas"]["UserDetailedResponse"] = {
  email: "demo@growwise.test",
  full_name: "Demo User",
  user_id: 1,
  role: "user",
  created_at: "2026-01-01T00:00:00Z",
  active_sessions_count: 1,
};

describe("Phase 1 HTTP smoke tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /health successfully", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ status: "healthy" }));
    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
    });

    const payload = await client.get<{ status: string }>("/health", { auth: "none" });

    expect(payload.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/health",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("injects bearer token on a protected endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(authUserFixture));
    const session = {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      tokenType: "bearer",
      sessionId: "session-1",
    };

    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
      auth: {
        getAccessToken: () => session.accessToken,
        getRefreshToken: () => session.refreshToken,
        getTokenType: () => session.tokenType,
        setSession: (next) => {
          session.accessToken = next.accessToken ?? session.accessToken;
          session.refreshToken = next.refreshToken ?? session.refreshToken;
          session.tokenType = next.tokenType ?? session.tokenType;
          session.sessionId = next.sessionId ?? session.sessionId;
        },
      },
    });

    await client.get<components["schemas"]["UserDetailedResponse"]>("/api/auth/me", { auth: "required" });

    const firstCall = fetchMock.mock.calls[0];
    const headers = new Headers(firstCall[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token-1");
  });

  it("retries once after 401 by refreshing the token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ detail: "Token expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-token-2",
          refresh_token: "refresh-token-2",
          token_type: "bearer",
          session_id: "session-2",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authUserFixture));

    const session = {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      tokenType: "bearer",
      sessionId: "session-1",
    };

    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
      auth: {
        getAccessToken: () => session.accessToken,
        getRefreshToken: () => session.refreshToken,
        getTokenType: () => session.tokenType,
        setSession: (next) => {
          session.accessToken = next.accessToken ?? session.accessToken;
          session.refreshToken = next.refreshToken ?? session.refreshToken;
          session.tokenType = next.tokenType ?? session.tokenType;
          session.sessionId = next.sessionId ?? session.sessionId;
        },
        clearSession: vi.fn(),
      },
    });

    const user = await client.get<components["schemas"]["UserDetailedResponse"]>("/api/auth/me", { auth: "required" });

    expect(user.user_id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:8000/api/auth/refresh");
    expect(session.accessToken).toBe("access-token-2");
    expect(session.refreshToken).toBe("refresh-token-2");

    const retryHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer access-token-2");
  });
});
