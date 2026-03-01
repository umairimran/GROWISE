import { describe, expect, it, vi } from "vitest";
import { ApiHttpError, createHttpClient } from "../../api/http";

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

describe("http error handling determinism", () => {
  it.each([
    { status: 400, detail: "Bad request payload" },
    { status: 401, detail: "Invalid credentials" },
    { status: 403, detail: "Forbidden action" },
    { status: 404, detail: "Resource not found" },
  ])("returns deterministic detail messages for HTTP $status", async ({ status, detail }) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ detail }, status));
    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
    });

    await expect(client.get("/api/protected/resource", { auth: "none" })).rejects.toMatchObject({
      name: "ApiHttpError",
      status,
      message: detail,
      path: "/api/protected/resource",
      method: "GET",
    });
  });

  it("returns structured validation issues for 422 FastAPI responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          detail: [
            {
              loc: ["body", "email"],
              msg: "value is not a valid email address",
              type: "value_error.email",
            },
            {
              loc: ["body", "password"],
              msg: "field required",
              type: "value_error.missing",
            },
          ],
        },
        422,
      ),
    );
    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
    });

    let thrownError: unknown;
    try {
      await client.post("/api/auth/register", { email: "invalid" }, { auth: "none" });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(ApiHttpError);
    const apiError = thrownError as ApiHttpError;
    expect(apiError.status).toBe(422);
    expect(apiError.message).toContain("body.email: value is not a valid email address");
    expect(apiError.message).toContain("body.password: field required");
    expect(apiError.issues).toEqual([
      {
        location: "body.email",
        message: "value is not a valid email address",
        code: "value_error.email",
      },
      {
        location: "body.password",
        message: "field required",
        code: "value_error.missing",
      },
    ]);
  });

  it("fails required-auth requests deterministically when no token is available", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createHttpClient({
      baseUrl: "http://localhost:8000",
      fetch: fetchMock,
      auth: {
        getAccessToken: () => null,
        getRefreshToken: () => null,
        setSession: () => undefined,
      },
    });

    await expect(client.get("/api/auth/me", { auth: "required" })).rejects.toMatchObject({
      name: "ApiHttpError",
      status: 401,
      message: "Authentication required.",
      path: "/api/auth/me",
      method: "GET",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
