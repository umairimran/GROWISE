import { authStore } from "../../state/authStore";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8001";

// Shared fetch wrapper for admin endpoints
async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authStore.getState().session.accessToken;
  const existingHeaders = (init.headers as Record<string, string>) ?? {};
  const headers: Record<string, string> = { ...existingHeaders };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Don't set Content-Type for FormData (let browser set boundary)
  if (!(init.body instanceof FormData) && !headers["Content-Type"]) {
    // only set for JSON bodies
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStats {
  total_users: number;
  total_tracks: number;
  active_sessions: number;
  assessments_today: number;
  assessments_total: number;
  evaluations_total: number;
  evaluations_completed: number;
  learning_paths_total: number;
  knowledge_base_entries: number;
  recent_users: RecentUser[];
  track_stats: TrackStat[];
}

export interface RecentUser {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  created_at: string | null;
}

export interface TrackStat {
  track_id: number;
  track_name: string;
  selections: number;
  dimensions: number;
}

export interface SystemHealth {
  status: string;
  database: string;
  ai_provider: string;
  ai_model: string;
  rag_api_url: string;
  rag_reachable: boolean | null;
  use_mock_ai: boolean;
  server_time: string;
}

export interface AIPingResult {
  success: boolean;
  elapsed_ms: number;
  error: string | null;
}

export interface KBEntry {
  kb_id: number;
  track_id: number;
  content: string;
  source: string;
}

export interface KBUploadResponse {
  track_id: number;
  source: string;
  chunks_created: number;
  message: string;
}

export interface AdminAnalytics {
  signups_by_day: { date: string; count: number }[];
  track_popularity: { track: string; selections: number }[];
  assessment_completion_by_track: { track: string; total: number; completed: number }[];
  evaluation_distribution: Record<string, number>;
}

export interface AdminUser {
  user_id: number;
  full_name: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
  active_sessions_count?: number;
  last_login?: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const adminService = {
  // Dashboard stats
  async getStats(): Promise<AdminStats> {
    return adminFetch("/api/admin/stats");
  },

  // System health
  async getHealth(): Promise<SystemHealth> {
    return adminFetch("/api/admin/system-health");
  },

  // AI ping
  async pingAI(): Promise<AIPingResult> {
    return adminFetch("/api/admin/ai-ping", { method: "POST" });
  },

  // Analytics
  async getAnalytics(): Promise<AdminAnalytics> {
    return adminFetch("/api/admin/analytics");
  },

  // Track management (existing endpoints)
  async listTracks(): Promise<Track[]> {
    return adminFetch("/api/tracks/");
  },

  async createTrack(data: { track_name: string; description: string }): Promise<Track> {
    return adminFetch("/api/tracks/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async updateTrack(
    trackId: number,
    data: { track_name: string; description: string }
  ): Promise<Track> {
    return adminFetch(`/api/tracks/${trackId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async deleteTrack(trackId: number): Promise<void> {
    return adminFetch(`/api/tracks/${trackId}`, { method: "DELETE" });
  },

  async regenerateDimensions(trackId: number): Promise<{ message: string }> {
    return adminFetch(`/api/tracks/${trackId}/regenerate-dimensions`, { method: "POST" });
  },

  // Dimensions
  async getDimensions(trackId: number): Promise<Dimension[]> {
    return adminFetch(`/api/tracks/${trackId}/dimensions`);
  },

  async createDimension(
    trackId: number,
    data: { name: string; description: string; weight: number }
  ): Promise<Dimension> {
    return adminFetch(`/api/tracks/${trackId}/dimensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async updateDimension(
    dimensionId: number,
    data: { name: string; description: string; weight: number }
  ): Promise<Dimension> {
    return adminFetch(`/api/tracks/dimensions/${dimensionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async deleteDimension(dimensionId: number): Promise<void> {
    return adminFetch(`/api/tracks/dimensions/${dimensionId}`, { method: "DELETE" });
  },

  // Knowledge base
  async getKnowledgeBase(trackId: number): Promise<KBEntry[]> {
    return adminFetch(`/api/chat/knowledge/track/${trackId}`);
  },

  async addKBEntry(data: {
    track_id: number;
    content: string;
    source: string;
  }): Promise<KBEntry> {
    return adminFetch("/api/chat/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, embedding_vector: "placeholder" }),
    });
  },

  async uploadKBFile(
    trackId: number,
    source: string,
    file: File
  ): Promise<KBUploadResponse> {
    const formData = new FormData();
    formData.append("track_id", String(trackId));
    formData.append("source", source);
    formData.append("file", file);
    return adminFetch("/api/admin/kb/upload-file", { method: "POST", body: formData });
  },

  async deleteKBEntry(kbId: number): Promise<void> {
    return adminFetch(`/api/admin/kb/${kbId}`, { method: "DELETE" });
  },

  // User management
  async listUsers(role?: string): Promise<AdminUser[]> {
    const q = role ? `?role=${role}` : "";
    return adminFetch(`/api/auth/users${q}`);
  },

  async getUser(userId: number): Promise<AdminUser> {
    return adminFetch(`/api/auth/users/${userId}`);
  },

  async updateUserRole(userId: number, role: "user" | "admin"): Promise<{ role: string }> {
    return adminFetch(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
  },

  async forceLogoutUser(userId: number): Promise<void> {
    return adminFetch(`/api/admin/users/${userId}/sessions`, { method: "DELETE" });
  },

  async deleteUser(userId: number): Promise<void> {
    return adminFetch(`/api/auth/users/${userId}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Shared types (mirrored from backend schemas)
// ---------------------------------------------------------------------------

export interface Track {
  track_id: number;
  track_name: string;
  description: string;
}

export interface Dimension {
  dimension_id: number;
  track_id: number;
  code: string;
  name: string;
  description: string;
  weight: number;
}
