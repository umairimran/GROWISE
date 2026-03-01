import { useSyncExternalStore } from "react";
import type { components } from "../api/generated/openapi";

const AUTH_SESSION_STORAGE_KEY = "growwise.auth.session";

export type AuthTokenPayload = components["schemas"]["Token"];
export type AuthUser = components["schemas"]["UserDetailedResponse"];

export interface AuthSessionState {
  accessToken: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  tokenType: string;
}

export interface AuthState {
  session: AuthSessionState;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
}

const EMPTY_SESSION: AuthSessionState = {
  accessToken: null,
  refreshToken: null,
  sessionId: null,
  tokenType: "bearer",
};

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const sanitizeSession = (value: unknown): AuthSessionState => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_SESSION };
  }

  const raw = value as Partial<AuthSessionState>;

  return {
    accessToken: typeof raw.accessToken === "string" ? raw.accessToken : null,
    refreshToken: typeof raw.refreshToken === "string" ? raw.refreshToken : null,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    tokenType:
      typeof raw.tokenType === "string" && raw.tokenType.trim().length > 0
        ? raw.tokenType.trim().toLowerCase()
        : "bearer",
  };
};

const readSessionFromStorage = (): AuthSessionState => {
  if (!canUseStorage()) {
    return { ...EMPTY_SESSION };
  }

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_SESSION };
    }

    return sanitizeSession(JSON.parse(raw));
  } catch {
    return { ...EMPTY_SESSION };
  }
};

const persistSession = (session: AuthSessionState) => {
  if (!canUseStorage()) {
    return;
  }

  if (!session.accessToken && !session.refreshToken) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
};

const initialSession = readSessionFromStorage();

let state: AuthState = {
  session: initialSession,
  currentUser: null,
  isAuthenticated: Boolean(initialSession.accessToken),
  isBootstrapping: false,
};

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const setState = (partial: Partial<AuthState>) => {
  state = {
    ...state,
    ...partial,
  };
  emit();
};

export const authStore = {
  getState(): AuthState {
    return state;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setSession(sessionUpdate: Partial<AuthSessionState>) {
    const nextSession: AuthSessionState = {
      ...state.session,
      ...sessionUpdate,
      tokenType:
        typeof sessionUpdate.tokenType === "string" && sessionUpdate.tokenType.trim().length > 0
          ? sessionUpdate.tokenType.trim().toLowerCase()
          : state.session.tokenType || "bearer",
    };

    persistSession(nextSession);

    setState({
      session: nextSession,
      isAuthenticated: Boolean(nextSession.accessToken),
      currentUser: nextSession.accessToken ? state.currentUser : null,
    });
  },

  setSessionFromToken(token: AuthTokenPayload) {
    this.setSession({
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? state.session.refreshToken,
      sessionId: token.session_id ?? state.session.sessionId,
      tokenType: token.token_type ?? state.session.tokenType ?? "bearer",
    });
  },

  setCurrentUser(user: AuthUser | null) {
    setState({
      currentUser: user,
      isAuthenticated: Boolean(state.session.accessToken),
    });
  },

  setBootstrapping(isBootstrapping: boolean) {
    setState({ isBootstrapping });
  },

  clearSession() {
    persistSession(EMPTY_SESSION);
    setState({
      session: { ...EMPTY_SESSION },
      currentUser: null,
      isAuthenticated: false,
      isBootstrapping: false,
    });
  },
};

export const useAuthStore = <T,>(selector: (snapshot: AuthState) => T): T =>
  useSyncExternalStore(
    authStore.subscribe,
    () => selector(authStore.getState()),
    () => selector(authStore.getState())
  );

