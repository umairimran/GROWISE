import { FC, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_LocationContext, UNSAFE_NavigationContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronDown,
  Clock3,
  History,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { parseDecimal } from "../api/adapters/numeric";
import { ApiHttpError } from "../api/http";
import {
  evaluationService,
  type EvaluationDialogueResponse,
  type EvaluationResultResponse,
  type EvaluationSessionResponse,
} from "../api/services/evaluation";
import { learningService } from "../api/services/learning";
import { progressService, type ProgressEvaluationHistory } from "../api/services/progress";
import { Button } from "../components/Button";
import { WorkspaceFrame, Panel, InlineNotice, HeroBadge } from "../components/workspace";

interface LearningPathOption {
  path_id: number;
  track_name?: string;
  status?: string;
}

type SidebarTab = "start" | "result" | "sessions" | "progress";

const MIN_DIALOGUES_TO_COMPLETE = 3;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const formatScore = (value: string | number | null | undefined): string => {
  const parsed = parseDecimal(value);
  if (parsed === null) {
    return "-";
  }

  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return `${Math.round(normalized)}%`;
};

const sortDialogues = (dialogues: EvaluationDialogueResponse[]): EvaluationDialogueResponse[] =>
  [...dialogues].sort((left, right) => left.sequence_no - right.sequence_no);

export const Validator: FC = () => {
  const navigationContext = useContext(UNSAFE_NavigationContext as any);
  const locationContext = useContext(UNSAFE_LocationContext as any);
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
  const search = locationContext?.location?.search ?? window.location.search;

  const queryPathId = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("pathId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [search]);

  const [draftResponse, setDraftResponse] = useState("");

  const [mySessions, setMySessions] = useState<EvaluationSessionResponse[]>([]);
  const [activeSession, setActiveSession] = useState<EvaluationSessionResponse | null>(null);
  const [dialogues, setDialogues] = useState<EvaluationDialogueResponse[]>([]);
  const [result, setResult] = useState<EvaluationResultResponse | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<ProgressEvaluationHistory | null>(null);

  const [learningPaths, setLearningPaths] = useState<LearningPathOption[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(queryPathId);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("start");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dialogues]);

  const loadEvaluationHistory = useCallback(async () => {
    const history = await progressService.getEvaluationHistory();
    setEvaluationHistory(history);
  }, []);

  const loadMySessions = useCallback(async (): Promise<EvaluationSessionResponse[]> => {
    const sessions = await evaluationService.getMySessions();
    setMySessions(sessions);
    return sessions;
  }, []);

  const loadSession = useCallback(
    async (evaluationId: number, sessionHint?: EvaluationSessionResponse) => {
      setStatusMessage("Loading evaluation session...");
      setErrorMessage(null);

      try {
        const [session, sessionDialogues] = await Promise.all([
          sessionHint ? Promise.resolve(sessionHint) : evaluationService.getSession(evaluationId),
          evaluationService.getDialogues(evaluationId),
        ]);

        setActiveSession(session);
        setDialogues(sortDialogues(sessionDialogues));

        if (session.status === "completed") {
          try {
            const sessionResult = await evaluationService.getResult(evaluationId);
            setResult(sessionResult);
          } catch (error) {
            if (error instanceof ApiHttpError && error.status === 404) {
              setResult(null);
            } else {
              throw error;
            }
          }
        } else {
          setResult(null);
        }
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to load evaluation session."));
      } finally {
        setStatusMessage(null);
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setErrorMessage(null);

      try {
        const [sessions, paths] = await Promise.all([
          loadMySessions(),
          learningService.getMyPaths().catch(() => [] as LearningPathOption[]),
        ]);
        await loadEvaluationHistory();

        if (!isMounted) {
          return;
        }

        setLearningPaths(
          paths.map((p: any) => ({
            path_id: p.path_id,
            track_name: p.track_name ?? `Path #${p.path_id}`,
            status: p.status,
          })),
        );

        if (paths.length > 0 && !selectedPathId) {
          setSelectedPathId(paths[0].path_id);
        }

        let initialSession =
          (queryPathId && sessions.find((session) => (session as any).path_id === queryPathId)) || null;

        const inProgressSession = sessions.find((session) => session.status !== "completed");
        if (!initialSession) {
          initialSession = inProgressSession ?? sessions[0] ?? null;
        }

        // If we came from a specific path and there is no session yet, auto-create one.
        if (!initialSession && queryPathId) {
          const created = await evaluationService.createSession(queryPathId);
          const sessionsAfter = await loadMySessions();
          initialSession =
            sessionsAfter.find((s) => s.evaluation_id === created.evaluation_id) ?? created;
        }

        if (initialSession) {
          await loadSession(initialSession.evaluation_id, initialSession);
        } else {
          setActiveSession(null);
          setDialogues([]);
          setResult(null);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(toErrorMessage(error, "Could not load evaluation data."));
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [loadEvaluationHistory, loadMySessions, loadSession, queryPathId]);

  const handleRetryWorkspaceLoad = useCallback(async () => {
    setStatusMessage("Refreshing evaluation workspace...");
    setErrorMessage(null);

    try {
      const sessions = await loadMySessions();
      await loadEvaluationHistory();

      const inProgressSession = sessions.find((session) => session.status !== "completed");
      const initialSession = inProgressSession ?? sessions[0];

      if (initialSession) {
        await loadSession(initialSession.evaluation_id, initialSession);
      } else {
        setActiveSession(null);
        setDialogues([]);
        setResult(null);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not refresh evaluation data."));
    } finally {
      setStatusMessage(null);
    }
  }, [loadEvaluationHistory, loadMySessions, loadSession]);

  const handleCreateSession = async (pathIdOverride?: number) => {
    const pathId = pathIdOverride ?? selectedPathId;

    if (!pathId || !Number.isInteger(pathId) || pathId <= 0) {
      setErrorMessage("Select a learning path to start a new evaluation session.");
      return;
    }

    setIsCreatingSession(true);
    setStatusMessage("Creating evaluation session...");
    setErrorMessage(null);

    try {
      const createdSession = await evaluationService.createSession(pathId);

      const sessions = await loadMySessions();
      const matchingSession =
        sessions.find((session) => session.evaluation_id === createdSession.evaluation_id) ?? createdSession;

      await loadSession(createdSession.evaluation_id, matchingSession);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to create evaluation session."));
    } finally {
      setIsCreatingSession(false);
      setStatusMessage(null);
    }
  };

  const handleSendResponse = async () => {
    if (!activeSession || activeSession.status === "completed") {
      return;
    }

    const message = draftResponse.trim();
    if (!message) {
      return;
    }

    setIsSending(true);
    setStatusMessage("Submitting your response...");
    setErrorMessage(null);

    try {
      await evaluationService.respond(activeSession.evaluation_id, message);
      setDraftResponse("");

      await loadSession(activeSession.evaluation_id, activeSession);
      await loadMySessions();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not submit response."));
    } finally {
      setIsSending(false);
      setStatusMessage(null);
    }
  };

  const handleCompleteEvaluation = async () => {
    if (!activeSession) {
      return;
    }

    setIsCompleting(true);
    setStatusMessage("Completing evaluation...");
    setErrorMessage(null);

    try {
      try {
        const completedResult = await evaluationService.complete(activeSession.evaluation_id);
        setResult(completedResult);
        setSidebarTab("result");
      } catch (error) {
        if (
          error instanceof ApiHttpError &&
          error.status === 400 &&
          error.message.toLowerCase().includes("already completed")
        ) {
          const existingResult = await evaluationService.getResult(activeSession.evaluation_id);
          setResult(existingResult);
          setSidebarTab("result");
        } else {
          throw error;
        }
      }

      const sessions = await loadMySessions();
      const updatedSession = sessions.find(
        (session) => session.evaluation_id === activeSession.evaluation_id,
      );

      await loadSession(activeSession.evaluation_id, updatedSession);
      await loadEvaluationHistory();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not complete evaluation yet."));
    } finally {
      setIsCompleting(false);
      setStatusMessage(null);
    }
  };

  const canRespond = Boolean(activeSession && activeSession.status !== "completed" && !isSending && !isCompleting);
  const dialogueCount = dialogues.length;
  const remainingDialogues = Math.max(0, MIN_DIALOGUES_TO_COMPLETE - dialogueCount);

  const canComplete =
    Boolean(activeSession && activeSession.status !== "completed") &&
    remainingDialogues === 0 &&
    !isSending &&
    !isCompleting;

  const sessionsPreview = useMemo(() => mySessions.slice(0, 6), [mySessions]);
  const historyPreview = useMemo(() => {
    if (!evaluationHistory) {
      return [];
    }

    return [...evaluationHistory.history].reverse().slice(0, 10);
  }, [evaluationHistory]);

  const readinessColor = (level: string) => {
    if (!level) return "text-muted-foreground";
    const l = level.toLowerCase();
    if (l === "senior_ready") return "text-emerald-600 dark:text-emerald-400";
    if (l === "mid") return "text-blue-600 dark:text-blue-400";
    return "text-amber-600 dark:text-amber-400";
  };

  if (isBootstrapping) {
    return (
      <div className="h-[calc(100vh-124px)] flex items-center justify-center">
        <div className="text-center">
          <div className="relative inline-block">
            <div className="h-16 w-16 rounded-2xl bg-violet-500 flex items-center justify-center animate-pulse shadow-xl shadow-violet-500/30">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div className="absolute -inset-2 rounded-3xl bg-violet-500/20 blur-2xl animate-pulse" />
          </div>
          <p className="mt-6 text-contrast font-semibold text-lg">Preparing workspace</p>
          <p className="mt-1 text-sm text-muted-foreground">Loading your evaluation sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 124px)" }}>
      {/* Compact header bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-violet-500/15 text-violet-400 border border-violet-500/25">
            <Zap className="h-2.5 w-2.5" />
            Validator
          </span>
          {activeSession && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              activeSession.status === "completed"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
            }`}>
              {activeSession.status === "completed" ? "Completed" : "In Progress"}
              {activeSession ? ` · #${activeSession.evaluation_id}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {errorMessage && <span className="text-[10px] text-red-400 truncate max-w-[200px]">{errorMessage}</span>}
          {statusMessage && <span className="text-[10px] text-blue-400">{statusMessage}</span>}
          <Button size="sm" variant="outline" onClick={() => void handleRetryWorkspaceLoad()} disabled={Boolean(statusMessage)} className="h-7 text-xs px-2">
            <RefreshCw className={`h-3 w-3 ${statusMessage ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main content: flex row that fills remaining height */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* ── LEFT: Chat area ── */}
        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden">
          {/* Chat header */}
          <div className="shrink-0 px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-contrast">
              <MessageSquare className="h-3.5 w-3.5 text-violet-400" />
              Interview
            </span>
            {activeSession && (
              <span className="text-[10px] text-muted-foreground">
                {dialogueCount} msg{dialogueCount !== 1 ? "s" : ""}
                {activeSession.path_id && ` · Path #${activeSession.path_id}`}
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!activeSession && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Bot className="h-10 w-10 text-violet-400/50 mb-2" />
                <p className="text-sm text-muted-foreground">No active session. Start one from the right panel.</p>
              </div>
            )}
            {activeSession && dialogues.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Sparkles className="h-10 w-10 text-violet-400/50 mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">Session ready. Waiting for first question...</p>
              </div>
            )}
            {dialogues.map((dialogue) => {
              const isUser = dialogue.speaker.toLowerCase() === "user";
              return (
                <div key={dialogue.dialogue_id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-1.5 ${
                    isUser
                      ? "bg-violet-500 text-white"
                      : "bg-surface/80 border border-border text-contrast"
                  }`}>
                    <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isUser ? "text-white [&_*]:text-white" : "text-contrast"}`}>
                      {isUser ? (
                        <p className="whitespace-pre-wrap m-0">{dialogue.message_text}</p>
                      ) : (
                        <ReactMarkdown components={{
                          p: ({ children }) => <p className="m-0 mb-1 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-inherit">{children}</strong>,
                        }}>
                          {dialogue.message_text}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border p-3 bg-card/95">
            <textarea
              id="validator-reply"
              value={draftResponse}
              onChange={(e) => setDraftResponse(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canRespond) void handleSendResponse(); } }}
              placeholder={activeSession ? (activeSession.status === "completed" ? "Evaluation completed. Start a new session." : "Type your response...") : "Start a session first"}
              disabled={!canRespond}
              rows={2}
              className="w-full p-2.5 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50 bg-surface border border-border text-contrast placeholder-muted"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="text-[10px] text-muted-foreground">
                {activeSession && activeSession.status !== "completed" ? (
                  remainingDialogues > 0
                    ? <span>{remainingDialogues} more before completion</span>
                    : <span className="text-emerald-400 font-semibold">Ready to complete</span>
                ) : activeSession?.status === "completed" ? <span>Completed</span> : null}
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setDraftResponse("")} disabled={!draftResponse} className="h-7 text-xs px-2">Clear</Button>
                <Button size="sm" onClick={handleSendResponse} disabled={!canRespond || !draftResponse.trim()} isLoading={isSending} className="h-7 text-xs px-3">
                  <Send className="h-3 w-3 mr-1" /> Send
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Tabbed sidebar ── */}
        <div className="shrink-0 w-[280px] min-h-0 flex flex-col rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {([
              { key: "start" as SidebarTab, label: "Start", icon: Zap },
              { key: "result" as SidebarTab, label: "Result", icon: CheckCircle },
              { key: "sessions" as SidebarTab, label: "Sessions", icon: History },
              { key: "progress" as SidebarTab, label: "Progress", icon: TrendingUp },
            ]).map((tab) => {
              const Icon = tab.icon;
              const isActive = sidebarTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSidebarTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    isActive
                      ? "text-violet-400 border-b-2 border-violet-500 bg-violet-500/5"
                      : "text-muted-foreground hover:text-contrast hover:bg-surface/50 border-b-2 border-transparent"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Start tab */}
            {sidebarTab === "start" && (
              <>
                {learningPaths.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">Select a learning path and begin a new evaluation interview.</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <select
                          value={selectedPathId ?? ""}
                          onChange={(e) => setSelectedPathId(e.target.value ? Number(e.target.value) : null)}
                          className="w-full appearance-none border border-border rounded-lg px-2 py-1.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50 bg-surface text-contrast cursor-pointer"
                        >
                          {learningPaths.map((lp) => (
                            <option key={lp.path_id} value={lp.path_id}>{lp.track_name || `Path #${lp.path_id}`}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                      <Button size="sm" onClick={() => void handleCreateSession()} isLoading={isCreatingSession} disabled={isCreatingSession || !selectedPathId} className="h-7 text-xs px-3 shrink-0">
                        <Play className="h-3 w-3 mr-1" /> Go
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No learning paths found. Complete an assessment first.</p>
                )}
              </>
            )}

            {/* Result tab */}
            {sidebarTab === "result" && (
              <div className="space-y-2">
                {result ? (
                  <>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="rounded-lg p-2 bg-blue-500/8 border border-blue-500/15 text-center">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-blue-400">Reason</div>
                        <div className="font-bold text-contrast text-sm">{formatScore(result.reasoning_score)}</div>
                      </div>
                      <div className="rounded-lg p-2 bg-fuchsia-500/8 border border-fuchsia-500/15 text-center">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-fuchsia-400">Problem</div>
                        <div className="font-bold text-contrast text-sm">{formatScore(result.problem_solving)}</div>
                      </div>
                      <div className="rounded-lg p-2 bg-emerald-500/8 border border-emerald-500/15 text-center">
                        <div className="text-[8px] font-bold uppercase tracking-wider text-emerald-400">Ready</div>
                        <div className={`font-bold text-xs uppercase ${readinessColor(result.readiness_level)}`}>{result.readiness_level.replace(/_/g, " ")}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 bg-surface/50 rounded-lg p-2 border border-border">
                      {result.final_feedback}
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => goTo(`/evaluation/${activeSession!.evaluation_id}`)} className="flex-1 h-7 text-[10px]">
                        <MessageSquare className="h-3 w-3 mr-1" /> Report
                      </Button>
                      {activeSession?.path_id && (
                        <Button variant="outline" size="sm" onClick={() => goTo(`/improvement/${activeSession!.path_id}`)} className="flex-1 h-7 text-[10px]">
                          <TrendingUp className="h-3 w-3 mr-1" /> Analysis
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {activeSession?.status === "in_progress" ? "Complete the interview to see your result." : "Select or start a session first."}
                  </p>
                )}
                <Button onClick={handleCompleteEvaluation} isLoading={isCompleting} disabled={!canComplete} className="w-full h-7 text-xs">
                  Complete Evaluation
                </Button>
              </div>
            )}

            {/* Sessions tab */}
            {sidebarTab === "sessions" && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground">{sessionsPreview.length} session{sessionsPreview.length !== 1 ? "s" : ""}</div>
                {sessionsPreview.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No sessions yet. Start one from the Start tab.</p>
                ) : (
                  sessionsPreview.map((session) => (
                    <button
                      key={session.evaluation_id}
                      onClick={() => void loadSession(session.evaluation_id, session)}
                      className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                        activeSession?.evaluation_id === session.evaluation_id
                          ? "bg-violet-500/15 border border-violet-500/30"
                          : "bg-surface/50 border border-transparent hover:bg-surface hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-contrast">#{session.evaluation_id}</span>
                        <span className={`text-[9px] font-bold uppercase ${session.status === "completed" ? "text-emerald-400" : "text-blue-400"}`}>
                          {session.status === "completed" ? "Done" : "Active"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Path #{session.path_id} · {formatDateTime(session.started_at)}</div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Progress tab */}
            {sidebarTab === "progress" && (
              <>
                {!evaluationHistory ? (
                  <Button size="sm" variant="outline" onClick={() => void handleRetryWorkspaceLoad()} className="h-7 text-xs">Retry</Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <div className="flex-1 rounded-lg p-2 bg-violet-500/8 border border-violet-500/15 text-center">
                        <div className="text-[8px] font-bold uppercase text-violet-400">Done</div>
                        <div className="text-lg font-bold text-contrast">{evaluationHistory.totalEvaluations}</div>
                      </div>
                      {evaluationHistory.progression && (
                        <div className="flex-1 rounded-lg p-2 bg-emerald-500/8 border border-emerald-500/15">
                          <div className="text-[8px] font-bold uppercase text-emerald-400">Improve</div>
                          <div className="text-[10px] text-emerald-300 font-medium mt-0.5">
                            R +{formatScore(evaluationHistory.progression.improvement.reasoningImprovement)}
                          </div>
                          <div className="text-[10px] text-emerald-300 font-medium">
                            PS +{formatScore(evaluationHistory.progression.improvement.problemSolvingImprovement)}
                          </div>
                        </div>
                      )}
                    </div>
                    {historyPreview.length > 0 && (
                      <div className="space-y-1">
                        {historyPreview.slice(0, 5).map((item) => (
                          <button
                            key={item.evaluationId}
                            type="button"
                            onClick={() => void loadSession(item.evaluationId)}
                            className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                              activeSession?.evaluation_id === item.evaluationId
                                ? "bg-violet-500/15 border border-violet-500/30"
                                : "bg-surface/50 border border-transparent hover:bg-surface hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-contrast">#{item.evaluationId}</span>
                              <span className={`text-[9px] font-bold uppercase ${readinessColor(item.readinessLevel ?? "")}`}>
                                {item.readinessLevel?.replace(/_/g, " ") ?? "-"}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {item.trackName || "Unknown"} · R {formatScore(item.reasoningScore)} · PS {formatScore(item.problemSolvingScore)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
