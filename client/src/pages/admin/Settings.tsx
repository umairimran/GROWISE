import { FC, useEffect, useState } from "react";
import {
  Server,
  Cpu,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { adminService, SystemHealth, AIPingResult } from "../../api/services/admin";

interface InfoRowProps {
  label: string;
  value: string | boolean | null | undefined;
  badge?: boolean;
}

const InfoRow: FC<InfoRowProps> = ({ label, value, badge }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    {badge ? (
      <span
        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          value
            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
        }`}
      >
        {String(value ?? "—")}
      </span>
    ) : (
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {value === null || value === undefined ? "—" : String(value)}
      </span>
    )}
  </div>
);

export const Settings: FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<AIPingResult | null>(null);
  const [pinging, setPinging] = useState(false);

  const loadHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await adminService.getHealth();
      setHealth(h);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load health data");
    } finally {
      setLoading(false);
    }
  };

  const pingAI = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const result = await adminService.pingAI();
      setPingResult(result);
    } catch (e: unknown) {
      setPingResult({ success: false, elapsed_ms: 0, error: (e as Error).message });
    } finally {
      setPinging(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading system settings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <XCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={loadHealth}
          className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            System Settings
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            AI provider, database, and RAG connectivity
          </p>
        </div>
        <button
          onClick={loadHealth}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Database */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Database
          </h3>
        </div>
        <InfoRow label="Status" value={health?.database} />
        <InfoRow
          label="Overall Status"
          value={health?.status === "healthy" ? "Healthy" : "Degraded"}
          badge
        />
      </div>

      {/* AI Provider */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            AI Provider
          </h3>
        </div>
        <InfoRow label="Provider" value={health?.ai_provider?.toUpperCase()} />
        <InfoRow label="Model" value={health?.ai_model} />
        <InfoRow
          label="Mock AI"
          value={health?.use_mock_ai ? "Enabled (real AI off)" : "Disabled (real AI on)"}
        />

        {/* Ping button */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <button
              onClick={pingAI}
              disabled={pinging}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {pinging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {pinging ? "Pinging..." : "Ping AI"}
            </button>

            {pingResult && (
              <div className="flex items-center gap-2">
                {pingResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {pingResult.success
                    ? `Success — ${pingResult.elapsed_ms}ms`
                    : `Failed: ${pingResult.error}`}
                </span>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Fires a real (trivial) AI call to verify the provider is reachable and responding.
          </p>
        </div>
      </div>

      {/* RAG API */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            External RAG API
          </h3>
        </div>
        <InfoRow
          label="URL"
          value={health?.rag_api_url || "Not configured"}
        />
        <InfoRow
          label="Reachable"
          value={
            health?.rag_reachable === null
              ? "Not tested"
              : health?.rag_reachable
              ? "Yes"
              : "No — unreachable"
          }
          badge={health?.rag_reachable !== null}
        />
        <p className="mt-3 text-xs text-gray-400">
          Set <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">RAG_API_URL</code> in{" "}
          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">server/.env</code> to
          configure the external RAG service. Used for mentor chat in
          recognized AI-topic tracks.
        </p>
      </div>

      {/* Server info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Server
          </h3>
        </div>
        <InfoRow
          label="Server Time (UTC)"
          value={
            health?.server_time
              ? new Date(health.server_time).toLocaleString()
              : "—"
          }
        />
      </div>
    </div>
  );
};
