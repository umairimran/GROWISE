import { parseFastApiError, type ApiValidationIssue } from "./errors";
import type { components } from "./generated";
import { authStore } from "../state/authStore";

type TokenResponse = components["schemas"]["Token"];

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AuthMode = "none" | "optional" | "required";
export type QueryParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

export interface AuthSessionUpdate {
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenType?: string | null;
  sessionId?: string | null;
}

export interface AuthSessionManager {
  getAccessToken: () => string | null | undefined;
  getRefreshToken: () => string | null | undefined;
  getTokenType?: () => string | null | undefined;
  setSession: (session: AuthSessionUpdate) => void;
  clearSession?: () => void | Promise<void>;
}

export interface HttpClientOptions {
  baseUrl?: string;
  auth?: AuthSessionManager;
  fetch?: typeof fetch;
  defaultHeaders?: HeadersInit;
}

export interface RequestOptions<TBody = unknown> {
  path: string;
  method?: HttpMethod;
  query?: Record<string, QueryParamValue>;
  body?: TBody;
  headers?: HeadersInit;
  auth?: AuthMode;
  signal?: AbortSignal;
  retryUnauthorized?: boolean;
}

export interface HttpClient {
  request<TResponse, TBody = unknown>(options: RequestOptions<TBody>): Promise<TResponse>;
  get<TResponse>(path: string, options?: Omit<RequestOptions<never>, "path" | "method" | "body">): Promise<TResponse>;
  post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "path" | "method" | "body">,
  ): Promise<TResponse>;
  put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "path" | "method" | "body">,
  ): Promise<TResponse>;
  patch<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, "path" | "method" | "body">,
  ): Promise<TResponse>;
  delete<TResponse>(path: string, options?: Omit<RequestOptions<never>, "path" | "method" | "body">): Promise<TResponse>;
}

export interface ApiRequestOptions<TBody = unknown> {
  path: string;
  method?: HttpMethod;
  query?: Record<string, QueryParamValue>;
  body?: TBody;
  headers?: HeadersInit;
  signal?: AbortSignal;
  auth?: boolean;
  retryOn401?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly method: HttpMethod;
  readonly path: string;
  readonly issues: ApiValidationIssue[];
  readonly responseBody: unknown;

  constructor(params: {
    message: string;
    status: number;
    method: HttpMethod;
    path: string;
    issues?: ApiValidationIssue[];
    responseBody?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.method = params.method;
    this.path = params.path;
    this.issues = params.issues ?? [];
    this.responseBody = params.responseBody;
  }

  get detail(): string {
    return this.message;
  }
}

export class ApiHttpError extends ApiError {
  constructor(params: {
    message: string;
    status: number;
    method: HttpMethod;
    path: string;
    issues?: ApiValidationIssue[];
    responseBody?: unknown;
  }) {
    super(params);
    this.name = "ApiHttpError";
  }
}

const DEFAULT_BASE_URL = "http://localhost:8001";

const getApiBaseUrl = (explicitBaseUrl?: string): string => {
  const viteEnvBaseUrl = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL;
  const baseUrl = explicitBaseUrl ?? viteEnvBaseUrl ?? DEFAULT_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
};

const isBodyAllowed = (method: HttpMethod): boolean => method !== "GET";

const buildQueryString = (query?: Record<string, QueryParamValue>): string => {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, rawValue]) => {
    if (Array.isArray(rawValue)) {
      rawValue
        .filter((value) => value !== null && value !== undefined)
        .forEach((value) => params.append(key, String(value)));
      return;
    }

    if (rawValue === null || rawValue === undefined) {
      return;
    }

    params.append(key, String(rawValue));
  });

  const asString = params.toString();
  return asString ? `?${asString}` : "";
};

const isJsonBody = (body: unknown): body is Record<string, unknown> | unknown[] =>
  typeof body === "object" &&
  body !== null &&
  !(body instanceof FormData) &&
  !(body instanceof URLSearchParams) &&
  !(body instanceof Blob) &&
  !(body instanceof ArrayBuffer);

const readResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  try {
    const text = await response.text();
    return text || undefined;
  } catch {
    return undefined;
  }
};

const buildError = async (response: Response, method: HttpMethod, path: string): Promise<ApiHttpError> => {
  const responseBody = await readResponseBody(response);
  const parsed = parseFastApiError(responseBody, `HTTP ${response.status}`);

  return new ApiHttpError({
    message: parsed.message,
    status: response.status,
    method,
    path,
    issues: parsed.issues,
    responseBody,
  });
};

const applyAuthHeader = (
  headers: Headers,
  authMode: AuthMode,
  authSession?: AuthSessionManager,
  tokenOverride?: string | null,
): void => {
  if (authMode === "none") {
    return;
  }

  const accessToken = tokenOverride ?? authSession?.getAccessToken?.();
  if (!accessToken) {
    return;
  }

  const tokenType = authSession?.getTokenType?.() ?? "Bearer";
  const normalizedType = tokenType.toLowerCase() === "bearer" ? "Bearer" : tokenType;
  headers.set("Authorization", `${normalizedType} ${accessToken}`);
};

