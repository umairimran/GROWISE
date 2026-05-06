import { FC, useEffect, useState } from "react";
import {
  Users,
  BookOpen,
  ActivitySquare,
  ClipboardCheck,
  Database,
  TrendingUp,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { adminService, AdminStats, SystemHealth } from "../../api/services/admin";

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
interface StatCardProps {
  title: string;
  value: number | string;
  icon: FC<{ className?: string }>;
  color: string;
  subtitle?: string;
}

const StatCard: FC<StatCardProps> = ({ title, value, icon: Icon, color, subtitle }) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {title}
        </p>
        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
        )}
      </div>
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Health badge
// ---------------------------------------------------------------------------
interface HealthBadgeProps {
  label: string;
  ok: boolean | null;
  detail?: string;
}

const HealthBadge: FC<HealthBadgeProps> = ({ label, ok, detail }) => (
  <div className="flex items-center gap-2 py-2">
    {ok === null ? (
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
    ) : ok ? (
      <Wifi className="w-4 h-4 text-emerald-500" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-500" />
    )}
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
    {detail && <span className="text-xs text-gray-400 ml-auto truncate max-w-[180px]">{detail}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const AdminDashboard: FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([
        adminService.getStats(),
        adminService.getHealth(),
      ]);
      setStats(s);
      setHealth(h);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Overview</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Platform at a glance
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users ?? 0}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Active Tracks"
          value={stats?.total_tracks ?? 0}
          icon={BookOpen}
          color="bg-emerald-500"
        />
        <StatCard
          title="Active Sessions"
          value={stats?.active_sessions ?? 0}
          icon={ActivitySquare}
          color="bg-purple-500"
        />
        <StatCard
          title="Assessments Today"
          value={stats?.assessments_today ?? 0}
          icon={ClipboardCheck}
          color="bg-orange-500"
          subtitle={`${stats?.assessments_total ?? 0} total`}
        />
        <StatCard
          title="Learning Paths"
          value={stats?.learning_paths_total ?? 0}
          icon={TrendingUp}
          color="bg-teal-500"
        />
        <StatCard
          title="Evaluations"
          value={stats?.evaluations_completed ?? 0}
          icon={ClipboardCheck}
          color="bg-indigo-500"
          subtitle={`${stats?.evaluations_total ?? 0} total`}
        />
        <StatCard
          title="KB Entries"
          value={stats?.knowledge_base_entries ?? 0}
          icon={Database}
          color="bg-pink-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            System Health
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <HealthBadge
              label="Database"
              ok={health?.database === "connected"}
              detail={health?.database}
            />
            <HealthBadge
              label={`AI Provider (${health?.ai_provider ?? "—"})`}
              ok={health ? !health.use_mock_ai : null}
              detail={health?.ai_model}
            />
            <HealthBadge
              label="RAG API"
              ok={health?.rag_reachable ?? null}
              detail={health?.rag_api_url || "not configured"}
            />
          </div>
          {health && (
            <p className="mt-3 text-xs text-gray-400">
              Server time: {new Date(health.server_time).toLocaleTimeString()}
              {health.use_mock_ai && (
                <span className="ml-2 text-yellow-500 font-medium">(Mock AI active)</span>
              )}
            </p>
          )}
        </div>

        {/* Track stats */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Tracks
          </h3>
          {(stats?.track_stats ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No tracks yet.</p>
          ) : (
            <div className="space-y-2">
              {stats?.track_stats.map((t) => (
                <div
                  key={t.track_id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                    {t.track_name}
                  </span>
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span>{t.selections} users</span>
                    <span>{t.dimensions} dims</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent users */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Recent Sign-ups
        </h3>
        {(stats?.recent_users ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-left py-2 pr-4">Email</th>
                  <th className="text-left py-2 pr-4">Role</th>
                  <th className="text-left py-2">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {stats?.recent_users.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-4 font-medium text-gray-800 dark:text-gray-200">
                      {u.full_name}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{u.email}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          u.role === "admin"
                            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
