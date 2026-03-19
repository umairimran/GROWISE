import { FC, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiHttpError } from "../api/http";
import { progressService, type ImprovementAnalysis } from "../api/services/progress";
import { Button } from "../components/Button";
import { useTheme } from "../providers/ThemeProvider";

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

const formatLevel = (level: string): string => {
  if (!level) return "—";
  return level.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatScore = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value)}%`;
};

export const ImprovementAnalysis: FC = () => {
  const { pathId } = useParams<{ pathId: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);

  const [data, setData] = useState<ImprovementAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [isBeforeContextExpanded, setIsBeforeContextExpanded] = useState(false);

  const loadAnalysis = useCallback(async () => {
    const id = pathId ? parseInt(pathId, 10) : NaN;
    if (!Number.isInteger(id) || id <= 0) {
      setErrorMessage("Invalid path ID.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await progressService.getImprovementAnalysis(id);
      setData(result);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not load improvement analysis."));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [pathId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const readinessColor = (level: string) => {
    const l = level.toLowerCase();
    if (l === "senior_ready") return "text-emerald-600 dark:text-emerald-400";
    if (l === "mid") return "text-blue-600 dark:text-blue-400";
    return "text-amber-600 dark:text-amber-400";
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/25 mx-auto">
            <TrendingUp className="h-7 w-7 text-white" />
          </div>
          <p className="mt-6 text-gray-500 dark:text-gray-400 font-medium">Loading your progress analysis...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !data) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-6 text-center">
          <p className="text-red-700 dark:text-red-300">{errorMessage || "No data available."}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Complete your learning path and AI evaluation to see your improvement analysis.
          </p>
          <Button className="mt-4" onClick={() => navigate("/course")}>
            Go to Learning Path
          </Button>
        </div>
      </div>
    );
  }

  const hasAfter = Boolean(data.after);
  const hasDialogue = data.dialogues && data.dialogues.length > 0;
  const hasBeforeContext = data.beforeContext && data.beforeContext.length > 0;
  const hasAfterContext = Boolean(data.afterContext);
  const hasDetailedAnalysis = Boolean(data.detailedAnalysis && data.detailedAnalysis.trim().length > 0);
  const report = data.structuredReport;
  const hasStructuredReport = Boolean(report && (report.dashboard_metrics?.length > 0 || report.story_sections?.length > 0));

  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-amber-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const formatMetricValue = (m: { value: number | string; unit: string }) =>
    typeof m.value === "number" ? `${m.value}${m.unit}` : `${m.value} ${m.unit}`.trim();

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2 -ml-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-contrast tracking-tight">
            Your Progress Analysis
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            {data.trackName ? `${data.trackName} · ` : ""}Path #{data.pathId}
          </p>
        </div>
      </div>

      {/* Structured report: AI evaluation banner, summary, Where you stand now, metrics, story */}
      {hasStructuredReport && report && (
        <div className="space-y-6">
          {/* Banner: AI has evaluated you · Track */}
          <div
            className={`rounded-2xl border-2 p-4 flex flex-wrap items-center gap-3 ${
              isDark ? "bg-indigo-950/30 border-indigo-600/50" : "bg-indigo-50/80 border-indigo-300"
            }`}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/20">
              <Sparkles className="h-6 w-6 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-contrast">
                AI has evaluated you
                {(data.trackName || report.track_name) && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold ml-1.5">
                    · {(data.trackName || report.track_name)}
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                This report is for your{" "}
                <strong className="text-contrast">{(data.trackName || report.track_name) || "learning"}</strong>{" "}
                path. It was generated from your initial assessment, the content you followed, and your AI evaluation interview. All scores and insights are from the AI evaluation.
              </p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-400/30">
              {(data.trackName || report.track_name) || "AI-evaluated"}
            </span>
          </div>

          {/* Content you followed (track + stages + content) */}
          {((report.content_followed && report.content_followed.length > 0) ||
            (report.stage_names && report.stage_names.length > 0) ||
            (data.afterContext?.stagesSummary && data.afterContext.stagesSummary.length > 0)) && (
            <div
              className={`rounded-2xl border p-4 ${
                isDark ? "bg-zinc-900/40 border-zinc-700/80" : "bg-gray-50/80 border-gray-200/80"
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Content you followed
                {data.trackName && (
                  <span className="normal-case font-bold text-contrast ml-1.5">· {data.trackName}</span>
                )}
              </h3>
              {report.stage_names && report.stage_names.length > 0 && (
                <p className="text-sm text-contrast mb-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Stages: </span>
                  {report.stage_names.join(" → ")}
                </p>
              )}
              {report.content_followed && report.content_followed.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {report.content_followed.map((title, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-1 rounded-lg ${
                        isDark ? "bg-zinc-800 text-zinc-200" : "bg-white border border-gray-200 text-gray-700"
                      }`}
                    >
                      {title}
                    </span>
                  ))}
                </div>
              )}
              {(!report.content_followed || report.content_followed.length === 0) &&
                data.afterContext?.stagesSummary?.map((s, i) => (
                  <div key={i} className="text-sm text-contrast mt-1">
                    <span className="font-medium">{(s as { stage_name?: string }).stage_name}</span>
                    {(s as { content_titles?: string[] }).content_titles?.length ? (
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        ({(s as { content_titles?: string[] }).content_titles!.length} items)
                      </span>
                    ) : null}
                  </div>
                ))}
            </div>
          )}

          {/* AI evaluation summary – headline + summary + ai_summary */}
          <div
            className={`rounded-2xl border p-6 ${
              isDark ? "bg-gradient-to-br from-blue-950/30 to-indigo-950/20 border-blue-800/40" : "bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-200/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">AI evaluation result</span>
            </div>
            <h2 className="text-xl font-bold text-contrast">{report.headline || "Your AI evaluation"}</h2>
            {report.summary && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{report.summary}</p>
            )}
            {(report.ai_summary && report.ai_summary.trim()) ? (
              <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wider mb-2">
                  AI evaluation summary
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {report.ai_summary}
                </p>
              </div>
            ) : null}
          </div>

          {/* Where you stand now – from AI evaluation */}
          {report.current_standing && report.current_standing.trim() && (
            <div
              className={`rounded-2xl border-2 p-6 ${
                isDark ? "bg-emerald-950/20 border-emerald-800/50" : "bg-emerald-50/80 border-emerald-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 uppercase tracking-wider">
                  Where you stand now
                </h3>
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10">From AI evaluation</span>
              </div>
              <div
                className={`prose prose-sm max-w-none ${
                  isDark ? "prose-invert text-gray-200" : "text-gray-800"
                }`}
              >
                <ReactMarkdown>{report.current_standing}</ReactMarkdown>
              </div>
            </div>
          )}

          {report.dashboard_metrics && report.dashboard_metrics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Enhanced metrics (from AI evaluation & assessment)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {report.dashboard_metrics.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-4 flex flex-col ${
                      isDark ? "bg-zinc-900/60 border-zinc-700/80" : "bg-white border-gray-200/80"
                    }`}
                    title={m.subtitle || undefined}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{m.label}</span>
                      {trendIcon(m.trend)}
                    </div>
                    <div className="mt-1 text-xl font-bold text-contrast">{formatMetricValue(m)}</div>
                    {m.subtitle && (
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2" title={m.subtitle}>
                        {m.subtitle}
                      </div>
                    )}
                    {m.before_value != null && m.after_value != null && (
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {m.before_value} → {m.after_value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI-based charts from DB data */}
          {report.chart_data && (report.chart_data.score_progression?.length || report.chart_data.time_spent_by_stage?.length || report.chart_data.dimension_scores?.length || report.chart_data.activity_timeline?.length) && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Progress dashboard — AI evaluation scores & your data
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {report.chart_data.score_progression && report.chart_data.score_progression.length > 0 && (
                  <div
                    className={`rounded-2xl border p-5 ${
                      isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                    }`}
                  >
                    <h4 className="font-semibold text-contrast mb-4">Score progression (assessment → AI evaluation)</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={[...report.chart_data.score_progression].sort((a, b) => a.order - b.order)}
                        margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className={isDark ? "opacity-30" : "opacity-50"} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={48} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#27272a" : "#fff",
                            border: isDark ? "1px solid #3f3f46" : "1px solid #e4e4e7",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [`${value}%`, "Score"]}
                          labelFormatter={(label) => label}
                        />
                        <Bar dataKey="value" name="Score" radius={[4, 4, 0, 0]} fill="#6366f1">
                          {[...report.chart_data.score_progression].sort((a, b) => a.order - b.order).map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#94a3b8" : "#6366f1"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {report.chart_data.time_spent_by_stage && report.chart_data.time_spent_by_stage.length > 0 && (
                  <div
                    className={`rounded-2xl border p-5 ${
                      isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                    }`}
                  >
                    <h4 className="font-semibold text-contrast mb-4">Time spent by stage (min)</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={report.chart_data.time_spent_by_stage.map((s) => ({
                          name: s.stage_name.length > 18 ? s.stage_name.slice(0, 18) + "…" : s.stage_name,
                          minutes: s.minutes,
                          fullName: s.stage_name,
                        }))}
                        layout="vertical"
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className={isDark ? "opacity-30" : "opacity-50"} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#27272a" : "#fff",
                            border: isDark ? "1px solid #3f3f46" : "1px solid #e4e4e7",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [value, "Minutes"]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                        />
                        <Bar dataKey="minutes" name="Minutes" radius={[0, 4, 4, 0]} fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {report.chart_data.dimension_scores && report.chart_data.dimension_scores.length > 0 && (
                  <div
                    className={`rounded-2xl border p-5 ${
                      isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                    }`}
                  >
                    <h4 className="font-semibold text-contrast mb-4">Assessment dimensions (before AI evaluation)</h4>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={report.chart_data.dimension_scores}
                        margin={{ top: 8, right: 8, left: 8, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className={isDark ? "opacity-30" : "opacity-50"} />
                        <XAxis dataKey="dimension" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={56} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#27272a" : "#fff",
                            border: isDark ? "1px solid #3f3f46" : "1px solid #e4e4e7",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [`${value}%`, "Score"]}
                        />
                        <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {report.chart_data.activity_timeline && report.chart_data.activity_timeline.length > 0 && (
                  <div
                    className={`rounded-2xl border p-5 ${
                      isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                    }`}
                  >
                    <h4 className="font-semibold text-contrast mb-4">Activity timeline (assessment → path → AI evaluation)</h4>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {report.chart_data.activity_timeline.map((a, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
                            isDark ? "bg-zinc-800/60" : "bg-gray-50"
                          }`}
                        >
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                            {new Date(a.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className={`text-xs font-medium ${
                            a.event_type === "assessment" ? "text-blue-600 dark:text-blue-400" :
                            a.event_type === "evaluation" ? "text-emerald-600 dark:text-emerald-400" :
                            "text-gray-700 dark:text-gray-300"
                          }`}>
                            {a.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {report.story_sections && report.story_sections.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                Your progress story
                {data.trackName && (
                  <span className="normal-case font-bold text-contrast ml-1.5">· {data.trackName}</span>
                )}
              </h3>
              <div className="relative space-y-0">
                {report.story_sections.map((section, idx) => (
                  <div key={section.id} className="flex gap-4">
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          section.type === "before"
                            ? "bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200"
                            : section.type === "conclusion"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {section.step_number}
                      </div>
                      {idx < report.story_sections!.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 min-h-[24px] mt-1 ${
                            isDark ? "bg-zinc-700" : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>
                    <div
                      className={`flex-1 rounded-xl border p-4 pb-6 ${
                        isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                      }`}
                    >
                      <h4 className="font-semibold text-contrast">{section.title}</h4>
                      <div
                        className={`mt-2 prose prose-sm max-w-none ${
                          isDark ? "prose-invert text-gray-300" : "text-gray-700"
                        }`}
                      >
                        <ReactMarkdown>{section.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(report.before_summary?.strengths?.length || report.before_summary?.gaps?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={`rounded-2xl border p-5 ${
                  isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                }`}
              >
                <h4 className="font-semibold text-contrast mb-2">Before AI evaluation: strengths & gaps</h4>
                {report.before_summary.strengths?.length ? (
                  <ul className="text-sm text-emerald-700 dark:text-emerald-300 space-y-1">
                    {report.before_summary.strengths.map((s, i) => (
                      <li key={i}>+ {s}</li>
                    ))}
                  </ul>
                ) : null}
                {report.before_summary.gaps?.length ? (
                  <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 mt-2">
                    {report.before_summary.gaps.map((g, i) => (
                      <li key={i}>− {g}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div
                className={`rounded-2xl border p-5 ${
                  isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
                }`}
              >
                <h4 className="font-semibold text-contrast mb-2">After AI evaluation: improvements & focus</h4>
                {report.after_summary?.improvements?.length ? (
                  <ul className="text-sm text-emerald-700 dark:text-emerald-300 space-y-1">
                    {report.after_summary.improvements.map((s, i) => (
                      <li key={i}>+ {s}</li>
                    ))}
                  </ul>
                ) : null}
                {report.after_summary?.sustained_gaps?.length ? (
                  <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 mt-2">
                    {report.after_summary.sustained_gaps.map((g, i) => (
                      <li key={i}>− {g}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Before vs After - Main comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BEFORE */}
        <div
          className={`rounded-2xl border p-6 ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
              <span className="text-lg font-bold text-gray-600 dark:text-gray-300">1</span>
            </div>
            <h2 className="font-semibold text-contrast">Where You Started</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            {data.trackName ? `${data.trackName} · ` : ""}Initial assessment
          </p>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Overall score</div>
              <div className="text-2xl font-bold text-contrast">{formatScore(data.before.score)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Detected level</div>
              <div className="font-semibold text-contrast">{formatLevel(data.before.level)}</div>
            </div>
            {hasBeforeContext && (
              <div className="pt-2 border-t border-gray-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setIsBeforeContextExpanded(!isBeforeContextExpanded)}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {isBeforeContextExpanded ? "Hide" : "Show"} initial assessment Q&A ({data.beforeContext!.length})
                </button>
                {isBeforeContextExpanded && (
                  <div className="mt-3 space-y-3 max-h-[320px] overflow-y-auto pr-1">
                    {data.beforeContext!.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl p-3 text-sm ${
                          isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
                        }`}
                      >
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                          {item.dimension || "General"}
                          {item.score != null && (
                            <span className="ml-2">Score: {(item.score * 100).toFixed(0)}%</span>
                          )}
                        </div>
                        <p className="font-medium text-contrast mb-1">{item.questionText}</p>
                        <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{item.userAnswer}</p>
                        {item.aiExplanation && (
                          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">{item.aiExplanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Arrow / Improvement */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <ArrowRight className="h-6 w-6 text-white" />
            </div>
            {data.improvementPercentage != null && hasAfter && (
              <div className="text-center">
                <div
                  className={`text-lg font-bold ${
                    data.improvementPercentage >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {data.improvementPercentage >= 0 ? "+" : ""}
                  {data.improvementPercentage.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {data.improvementPercentage >= 0 ? "Change" : "Change"}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 max-w-[80px] mx-auto">
                  Assessment vs evaluation avg
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AFTER */}
        <div
          className={`rounded-2xl border p-6 ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-lg font-bold text-white">2</span>
            </div>
            <h2 className="font-semibold text-contrast">Where You Are Now</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            {data.trackName ? `${data.trackName} · AI evaluation` : "AI Interview Evaluation"}
          </p>
          {hasAfter && data.after ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Reasoning{data.trackName ? ` (${data.trackName})` : ""}
                  </div>
                  <div className="text-xl font-bold text-contrast">{formatScore(data.after.reasoningScore)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Problem solving{data.trackName ? ` (${data.trackName})` : ""}
                  </div>
                  <div className="text-xl font-bold text-contrast">{formatScore(data.after.problemSolving)}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Readiness Level</div>
                <div className={`font-bold uppercase ${readinessColor(data.after.readinessLevel)}`}>
                  {formatLevel(data.after.readinessLevel)}
                </div>
              </div>
              {hasAfterContext && data.afterContext && (
                <div className={`pt-2 border-t ${isDark ? "border-zinc-700" : "border-gray-200"}`}>
                  {data.afterContext.stagesSummary && data.afterContext.stagesSummary.length > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stages completed</div>
                  )}
                  <ul className="text-sm text-contrast space-y-0.5">
                    {data.afterContext.stagesSummary?.slice(0, 5).map((s, i) => (
                      <li key={i}>
                        · {(s as { stage_name?: string }).stage_name || ""}
                        {(s as { content_titles?: string[] }).content_titles?.length
                          ? ` (${(s as { content_titles?: string[] }).content_titles!.length} items)`
                          : ""}
                      </li>
                    ))}
                  </ul>
                  {data.afterContext.learningSummary && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-3">
                      {data.afterContext.learningSummary}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Complete an AI evaluation interview to see your progress.
            </p>
          )}
        </div>
      </div>

      {/* Summary */}
      {data.improvementSummary && (
        <div
          className={`rounded-2xl border p-5 ${
            isDark ? "bg-emerald-950/30 border-emerald-800/40" : "bg-emerald-50 border-emerald-200/80"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300">Summary</h3>
          </div>
          <p className="text-emerald-800 dark:text-emerald-200 text-sm leading-relaxed">
            {data.improvementSummary}
          </p>
        </div>
      )}

      {/* Detailed Progress Analysis (before vs after, AI-generated) */}
      {hasDetailedAnalysis && (
        <div
          className={`rounded-2xl border p-6 ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <h3 className="font-semibold text-contrast mb-3">Detailed Progress Analysis</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Before the platform (initial assessment) → After completing the path and AI evaluation. Context-rich comparison from your stored data.
          </p>
          <div
            className={`prose prose-sm max-w-none ${
              isDark ? "prose-invert text-gray-300" : "text-gray-700"
            }`}
          >
            <ReactMarkdown>{data.detailedAnalysis!}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Evaluation feedback (short summary from the AI interviewer) */}
      {data.finalFeedback && !hasDetailedAnalysis && (
        <div
          className={`rounded-2xl border p-6 ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <h3 className="font-semibold text-contrast mb-3">AI evaluation feedback</h3>
          <div
            className={`prose prose-sm max-w-none ${
              isDark ? "prose-invert text-gray-300" : "text-gray-700"
            }`}
          >
            <ReactMarkdown>{data.finalFeedback}</ReactMarkdown>
          </div>
        </div>
      )}
      {data.finalFeedback && hasDetailedAnalysis && (
        <div
          className={`rounded-2xl border p-4 ${
            isDark ? "bg-zinc-900/30 border-zinc-700/60" : "bg-gray-50 border-gray-200/80"
          }`}
        >
          <h3 className="font-semibold text-contrast text-sm mb-2">From your AI evaluation interview</h3>
          <div
            className={`prose prose-sm max-w-none text-sm ${
              isDark ? "prose-invert text-gray-400" : "text-gray-600"
            }`}
          >
            <ReactMarkdown>{data.finalFeedback}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Full Chat Transcript */}
      {hasDialogue && (
        <div
          className={`rounded-2xl border overflow-hidden ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className={`w-full px-6 py-4 flex items-center justify-between ${
              isDark ? "bg-zinc-900/80 hover:bg-zinc-800/80" : "bg-gray-50 hover:bg-gray-100"
            } transition-colors`}
          >
            <span className="flex items-center gap-2 font-semibold text-contrast">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              Full Interview Transcript
            </span>
            {isChatExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>
          {isChatExpanded && (
            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              {data.dialogues!.map((d) => {
                const isUser = d.speaker.toLowerCase() === "user";
                return (
                  <div key={d.sequenceNo} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                        isUser
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
                          : isDark
                            ? "bg-zinc-700 text-zinc-300"
                            : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        isUser
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
                          : isDark
                            ? "bg-zinc-800/80 border border-zinc-700/60 text-zinc-100"
                            : "bg-gray-100 border border-gray-200/80 text-gray-900"
                      }`}
                    >
                      <div
                        className={`text-[11px] font-medium uppercase tracking-wider mb-1.5 ${
                          isUser ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {isUser ? "You" : "AI Interviewer"}
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{d.messageText}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate("/course")}>
          Back to Learning Path
        </Button>
        <Button onClick={() => navigate("/validator")}>
          Start New Evaluation
        </Button>
      </div>
    </div>
  );
};
