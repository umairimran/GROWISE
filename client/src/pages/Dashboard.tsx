import { FC, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";
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
  FileText,
  GitCompareArrows,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
  Compass,
} from "lucide-react";
import { ApiHttpError } from "../api/http";
import { learningService } from "../api/services/learning";
import { assessmentService } from "../api/services/assessment";
import {
  progressService,
  type PathCompletionReport,
  type ProgressAssessmentComparison,
  type ProgressAssessmentHistory,
  type ProgressAssessmentHistoryItem,
  type ProgressDashboardSummary,
  type ProgressTimelineAnalytics,
} from "../api/services/progress";
import { Button } from "../components/Button";
import { WorkspaceFrame, Panel, InlineNotice, HeroBadge } from "../components/workspace";
import { useTheme } from "../providers/ThemeProvider";
import { AssessmentResult, User } from "../types";

interface DashboardProps {
  user: User | null;
  result: AssessmentResult | null;
  onOpenLearningPath: (pathId?: number | null, topic?: string | null) => void;
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
  const navigationContext = useContext(UNSAFE_NavigationContext as any);
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
  const [pathReport, setPathReport] = useState<PathCompletionReport | null>(null);
  const [pathReportPathId, setPathReportPathId] = useState<number | null>(null);
  const [fetchedLatestResult, setFetchedLatestResult] = useState<AssessmentResult | null>(null);
  const [selectedViewSessionId, setSelectedViewSessionId] = useState<number | null>(null);
  const [dashboardTab, setDashboardTab] = useState<"overview" | "assessments" | "insights">("overview");
  const [viewSessionResult, setViewSessionResult] = useState<AssessmentResult | null>(null);
  const [isLoadingViewResult, setIsLoadingViewResult] = useState(false);
  const hasLoadedRef = useRef(false);

  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);
  const navigator = navigationContext?.navigator;
  const goTo = useCallback(
    (to: string) => {
      if (navigator?.push) {
        navigator.push(to);
        return;
      }

      window.location.assign(to);
    },
    [navigator],
  );

  const loadPathReport = useCallback(async () => {
    try {
      const paths = await learningService.getMyPaths();
      if (paths.length === 0) return;
      const latestPath = paths[0];
      const progress = await progressService.getLearningPathProgress(latestPath.path_id);
      if (
        progress.totalContentItems > 0 &&
        progress.completedItems >= progress.totalContentItems
      ) {
        const report = await progressService.getPathCompletionReport(latestPath.path_id);
        setPathReport(report);
        setPathReportPathId(latestPath.path_id);
      } else {
        setPathReport(null);
        setPathReportPathId(null);
      }
    } catch {
      setPathReport(null);
      setPathReportPathId(null);
    }
  }, []);

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
      await loadPathReport();

      // If no in-memory result (e.g. after refresh), fetch latest session's full result
      // so the Assessment Report (comprehensive report) persists on the Overview screen
      if (!result && history?.history?.length > 0) {
        const sorted = [...history.history].sort(
          (a, b) => timeValue(b.attemptDate) - timeValue(a.attemptDate)
        );
        const latestSessionId = sorted[0]?.sessionId;
        if (latestSessionId) {
          try {
            setSelectedViewSessionId(latestSessionId);
            const apiResult = await assessmentService.getSessionResult(latestSessionId);
            const comprehensiveReport =
              apiResult.comprehensive_report &&
              typeof apiResult.comprehensive_report === "object"
                ? (apiResult.comprehensive_report as AssessmentResult["comprehensiveReport"])
                : null;
            const latestResult: AssessmentResult = {
              topic: sorted[0]?.trackName ?? "Assessment",
              score: Number(apiResult.overall_score) ?? 0,
              totalQuestions: 0,
              strengths: [],
              weaknesses: [],
              knowledgeGraph: [],
              sessionId: latestSessionId,
              learningPathId: apiResult.learning_path_id ?? null,
              detectedLevel: apiResult.detected_level ?? undefined,
              aiReasoning: apiResult.ai_reasoning ?? undefined,
              comprehensiveReport: comprehensiveReport ?? null,
            };
            setFetchedLatestResult(latestResult);
            setViewSessionResult(latestResult);
          } catch {
            setFetchedLatestResult(null);
            setViewSessionResult(null);
            setSelectedViewSessionId(null);
          }
        } else {
          setFetchedLatestResult(null);
          setViewSessionResult(null);
          setSelectedViewSessionId(null);
        }
      } else if (result) {
        setFetchedLatestResult(null);
        if (result.sessionId) {
          setSelectedViewSessionId(result.sessionId);
          setViewSessionResult(result);
        }
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to load dashboard progress data."));
    } finally {
      hasLoadedRef.current = true;
      if (isInitialLoad) {
        setIsLoading(false);
      }
      setIsRefreshing(false);
    }
  }, [timelineWindowDays, loadPathReport, result]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const timelineChartData = useMemo(() => toTimelineChartData(timelineData), [timelineData]);
  const sortedHistory = useMemo(() => toSortedHistory(assessmentHistory), [assessmentHistory]);
  const displayResult = viewSessionResult ?? result ?? fetchedLatestResult;

  const fetchSessionForView = useCallback(async (sessionId: number) => {
    setSelectedViewSessionId(sessionId);
    setIsLoadingViewResult(true);
    setViewSessionResult(null);
    try {
      const apiResult = await assessmentService.getSessionResult(sessionId);
      const comprehensiveReport =
        apiResult.comprehensive_report &&
        typeof apiResult.comprehensive_report === "object"
          ? (apiResult.comprehensive_report as AssessmentResult["comprehensiveReport"])
          : null;
      const entry = sortedHistory.find((e) => e.sessionId === sessionId);
      setViewSessionResult({
        topic: entry?.trackName ?? "Assessment",
        score: Number(apiResult.overall_score) ?? 0,
        totalQuestions: 0,
        strengths: [],
        weaknesses: [],
        knowledgeGraph: [],
        sessionId,
        learningPathId: apiResult.learning_path_id ?? null,
        detectedLevel: apiResult.detected_level ?? undefined,
        aiReasoning: apiResult.ai_reasoning ?? undefined,
        comprehensiveReport: comprehensiveReport ?? null,
      });
    } catch {
      setViewSessionResult(null);
    } finally {
      setIsLoadingViewResult(false);
    }
  }, [sortedHistory]);

  const welcomeName = user?.name || dashboardData?.user.fullName || "Learner";
  const totalAssessments = dashboardData?.assessments.totalCompleted ?? 0;
  const latestAssessment = dashboardData?.assessments.latestResult;
  const learningCompletion = dashboardData?.learning.completionPercentage ?? 0;
  const learningHours = dashboardData?.learning.totalTimeHours ?? 0;

  const insightMessage = useMemo(() => {
    const r = viewSessionResult ?? result ?? fetchedLatestResult;
    if (r?.aiReasoning) {
      return r.aiReasoning;
    }

    const weaknesses = dashboardData?.skillProfile?.weaknesses ?? [];
    if (weaknesses.length > 0) {
      return `Priority focus: ${weaknesses.slice(0, 2).join(", ")}.`;
    }

    const latestLevel = dashboardData?.assessments.latestResult?.level;
    if (latestLevel) {
      return `Your latest detected level is ${formatLevel(latestLevel)}. Start another assessment to verify improvement.`;
    }

    if (sortedHistory.length > 0) {
      return "Select an assessment from the left to view its full AI report.";
    }

    return "Complete your first assessment to unlock personalized guidance.";
  }, [dashboardData?.assessments.latestResult?.level, dashboardData?.skillProfile?.weaknesses, result?.aiReasoning, fetchedLatestResult?.aiReasoning, viewSessionResult?.aiReasoning, sortedHistory.length]);

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
    <WorkspaceFrame
      label={<HeroBadge text="Overview" />}
      title="Your Dashboard"
      description={`Your learning progress, ${welcomeName}.`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={onStartAssessment} className="gap-2">
            <Compass className="h-4 w-4" />
            Choose Track
          </Button>
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground"
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
      }
    >

      {errorMessage && (
        <InlineNotice tone="error" title="Dashboard error" action={<Button size="sm" variant="ghost" onClick={() => void loadDashboardData()}>Retry</Button>}>
          {errorMessage}
        </InlineNotice>
      )}

      {isLoading ? (
        <Panel className="p-8 text-center">
          <div className="mx-auto h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading dashboard metrics...</p>
        </Panel>
      ) : (
        <>
          <div className="flex border-b border-border mb-4">
            {([
              { key: "overview" as const, label: "Overview" },
              { key: "assessments" as const, label: "Assessments" },
              { key: "insights" as const, label: "Insights" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setDashboardTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                  dashboardTab === tab.key
                    ? "text-violet-400 border-b-2 border-violet-500 bg-violet-500/5"
                    : "text-muted-foreground hover:text-contrast hover:bg-surface/50 border-b-2 border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {dashboardTab === "overview" && (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="app-panel p-4 sm:p-5">
              <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Assessments</div>
              <div className="text-2xl sm:text-3xl font-bold text-contrast">{totalAssessments}</div>
              <div className="text-xs text-muted-foreground mt-2">Completed attempts</div>
            </div>

            <div className="app-panel p-4 sm:p-5">
              <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Latest Score</div>
              <div className="text-2xl sm:text-3xl font-bold text-contrast">{formatScore(latestAssessment?.score)}</div>
              <div className="text-xs text-muted-foreground mt-2">
                {latestAssessment ? `${formatLevel(latestAssessment.level)} • ${formatDate(latestAssessment.date)}` : "No completed assessment yet"}
              </div>
            </div>

            <div className="app-panel p-4 sm:p-5">
              <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Learning Completion</div>
              <div className="text-2xl sm:text-3xl font-bold text-contrast">{formatPercent(learningCompletion)}</div>
              <div className="text-xs text-muted-foreground mt-2">
                {dashboardData?.learning.completedItems ?? 0} / {dashboardData?.learning.totalContentItems ?? 0} items
              </div>
            </div>

            <div className="app-panel p-4 sm:p-5">
              <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Learning Time</div>
              <div className="text-2xl sm:text-3xl font-bold text-contrast">{learningHours.toFixed(1)}h</div>
              <div className="text-xs text-muted-foreground mt-2">Tracked across all paths</div>
            </div>
          </div>

          {/* Row 2: Activity chart + Progress Overview side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-3">
            <div className="app-panel p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-display text-sm font-semibold text-contrast">Your Activity</h2>
                <span className="text-[11px] text-muted-foreground">
                  {timelineData?.totalEvents ?? 0} events · {timelineData?.startDate ? `${formatDate(timelineData.startDate)} - ${formatDate(timelineData.endDate)}` : "—"}
                </span>
              </div>
              {timelineChartData.length > 0 ? (
                <div className="h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0"} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} minTickGap={20} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} width={24} />
                      <Tooltip contentStyle={{ borderRadius: "10px", border: isDark ? "1px solid #333" : "1px solid #e5e7eb", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", backgroundColor: isDark ? "#111111" : "#ffffff", color: isDark ? "#ffffff" : "#111827", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="events" stroke="#3B82F6" strokeWidth={2} fill="#3B82F6" fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Complete your first assessment to start tracking progress.
                </div>
              )}
            </div>

            <div className="app-panel p-4">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Progress Overview</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs"><BarChart3 className="h-3.5 w-3.5" />Evaluation Attempts</span>
                  <span className="font-semibold text-contrast">{dashboardData?.evaluations.totalCompleted ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs"><Clock3 className="h-3.5 w-3.5" />Latest Assessment</span>
                  <span className="font-semibold text-contrast text-xs">{formatDate(latestAssessment?.date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs"><TrendingUp className="h-3.5 w-3.5" />Selected Tracks</span>
                  <span className="font-semibold text-contrast">{dashboardData?.tracks.totalSelected ?? 0}</span>
                </div>
              </div>
              {dashboardData?.skillProfile && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {dashboardData.skillProfile.strengths.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-bold">Strengths</div>
                      <div className="flex flex-wrap gap-1.5">
                        {dashboardData.skillProfile.strengths.slice(0, 3).map((item) => (
                          <span key={item} className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/20 text-green-300 border border-green-900/40">{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {dashboardData.skillProfile.weaknesses.length > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-bold">Focus Areas</div>
                      <div className="flex flex-wrap gap-1.5">
                        {dashboardData.skillProfile.weaknesses.slice(0, 3).map((item) => (
                          <span key={item} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/20 text-red-300 border border-red-900/40">{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Next step CTA */}
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Next Step</div>
                <p className="text-xs text-muted-foreground mb-2">
                  {displayResult?.comprehensiveReport?.weaknesses?.length
                    ? <>Focus on <span className="font-medium text-contrast">{displayResult.comprehensiveReport.weaknesses[0]?.area}</span></>
                    : learningCompletion < 100 && dashboardData?.learning.totalContentItems
                      ? <>{dashboardData.learning.completedItems}/{dashboardData.learning.totalContentItems} items completed</>
                      : totalAssessments > 0
                        ? "Take another assessment"
                        : "Start your first assessment"
                  }
                </p>
                <Button size="sm" onClick={learningCompletion < 100 ? onOpenLearningPath : onStartAssessment} className="w-full">
                  {learningCompletion < 100 ? "Continue Learning" : "Choose Track"}
                </Button>
              </div>
            </div>
          </div>
          </>
          )}

          {dashboardTab === "insights" && (
          <>
          {pathReport && pathReportPathId && (
            <div className="rounded-xl border border-green-900/40 bg-green-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-sm font-medium text-green-100 truncate">Path Completion Report</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => goTo(`/improvement/${pathReportPathId}`)} className="gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Analysis
                </Button>
                <Button size="sm" variant="secondary" onClick={onOpenLearningPath} className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Report
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
              {isLoadingViewResult ? (
                <div className="bg-surface p-6 rounded-2xl border border-border flex flex-col items-center justify-center min-h-[200px]">
                  <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-muted-foreground">Loading AI report...</p>
                </div>
              ) : displayResult?.comprehensiveReport ? (
                <div className="bg-surface p-4 rounded-2xl text-contrast shadow-md border border-border">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-blue-300 shrink-0" />
                      Assessment Report
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {displayResult.topic && <span className="font-medium text-contrast">{displayResult.topic}</span>}
                      {displayResult.sessionId && <span>#{displayResult.sessionId}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed line-clamp-3">
                    {displayResult.comprehensiveReport.executive_summary}
                  </p>
                  {displayResult.comprehensiveReport.overall_assessment && (
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed line-clamp-2">
                      {displayResult.comprehensiveReport.overall_assessment}
                    </p>
                  )}

                  {displayResult.comprehensiveReport.dimension_breakdown?.length ? (
                    <div className="mb-3">
                      <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1.5">Dimensions</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {displayResult.comprehensiveReport.dimension_breakdown.map((d, i) => (
                          <div key={i} className="rounded-md bg-surface border border-border px-2 py-1 text-[11px]">
                            <span className="text-muted-foreground">{d.dimension}</span>
                            <span className="ml-1.5 font-medium text-blue-300">{d.score.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {displayResult.comprehensiveReport.learning_priorities?.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1.5">Learning Priorities</h4>
                      {(() => {
                        const rationales = displayResult.comprehensiveReport.learning_priorities.map((p) => p.rationale);
                        const uniqueRationales = [...new Set(rationales)];
                        const sharedRationale = uniqueRationales.length === 1 ? uniqueRationales[0] : null;
                        return (
                          <>
                            {sharedRationale && <p className="text-muted-foreground text-[10px] mb-1">{sharedRationale}</p>}
                            <div className="flex flex-wrap gap-1.5">
                              {displayResult.comprehensiveReport.learning_priorities.map((p, i) => (
                                <span key={i} className="inline-flex items-baseline gap-1 rounded-md bg-blue-900/20 border border-blue-800/40 px-2 py-1 text-[11px]">
                                  <span className="font-medium text-blue-300">{i + 1}.</span>
                                  <span className="text-muted-foreground">{p.topic}</span>
                                </span>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <Button
                    onClick={() => onOpenLearningPath(displayResult?.learningPathId, displayResult?.topic ?? null)}
                    variant="secondary"
                    size="sm"
                    className="w-full justify-between"
                  >
                    Continue Learning
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Button>
                </div>
              ) : (
                <div className="bg-surface p-4 rounded-2xl text-contrast shadow-md border border-border">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-blue-300 shrink-0" />
                      AI Insight
                    </h3>
                    {displayResult?.topic && displayResult?.sessionId && (
                      <span className="text-[11px] text-muted-foreground">{displayResult.topic} · #{displayResult.sessionId}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{insightMessage}</p>
                  <Button
                    onClick={() => onOpenLearningPath(displayResult?.learningPathId, displayResult?.topic ?? null)}
                    variant="secondary"
                    size="sm"
                    className="w-full justify-between"
                  >
                    Continue Learning
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          </>
          )}

          {dashboardTab === "assessments" && (
            <div className="app-panel p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-sm font-semibold text-contrast">Your Assessments</h2>
                <Button size="sm" variant="secondary" onClick={() => void handleOpenComparison()} disabled={selectedSessionIds.length !== 2} className="gap-1.5">
                  <GitCompareArrows className="h-3.5 w-3.5" /> Compare
                </Button>
              </div>

              {assessmentHistory?.improvement && (
                <div className="mb-3 rounded-lg border border-blue-900/40 bg-blue-950/30 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-blue-300 font-medium">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Improvement: {formatPercent(assessmentHistory.improvement.improvementPercentage, 1)} ({assessmentHistory.improvement.levelProgression})
                  </div>
                </div>
              )}

              {sortedHistory.length > 0 ? (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Select an assessment to see details</p>
                  {sortedHistory.map((entry) => {
                    const isCompareSelected = selectedSessionIds.includes(entry.sessionId);
                    const isViewSelected = selectedViewSessionId === entry.sessionId;
                    return (
                      <div
                        key={entry.sessionId}
                        className={`flex items-start gap-2.5 rounded-xl border p-2.5 transition-all cursor-pointer ${
                          isViewSelected
                            ? "border-blue-500 bg-blue-950/50 ring-1 ring-blue-800"
                            : isCompareSelected
                              ? "border-blue-800 bg-blue-950/30"
                              : "border-border bg-surface/40 hover:border-zinc-600 hover:bg-surface/60"
                        }`}
                        onClick={() => fetchSessionForView(entry.sessionId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fetchSessionForView(entry.sessionId); } }}
                        aria-pressed={isViewSelected}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={isCompareSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSessionSelection(entry.sessionId); }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select session ${entry.sessionId} for comparison`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-xs text-contrast truncate">{entry.trackName || `Track #${entry.trackId ?? "N/A"}`}</span>
                            <span className="text-xs font-semibold text-contrast shrink-0">{formatScore(entry.score)}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            #{entry.sessionId} · {formatDate(entry.attemptDate)} · {formatLevel(entry.detectedLevel)}
                          </div>
                          {entry.aiReasoning && (
                            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{entry.aiReasoning}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-xs text-muted-foreground mb-3">No assessments yet.</p>
                  <Button size="sm" onClick={onStartAssessment}>Start Assessment</Button>
                </div>
              )}

              {/* Skill breakdown tiles */}
              {displayResult?.comprehensiveReport &&
                ((displayResult.comprehensiveReport.strengths?.length ?? 0) > 0 ||
                  (displayResult.comprehensiveReport.weaknesses?.length ?? 0) > 0) && (
                <div className="mt-3 pt-3 border-t border-border">
                  <h3 className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Skill breakdown</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {displayResult.comprehensiveReport.strengths?.map((s, i) => (
                      <div key={`s-${i}`} className="rounded-lg bg-green-900/15 border border-green-800/40 p-2">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-medium text-green-300 text-[11px] truncate">{s.area}</span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-green-800/40 text-green-300 shrink-0">strength</span>
                        </div>
                        <p className="text-muted-foreground text-[10px] line-clamp-2">{s.evidence}</p>
                      </div>
                    ))}
                    {displayResult.comprehensiveReport.weaknesses?.map((w, i) => (
                      <div key={`w-${i}`} className="rounded-lg bg-amber-900/15 border border-amber-800/40 p-2">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-medium text-amber-300 text-[11px] truncate">{w.area}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${w.priority === "high" ? "bg-red-900/50 text-red-300" : w.priority === "medium" ? "bg-amber-900/50 text-amber-300" : "bg-blue-900/50 text-blue-300"}`}>{w.priority}</span>
                        </div>
                        <p className="text-muted-foreground text-[10px] line-clamp-1">{w.evidence}</p>
                        <p className="text-blue-400 text-[10px] line-clamp-1">→ {w.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {isComparisonModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Panel className="w-full max-w-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-xl font-semibold text-contrast">
                  Assessment Comparison
                </h3>
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
                <p className="text-sm text-muted-foreground">Comparing assessment sessions...</p>
              </div>
            ) : comparisonError ? (
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {comparisonError}
              </div>
            ) : comparisonData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Attempt 1</div>
                    <div className="text-sm text-contrast space-y-1">
                      <div>Date: {formatDate(comparisonData.attempt1.date)}</div>
                      <div>Score: {formatScore(comparisonData.attempt1.overallScore)}</div>
                      <div>Level: {formatLevel(comparisonData.attempt1.detectedLevel)}</div>
                      <div>Questions: {comparisonData.attempt1.questionsAnswered}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Attempt 2</div>
                    <div className="text-sm text-contrast space-y-1">
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
          </Panel>
        </div>
      )}
    </WorkspaceFrame>
  );
};
