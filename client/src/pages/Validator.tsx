import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock3,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";
import { parseDecimal } from "../api/adapters/numeric";
import { ApiHttpError } from "../api/http";
import {
  evaluationService,
  type EvaluationDialogueResponse,
  type EvaluationResultResponse,
  type EvaluationSessionResponse,
} from "../api/services/evaluation";
import { progressService, type ProgressEvaluationHistory } from "../api/services/progress";
import { Button } from "../components/Button";
import { useTheme } from "../providers/ThemeProvider";

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
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);

  const queryPathId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("pathId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const [pathIdInput, setPathIdInput] = useState(() => (queryPathId ? String(queryPathId) : ""));
  const [draftResponse, setDraftResponse] = useState("");

  const [mySessions, setMySessions] = useState<EvaluationSessionResponse[]>([]);
  const [activeSession, setActiveSession] = useState<EvaluationSessionResponse | null>(null);
  const [dialogues, setDialogues] = useState<EvaluationDialogueResponse[]>([]);
  const [result, setResult] = useState<EvaluationResultResponse | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<ProgressEvaluationHistory | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const sessions = await loadMySessions();
        await loadEvaluationHistory();

        if (!isMounted) {
          return;
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

  const handleCreateSession = async () => {
    const pathId = Number(pathIdInput);

    if (!Number.isInteger(pathId) || pathId <= 0) {
      setErrorMessage("Enter a valid learning path ID to start a new evaluation session.");
      return;
    }

    setIsCreatingSession(true);
    setStatusMessage("Creating evaluation session...");
    setErrorMessage(null);

    try {
      const createdSession = await evaluationService.createSession(pathId);
      setPathIdInput("");

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
      } catch (error) {
        if (
          error instanceof ApiHttpError &&
          error.status === 400 &&
          error.message.toLowerCase().includes("already completed")
        ) {
          const existingResult = await evaluationService.getResult(activeSession.evaluation_id);
          setResult(existingResult);
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
    if (!level) return "text-gray-500 dark:text-gray-400";
    const l = level.toLowerCase();
    if (l === "senior_ready") return "text-emerald-600 dark:text-emerald-400";
    if (l === "mid") return "text-blue-600 dark:text-blue-400";
    return "text-amber-600 dark:text-amber-400";
  };

  if (isBootstrapping) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center bg-gradient-to-b from-transparent via-background to-background">
        <div className="text-center">
          <div className="relative inline-block">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/25">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 blur-xl animate-pulse" />
          </div>
          <p className="mt-6 text-gray-500 dark:text-gray-400 font-medium">Loading evaluation workspace...</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Preparing your AI interview experience</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-auto lg:h-[calc(100vh-140px)] flex flex-col gap-6 pb-20 lg:pb-0">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-blue-50/50 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/30 border border-gray-200/80 dark:border-zinc-700/80 p-6 shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-400/10 to-transparent dark:from-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                <Bot className="h-3 w-3" />
                AI Interview
              </span>
              {activeSession && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    activeSession.status === "completed"
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {activeSession.status}
                </span>
              )}
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-contrast tracking-tight">
              Skill Evaluation
            </h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
              AI interviewer with full context — your track, assessment, and learning journey.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRetryWorkspaceLoad()}
              disabled={Boolean(statusMessage)}
              className="shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${statusMessage ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Clock3 className="h-4 w-4" />
              <span>
                {activeSession
                  ? `Session #${activeSession.evaluation_id}`
                  : "No active session"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Error */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <Button size="sm" variant="ghost" onClick={() => void handleRetryWorkspaceLoad()}>
            Retry
          </Button>
        </div>
      )}

      {/* Status */}
      {statusMessage && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-0">
        {/* Main chat area */}
        <div className="xl:col-span-2 flex flex-col gap-4 min-h-0">
          <div
            className={`flex-1 rounded-2xl border shadow-sm flex flex-col min-h-0 overflow-hidden ${
              isDark
                ? "bg-zinc-900/50 border-zinc-700/80"
                : "bg-white border-gray-200/80"
            }`}
          >
            {/* Chat header */}
            <div
              className={`px-6 py-4 border-b flex items-center justify-between ${
                isDark ? "border-zinc-700/80 bg-zinc-900/80" : "border-gray-200/80 bg-gray-50/80"
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-contrast">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Dialogue
              </span>
              {activeSession && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {dialogueCount} message{dialogueCount !== 1 ? "s" : ""}
                  {activeSession.path_id && ` · Path #${activeSession.path_id}`}
                </span>
              )}
            </div>

            {/* Messages — scrollable so input stays visible */}
            <div className="flex-1 min-h-[200px] max-h-[min(50vh,420px)] p-6 overflow-y-auto space-y-5">
              {!activeSession && (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center mb-4">
                    <Bot className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No active session</p>
                  <p className="mt-1 text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                    Enter a learning path ID and create a session to start your AI interview.
                  </p>
                </div>
              )}

              {activeSession && dialogues.length === 0 && (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center mb-4 animate-pulse">
                    <Sparkles className="h-8 w-8 text-blue-500" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Session ready</p>
                  <p className="mt-1 text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                    The AI interviewer will send the first message. Check back shortly.
                  </p>
                </div>
              )}

              {dialogues.map((dialogue, idx) => {
                const isUser = dialogue.speaker.toLowerCase() === "user";
                return (
                  <div
                    key={dialogue.dialogue_id}
                    className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div
                      className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                        isUser
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/25"
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
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20"
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
                      <div
                        className={`text-sm leading-relaxed prose prose-sm max-w-none ${
                          isUser
                            ? "text-white [&_*]:text-white"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap m-0">{dialogue.message_text}</p>
                        ) : (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
                              strong: ({ children }) => (
                                <strong className="font-semibold text-inherit">{children}</strong>
                              ),
                            }}
                          >
                            {dialogue.message_text}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input area — always visible at bottom */}
            <div
              className={`flex-shrink-0 border-t p-4 ${
                isDark ? "border-zinc-700/80 bg-zinc-900/50" : "border-gray-200/80 bg-gray-50/50"
              }`}
            >
              <label htmlFor="validator-reply" className="block text-sm font-medium text-contrast mb-2">
                Your answer
              </label>
              <textarea
                id="validator-reply"
                value={draftResponse}
                onChange={(e) => setDraftResponse(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canRespond) {
                      void handleSendResponse();
                    }
                  }
                }}
                placeholder={
                  activeSession
                    ? activeSession.status === "completed"
                      ? "This evaluation is completed. Start a new session to continue."
                      : "Type your response to the AI interviewer..."
                    : "Create or open a session first."
                }
                disabled={!canRespond}
                className={`w-full min-h-[100px] p-4 text-sm rounded-xl resize-none transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                  isDark
                    ? "bg-zinc-800 border border-zinc-600 text-zinc-100 placeholder-zinc-500"
                    : "bg-white border border-gray-200 text-gray-900 placeholder-gray-400"
                }`}
              />
              <div className="flex flex-wrap items-center gap-3 justify-between mt-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {activeSession && activeSession.status !== "completed" ? (
                    remainingDialogues > 0 ? (
                      <span>
                        {remainingDialogues} more message{remainingDialogues === 1 ? "" : "s"} before completion
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Ready to complete evaluation
                      </span>
                    )
                  ) : (
                    <span>Responses are saved to your session</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraftResponse("")}
                    disabled={!canRespond || draftResponse.length === 0}
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={handleSendResponse}
                    disabled={!canRespond || draftResponse.trim().length === 0}
                    isLoading={isSending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Start session */}
          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
            }`}
          >
            <h2 className="font-semibold text-contrast mb-1">Start New Session</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Enter your learning path ID to begin an AI interview.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pathIdInput}
              onChange={(e) => setPathIdInput(e.target.value.replace(/\D/g, ""))}
              placeholder="Path ID"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 ${
                isDark
                  ? "bg-zinc-800 border-zinc-600 text-zinc-100 placeholder-zinc-500"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
              }`}
            />
            <Button
              type="button"
              onClick={handleCreateSession}
              isLoading={isCreatingSession}
              disabled={isCreatingSession || !pathIdInput.trim()}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              Create Session
            </Button>
          </div>

          {/* Result */}
          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-contrast">Evaluation Result</h2>
                {activeSession && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {activeSession.status === "completed"
                      ? `Session #${activeSession.evaluation_id} · Path #${activeSession.path_id ?? "—"}`
                      : "Complete the interview to see your result"}
                  </p>
                )}
              </div>
              {activeSession?.status === "completed" ? (
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              )}
            </div>

            {result ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`rounded-xl p-3 ${
                      isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
                    }`}
                  >
                    <div className="text-xs text-gray-500 dark:text-gray-400">Reasoning</div>
                    <div className="font-bold text-contrast text-lg">{formatScore(result.reasoning_score)}</div>
                  </div>
                  <div
                    className={`rounded-xl p-3 ${
                      isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
                    }`}
                  >
                    <div className="text-xs text-gray-500 dark:text-gray-400">Problem Solving</div>
                    <div className="font-bold text-contrast text-lg">{formatScore(result.problem_solving)}</div>
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 ${
                    isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
                  }`}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">Readiness</div>
                  <div className={`font-bold uppercase ${readinessColor(result.readiness_level)}`}>
                    {result.readiness_level.replace(/_/g, " ")}
                  </div>
                </div>
                <div
                  className={`prose prose-sm max-w-none rounded-xl p-3 ${
                    isDark ? "bg-zinc-800/50 text-zinc-300" : "text-gray-700"
                  }`}
                >
                  <ReactMarkdown>{result.final_feedback}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeSession?.status === "in_progress"
                    ? "Complete the interview and click &quot;Complete Evaluation&quot; to see your result."
                    : "Select a completed session from &quot;My Sessions&quot; or &quot;Progress&quot; below to view your past evaluation results."}
                </p>
              </div>
            )}

            <Button
              onClick={handleCompleteEvaluation}
              isLoading={isCompleting}
              disabled={!canComplete}
              className="w-full mt-3"
            >
              Complete Evaluation
            </Button>
            {result && activeSession && (
              <div className="flex flex-col gap-2 mt-3">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/evaluation/${activeSession.evaluation_id}`)}
                  className="w-full"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  View Full Report
                </Button>
                {activeSession.path_id && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/improvement/${activeSession.path_id}`)}
                    className="w-full"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    View Progress Analysis
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Sessions list */}
          <div
            className={`rounded-2xl border p-5 flex-1 min-h-0 overflow-hidden flex flex-col ${
              isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
            }`}
          >
            <h2 className="font-semibold text-contrast mb-1">My Sessions</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Click a completed session to view result</p>
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
              {sessionsPreview.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No sessions yet.</p>
              ) : (
                sessionsPreview.map((session) => (
                  <button
                    key={session.evaluation_id}
                    onClick={() => void loadSession(session.evaluation_id, session)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 text-sm transition-all ${
                      activeSession?.evaluation_id === session.evaluation_id
                        ? "bg-blue-500/15 dark:bg-blue-500/20 border border-blue-500/40 text-blue-700 dark:text-blue-300"
                        : isDark
                          ? "border border-zinc-700/60 hover:bg-zinc-800/60 hover:border-zinc-600"
                          : "border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{session.evaluation_id}</span>
                      <span
                        className={`text-xs font-medium uppercase ${
                          session.status === "completed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Path #{session.path_id} · {formatDateTime(session.started_at)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* History */}
          <div
            className={`rounded-2xl border p-5 flex-1 min-h-0 overflow-hidden flex flex-col ${
              isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
            }`}
          >
            <h2 className="font-semibold text-contrast mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Progress
            </h2>
            {!evaluationHistory ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">History unavailable.</p>
                <Button size="sm" variant="outline" onClick={() => void handleRetryWorkspaceLoad()}>
                  Retry
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm flex-1 min-h-0 overflow-y-auto">
                <div
                  className={`rounded-xl p-3 ${
                    isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
                  }`}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
                  <div className="text-xl font-bold text-contrast">{evaluationHistory.totalEvaluations}</div>
                </div>

                {evaluationHistory.progression && (
                  <div
                    className={`rounded-xl p-3 space-y-1 ${
                      isDark ? "bg-emerald-950/30 border border-emerald-800/40" : "bg-emerald-50 border border-emerald-200/80"
                    }`}
                  >
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Improvement</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-300">
                      Reasoning +{formatScore(evaluationHistory.progression.improvement.reasoningImprovement)}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-300">
                      Problem Solving +
                      {formatScore(evaluationHistory.progression.improvement.problemSolvingImprovement)}
                    </div>
                    {evaluationHistory.progression.improvement.readinessProgression && (
                      <div className="text-xs text-emerald-600 dark:text-emerald-300">
                        {evaluationHistory.progression.improvement.readinessProgression}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Click a past evaluation to view full result →
                  </p>
                  {historyPreview.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No completed evaluations yet.</p>
                  ) : (
                    historyPreview.map((item) => (
                      <button
                        key={item.evaluationId}
                        type="button"
                        onClick={() => void loadSession(item.evaluationId)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                          activeSession?.evaluation_id === item.evaluationId
                            ? "bg-blue-500/15 dark:bg-blue-500/20 border border-blue-500/40"
                            : isDark
                              ? "bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800/80 hover:border-zinc-600"
                              : "bg-gray-50 border border-gray-200/80 hover:bg-gray-100 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">#{item.evaluationId}</span>
                          <span className={`text-xs font-medium uppercase ${readinessColor(item.readinessLevel ?? "")}`}>
                            {item.readinessLevel ?? "-"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{item.trackName || "Unknown"}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                          R {formatScore(item.reasoningScore)} · PS {formatScore(item.problemSolvingScore)}
                        </div>
                        {item.finalFeedback && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">
                            {item.finalFeedback}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