const attemptRefresh = async (
  baseUrl: string,
  fetchImpl: typeof fetch,
  authSession?: AuthSessionManager,
): Promise<string | null> => {
  if (!authSession) {
    return null;
  }

  const refreshToken = authSession.getRefreshToken();
  if (!refreshToken) {
    await authSession.clearSession?.();
    return null;
  }

  const refreshResponse = await fetchImpl(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!refreshResponse.ok) {
    await authSession.clearSession?.();
    return null;
  }

  const refreshBody = (await readResponseBody(refreshResponse)) as TokenResponse | undefined;
  if (!refreshBody || typeof refreshBody.access_token !== "string") {
    await authSession.clearSession?.();
    return null;
  }

  authSession.setSession({
    accessToken: refreshBody.access_token,
    refreshToken: refreshBody.refresh_token ?? refreshToken,
    tokenType: refreshBody.token_type ?? "bearer",
    sessionId: refreshBody.session_id ?? null,
  });

  return refreshBody.access_token;
};

const toFetchBody = (body: unknown, headers: Headers): BodyInit | undefined => {
  if (body === undefined) {
    return undefined;
  }

  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (isJsonBody(body) || typeof body === "string" || typeof body === "number" || typeof body === "boolean") {
    if (!headers.has("Content-Type") && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return JSON.stringify(body);
  }

  return body as BodyInit;
};

export const createHttpClient = (options: HttpClientOptions = {}): HttpClient => {
  const baseUrl = getApiBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const defaultHeaders = new Headers(options.defaultHeaders);

  const request = async <TResponse, TBody = unknown>(requestOptions: RequestOptions<TBody>): Promise<TResponse> => {
    const method = requestOptions.method ?? "GET";
    const authMode = requestOptions.auth ?? "optional";
    const shouldRetryUnauthorized = requestOptions.retryUnauthorized ?? true;
    const requestPath = requestOptions.path.startsWith("/") ? requestOptions.path : `/${requestOptions.path}`;
    const requestUrl = `${baseUrl}${requestPath}${buildQueryString(requestOptions.query)}`;

    const send = async (accessTokenOverride?: string | null): Promise<Response> => {
      const headers = new Headers(defaultHeaders);

      if (requestOptions.headers) {
        new Headers(requestOptions.headers).forEach((value, key) => headers.set(key, value));
      }

      applyAuthHeader(headers, authMode, options.auth, accessTokenOverride);

      if (authMode === "required" && !headers.has("Authorization")) {
        throw new ApiHttpError({
          message: "Authentication required.",
          status: 401,
          method,
          path: requestPath,
        });
      }

      const body = isBodyAllowed(method) ? toFetchBody(requestOptions.body, headers) : undefined;

      return fetchImpl(requestUrl, {
        method,
        headers,
        body,
        signal: requestOptions.signal,
      });
    };

    let response = await send();

    const canRetryWithRefresh =
      response.status === 401 &&
      shouldRetryUnauthorized &&
      authMode !== "none" &&
      requestPath !== "/api/auth/refresh";

    if (canRetryWithRefresh) {
      const newAccessToken = await attemptRefresh(baseUrl, fetchImpl, options.auth);
      if (newAccessToken) {
        response = await send(newAccessToken);
      }
    }

    if (!response.ok) {
      throw await buildError(response, method, requestPath);
    }

    const payload = await readResponseBody(response);
    return payload as TResponse;
  };

  return {
    request,
    get: (path, requestOptions) =>
      request({
        ...requestOptions,
        method: "GET",
        path,
      }),
    post: (path, body, requestOptions) =>
      request({
        ...requestOptions,
        method: "POST",
        path,
        body,
      }),
    put: (path, body, requestOptions) =>
      request({
        ...requestOptions,
        method: "PUT",
        path,
        body,
      }),
    patch: (path, body, requestOptions) =>
      request({
        ...requestOptions,
        method: "PATCH",
        path,
        body,
      }),
    delete: (path, requestOptions) =>
      request({
        ...requestOptions,
        method: "DELETE",
        path,
      }),
  };
};

const authSessionManager: AuthSessionManager = {
  getAccessToken: () => authStore.getState().session.accessToken,
  getRefreshToken: () => authStore.getState().session.refreshToken,
  getTokenType: () => authStore.getState().session.tokenType,
  setSession: (sessionUpdate) => {
    const nextSessionUpdate: Partial<ReturnType<typeof authStore.getState>["session"]> = {};

    if (sessionUpdate.accessToken !== undefined) {
      nextSessionUpdate.accessToken = sessionUpdate.accessToken;
    }
    if (sessionUpdate.refreshToken !== undefined) {
      nextSessionUpdate.refreshToken = sessionUpdate.refreshToken;
    }
    if (sessionUpdate.sessionId !== undefined) {
      nextSessionUpdate.sessionId = sessionUpdate.sessionId;
    }
    if (sessionUpdate.tokenType !== undefined && sessionUpdate.tokenType !== null) {
      nextSessionUpdate.tokenType = sessionUpdate.tokenType;
    }

    authStore.setSession(nextSessionUpdate);
  },
  clearSession: () => authStore.clearSession(),
};

const defaultHttpClient = createHttpClient({
  auth: authSessionManager,
});

export const apiRequest = <TResponse, TBody = unknown>(options: ApiRequestOptions<TBody>): Promise<TResponse> =>
  defaultHttpClient.request<TResponse, TBody>({
    path: options.path,
    method: options.method,
    query: options.query,
    body: options.body,
    headers: options.headers,
    signal: options.signal,
    auth: options.auth === false ? "none" : "required",
    retryUnauthorized: options.retryOn401 ?? true,
  });
