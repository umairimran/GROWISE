import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  GitCompareArrows,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { ApiHttpError } from "../api/http";
import {
  progressService,
  type ProgressAssessmentComparison,
  type ProgressAssessmentHistory,
  type ProgressAssessmentHistoryItem,
  type ProgressDashboardSummary,
  type ProgressTimelineAnalytics,
} from "../api/services/progress";
import { Button } from "../components/Button";
import { useTheme } from "../providers/ThemeProvider";
import { AssessmentResult, User } from "../types";

interface DashboardProps {
  user: User | null;
  result: AssessmentResult | null;
  onOpenLearningPath: () => void;
  onStartAssessment: () => void;
}

interface TimelinePoint {
  date: string;
  label: string;
  events: number;
  contentProgress: number;
  assessments: number;
  evaluations: number;
}

const TIMELINE_WINDOWS = [7, 30, 90] as const;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const formatDate = (dateValue: string | null | undefined): string => {
  if (!dateValue) {
    return "N/A";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatPercent = (value: number | null | undefined, digits = 0): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0%";
  }

  return `${value.toFixed(digits)}%`;
};

const formatLevel = (value: string | null | undefined): string => {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatScore = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
};

const timeValue = (dateValue: string | null | undefined): number => {
  if (!dateValue) {
    return 0;
  }

  const parsed = Date.parse(dateValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTimelineChartData = (timeline: ProgressTimelineAnalytics | null): TimelinePoint[] => {
  if (!timeline || timeline.timeline.length === 0) {
    return [];
  }

  const buckets = new Map<string, TimelinePoint>();

  timeline.timeline.forEach((event) => {
    if (!event.date) {
      return;
    }

    const parsedDate = new Date(event.date);
    if (Number.isNaN(parsedDate.getTime())) {
      return;
    }

    const key = parsedDate.toISOString().slice(0, 10);
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        date: key,
        label: parsedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        events: 1,
        contentProgress: event.type === "content_progress" ? 1 : 0,
        assessments: event.type === "assessment" ? 1 : 0,
        evaluations: event.type === "evaluation" ? 1 : 0,
      });
      return;
    }

    existing.events += 1;
    if (event.type === "content_progress") {
      existing.contentProgress += 1;
    } else if (event.type === "assessment") {
      existing.assessments += 1;
    } else if (event.type === "evaluation") {
      existing.evaluations += 1;
    }
  });

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const toSortedHistory = (history: ProgressAssessmentHistory | null): ProgressAssessmentHistoryItem[] => {
  if (!history) {
    return [];
  }

  return [...history.history].sort((a, b) => timeValue(b.attemptDate) - timeValue(a.attemptDate));
};

export const Dashboard: FC<DashboardProps> = ({
  user,
  result,
  onOpenLearningPath,
  onStartAssessment,
}) => {
  const { theme } = useTheme();
  const [timelineWindowDays, setTimelineWindowDays] = useState<number>(30);
  const [dashboardData, setDashboardData] = useState<ProgressDashboardSummary | null>(null);
  const [timelineData, setTimelineData] = useState<ProgressTimelineAnalytics | null>(null);
  const [assessmentHistory, setAssessmentHistory] = useState<ProgressAssessmentHistory | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [comparisonData, setComparisonData] = useState<ProgressAssessmentComparison | null>(null);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);

  const loadDashboardData = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const [dashboard, timeline, history] = await Promise.all([
        progressService.getDashboard(),
        progressService.getTimeline(timelineWindowDays),
        progressService.getAssessmentHistory(),
      ]);

      setDashboardData(dashboard);
      setTimelineData(timeline);
      setAssessmentHistory(history);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to load dashboard progress data."));
    } finally {
      hasLoadedRef.current = true;
      if (isInitialLoad) {
        setIsLoading(false);
      }
      setIsRefreshing(false);
    }
  }, [timelineWindowDays]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const timelineChartData = useMemo(() => toTimelineChartData(timelineData), [timelineData]);
  const sortedHistory = useMemo(() => toSortedHistory(assessmentHistory), [assessmentHistory]);

  const welcomeName = user?.name || dashboardData?.user.fullName || "Learner";
  const totalAssessments = dashboardData?.assessments.totalCompleted ?? 0;
  const latestAssessment = dashboardData?.assessments.latestResult;
  const learningCompletion = dashboardData?.learning.completionPercentage ?? 0;
  const learningHours = dashboardData?.learning.totalTimeHours ?? 0;

  const insightMessage = useMemo(() => {
    if (result?.aiReasoning) {
      return result.aiReasoning;
    }

    const weaknesses = dashboardData?.skillProfile?.weaknesses ?? [];
    if (weaknesses.length > 0) {
      return `Priority focus: ${weaknesses.slice(0, 2).join(", ")}.`;
    }

    const latestLevel = dashboardData?.assessments.latestResult?.level;
    if (latestLevel) {
      return `Your latest detected level is ${formatLevel(latestLevel)}. Start another assessment to verify improvement.`;
    }

    return "Complete your first assessment to unlock personalized guidance.";
  }, [dashboardData?.assessments.latestResult?.level, dashboardData?.skillProfile?.weaknesses, result?.aiReasoning]);

  const toggleSessionSelection = (sessionId: number) => {
    setSelectedSessionIds((currentSelection) => {
      if (currentSelection.includes(sessionId)) {
        return currentSelection.filter((id) => id !== sessionId);
      }

      if (currentSelection.length < 2) {
        return [...currentSelection, sessionId];
      }

      return [currentSelection[1], sessionId];
    });
  };

  const handleOpenComparison = async () => {
    if (selectedSessionIds.length !== 2) {
      return;
    }

    setIsComparisonModalOpen(true);
    setIsComparing(true);
    setComparisonData(null);
    setComparisonError(null);

    try {
      const [sessionId1, sessionId2] = selectedSessionIds;
      const comparison = await progressService.compareAssessments(sessionId1, sessionId2);
      setComparisonData(comparison);
    } catch (error) {
      setComparisonError(toErrorMessage(error, "Failed to compare selected assessments."));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm lg:text-base text-slate-500 dark:text-gray-400 mt-1">
            API-backed progress overview for {welcomeName}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-lg py-2 px-3"
            value={timelineWindowDays}
            onChange={(event) => {
              setTimelineWindowDays(Number(event.target.value));
            }}
          >
            {TIMELINE_WINDOWS.map((windowDays) => (
              <option key={windowDays} value={windowDays}>
                Last {windowDays} days
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void loadDashboardData()} isLoading={isRefreshing}>
            {!isRefreshing && <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{errorMessage}</div>
          <Button size="sm" variant="ghost" onClick={() => void loadDashboardData()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white dark:bg-[#111111] p-8 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft text-center">
          <div className="mx-auto h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading dashboard metrics...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Assessments</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{totalAssessments}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Completed attempts</div>
            </div>

            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Latest Score</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{formatScore(latestAssessment?.score)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {latestAssessment ? `${formatLevel(latestAssessment.level)} • ${formatDate(latestAssessment.date)}` : "No completed assessment yet"}
              </div>
            </div>

            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Learning Completion</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{formatPercent(learningCompletion)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {dashboardData?.learning.completedItems ?? 0} / {dashboardData?.learning.totalContentItems ?? 0} items
              </div>
            </div>

            <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Learning Time</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{learningHours.toFixed(1)}h</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">Tracked across all paths</div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111] p-4 lg:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="font-serif text-lg font-medium text-slate-900 dark:text-white">Activity Timeline</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Source: <code>/api/progress/analytics/timeline</code> ({timelineData?.totalEvents ?? 0} events)
                </p>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {timelineData?.startDate ? `${formatDate(timelineData.startDate)} - ${formatDate(timelineData.endDate)}` : "No activity window"}
              </div>
            </div>

            {timelineChartData.length > 0 ? (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineChartData}>
                    <defs>
                      <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0"}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: isDark ? "#9ca3af" : "#6b7280" }}
                      minTickGap={20}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: isDark ? "#9ca3af" : "#6b7280" }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: isDark ? "1px solid #333" : "1px solid #e5e7eb",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                        backgroundColor: isDark ? "#111111" : "#ffffff",
                        color: isDark ? "#ffffff" : "#111827",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="events"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#activityGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No timeline activity yet. Complete content, assessments, or evaluations to populate this chart.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.8fr,1fr] gap-6">
            <div className="bg-white dark:bg-[#111111] p-4 lg:p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <h2 className="font-serif text-lg font-medium text-slate-900 dark:text-white">Assessment History</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Source: <code>/api/progress/assessments/history</code>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleOpenComparison()}
                  disabled={selectedSessionIds.length !== 2}
                  className="gap-2"
                >
                  <GitCompareArrows className="h-4 w-4" />
                  Compare Selected
                </Button>
              </div>

              {assessmentHistory?.improvement && (
                <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 font-medium">
                    <TrendingUp className="h-4 w-4" />
                    Improvement: {formatPercent(assessmentHistory.improvement.improvementPercentage, 1)} (
                    {assessmentHistory.improvement.levelProgression})
                  </div>
                </div>
              )}

              {sortedHistory.length > 0 ? (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {sortedHistory.map((entry) => {
                    const isSelected = selectedSessionIds.includes(entry.sessionId);
                    return (
                      <label
                        key={entry.sessionId}
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
                            : "border-gray-200 dark:border-zinc-700 bg-gray-50/60 dark:bg-zinc-900/40 hover:bg-gray-50 dark:hover:bg-zinc-900/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={isSelected}
                          onChange={() => toggleSessionSelection(entry.sessionId)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                              {entry.trackName || `Track #${entry.trackId ?? "N/A"}`}
                            </div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              {formatScore(entry.score)}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Session #{entry.sessionId} • {formatDate(entry.attemptDate)} • {formatLevel(entry.detectedLevel)}
                          </div>
                          {entry.aiReasoning && (
                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                              {entry.aiReasoning}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 p-8 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    No completed assessments yet.
                  </p>
                  <Button onClick={onStartAssessment}>Start Assessment</Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="bg-[#1A1A1A] p-6 rounded-2xl text-white shadow-lg border border-gray-800">
                <h3 className="font-serif text-lg font-medium mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-300" />
                  AI Insight
                </h3>
                <p className="text-sm text-gray-300 mb-6 leading-relaxed">{insightMessage}</p>
                <Button
                  onClick={onOpenLearningPath}
                  variant="secondary"
                  className="w-full justify-between bg-white text-slate-900 hover:bg-gray-100 border-none h-11"
                >
                  Continue Learning
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <p className="text-[11px] text-gray-400 mt-3">
                  Opens your latest backend learning path and stage content.
                </p>
              </div>

              <div className="bg-white dark:bg-[#111111] p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-soft">
                <h3 className="font-serif text-sm font-bold mb-4 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Progress Snapshot
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Evaluation Attempts
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {dashboardData?.evaluations.totalCompleted ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      Latest Assessment Date
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatDate(latestAssessment?.date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Selected Tracks
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {dashboardData?.tracks.totalSelected ?? 0}
                    </span>
                  </div>
                </div>

                {dashboardData?.skillProfile && (
                  <div className="mt-5 pt-4 border-t border-gray-200 dark:border-zinc-700 space-y-3">
                    {dashboardData.skillProfile.strengths.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Strengths
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {dashboardData.skillProfile.strengths.slice(0, 3).map((item) => (
                            <span
                              key={item}
                              className="text-[11px] px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-900/40"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {dashboardData.skillProfile.weaknesses.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Focus Areas
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {dashboardData.skillProfile.weaknesses.slice(0, 3).map((item) => (
                            <span
                              key={item}
                              className="text-[11px] px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/40"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {isComparisonModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-serif text-xl font-semibold text-slate-900 dark:text-white">
                  Assessment Comparison
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Source: <code>/api/progress/assessments/compare</code>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsComparisonModalOpen(false);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                aria-label="Close comparison modal"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {isComparing ? (
              <div className="py-16 text-center">
                <div className="mx-auto h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Comparing assessment sessions...</p>
              </div>
            ) : comparisonError ? (
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {comparisonError}
              </div>
            ) : comparisonData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 dark:border-zinc-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Attempt 1</div>
                    <div className="text-sm text-slate-900 dark:text-white space-y-1">
                      <div>Date: {formatDate(comparisonData.attempt1.date)}</div>
                      <div>Score: {formatScore(comparisonData.attempt1.overallScore)}</div>
                      <div>Level: {formatLevel(comparisonData.attempt1.detectedLevel)}</div>
                      <div>Questions: {comparisonData.attempt1.questionsAnswered}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-zinc-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Attempt 2</div>
                    <div className="text-sm text-slate-900 dark:text-white space-y-1">
                      <div>Date: {formatDate(comparisonData.attempt2.date)}</div>
                      <div>Score: {formatScore(comparisonData.attempt2.overallScore)}</div>
                      <div>Level: {formatLevel(comparisonData.attempt2.detectedLevel)}</div>
                      <div>Questions: {comparisonData.attempt2.questionsAnswered}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 p-4">
                  <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">Improvement</div>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <div>Score Change: {formatScore(comparisonData.improvement.scoreChange)}</div>
                    <div>
                      Percentage Improvement: {formatPercent(comparisonData.improvement.percentageImprovement, 1)}
                    </div>
                    <div>Level Change: {comparisonData.improvement.levelChange ?? "N/A"}</div>
                    <div>Time Between Attempts: {comparisonData.improvement.timeBetweenAttempts ?? "N/A"}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
