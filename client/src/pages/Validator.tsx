import { FC, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  CheckCircle,
  Clock3,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Terminal,
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
  const [pathIdInput, setPathIdInput] = useState("");
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

        const inProgressSession = sessions.find((session) => session.status !== "completed");
        const initialSession = inProgressSession ?? sessions[0];

        if (initialSession) {
          await loadSession(initialSession.evaluation_id, initialSession);
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
  }, [loadEvaluationHistory, loadMySessions, loadSession]);

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

    return [...evaluationHistory.history].reverse().slice(0, 4);
  }, [evaluationHistory]);

  if (isBootstrapping) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading evaluation workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-auto lg:h-[calc(100vh-140px)] flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-contrast">Real-World Validator</h1>
          <p className="text-gray-500">Backend evaluation workflow with persisted interview sessions.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void handleRetryWorkspaceLoad();
            }}
            disabled={Boolean(statusMessage)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Clock3 className="h-4 w-4" />
          <span>
            {activeSession
              ? `Session #${activeSession.evaluation_id} (${activeSession.status})`
              : "No active session"}
          </span>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <span className="flex-1">{errorMessage}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void handleRetryWorkspaceLoad();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-0">
        <div className="xl:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="bg-gray-900 text-gray-200 p-6 rounded-xl border border-gray-700 shadow-soft">
            <div className="flex items-center gap-2 mb-2 text-yellow-500 text-xs font-mono uppercase tracking-widest">
              <Terminal className="h-3 w-3" />
              <span>AI Interview Dialogue</span>
            </div>
            {activeSession ? (
              <p className="font-mono text-sm leading-relaxed text-white">
                Path #{activeSession.path_id} | Started {formatDateTime(activeSession.started_at)}
              </p>
            ) : (
              <p className="font-mono text-sm leading-relaxed text-white">
                Start a session by entering a learning path ID.
              </p>
            )}
          </div>

          <div className="flex-1 bg-surface rounded-xl border border-border shadow-soft flex flex-col min-h-0 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-border font-medium text-gray-700 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Dialogue History
              </span>
              {activeSession && (
                <span className="text-xs text-gray-500">{dialogueCount} messages</span>
              )}
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {!activeSession && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                  <p>Create or open an evaluation session to begin.</p>
                </div>
              )}

              {activeSession && dialogues.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                  <p>No dialogue available yet for this session.</p>
                </div>
              )}

              {dialogues.map((dialogue) => {
                const isUser = dialogue.speaker.toLowerCase() === "user";
                return (
                  <div
                    key={dialogue.dialogue_id}
                    className={`max-w-[90%] rounded-lg px-4 py-3 border text-sm ${
                      isUser
                        ? "ml-auto bg-blue-50 border-blue-200 text-blue-900"
                        : "mr-auto bg-gray-50 border-gray-200 text-gray-800"
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wide opacity-70 mb-1">
                      {isUser ? "You" : "AI Interviewer"} - #{dialogue.sequence_no}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{dialogue.message_text}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border p-4 space-y-3 bg-white">
              <textarea
                value={draftResponse}
                onChange={(event) => setDraftResponse(event.target.value)}
                placeholder={
                  activeSession
                    ? activeSession.status === "completed"
                      ? "This evaluation is completed. Start a new session to continue."
                      : "Submit your response to the AI interviewer..."
                    : "Create or open a session first."
                }
                disabled={!canRespond}
                className="w-full min-h-[92px] p-3 font-mono text-sm bg-white border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="text-xs text-gray-500">
                  {activeSession && activeSession.status !== "completed" ? (
                    remainingDialogues > 0 ? (
                      <span>
                        {remainingDialogues} more message{remainingDialogues === 1 ? "" : "s"} required before
                        completion.
                      </span>
                    ) : (
                      <span>Minimum dialogue threshold reached. You can complete this evaluation.</span>
                    )
                  ) : (
                    <span>Responses are saved to backend session state.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDraftResponse("")}
                    disabled={!canRespond || draftResponse.length === 0}
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={handleSendResponse}
                    disabled={!canRespond || draftResponse.trim().length === 0}
                    isLoading={isSending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Response
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="bg-surface rounded-xl border border-border shadow-soft p-4 space-y-3">
            <h2 className="font-semibold text-contrast">Start New Session</h2>
            <p className="text-xs text-gray-500">
              Provide a learning path ID. This is intentionally isolated from in-progress Phase 6 learning flow.
            </p>
            <input
              type="number"
              min={1}
              value={pathIdInput}
              onChange={(event) => setPathIdInput(event.target.value)}
              placeholder="Learning path ID"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={handleCreateSession}
              isLoading={isCreatingSession}
              disabled={isCreatingSession || pathIdInput.trim().length === 0}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              Create Evaluation Session
            </Button>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-contrast">Evaluation Result</h2>
              {activeSession?.status === "completed" ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </div>

            {result ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border p-2">
                    <div className="text-xs text-gray-500">Reasoning</div>
                    <div className="font-semibold text-contrast">{formatScore(result.reasoning_score)}</div>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <div className="text-xs text-gray-500">Problem Solving</div>
                    <div className="font-semibold text-contrast">{formatScore(result.problem_solving)}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="text-xs text-gray-500">Readiness</div>
                  <div className="font-semibold text-contrast uppercase">{result.readiness_level}</div>
                </div>
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{result.final_feedback}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No result yet. Complete the current session to generate one.</p>
            )}

            <Button
              onClick={handleCompleteEvaluation}
              isLoading={isCompleting}
              disabled={!canComplete}
              className="w-full"
            >
              Complete Evaluation
            </Button>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-soft p-4 flex-1 min-h-0 overflow-hidden">
            <h2 className="font-semibold text-contrast mb-3">My Evaluation Sessions</h2>
            <div className="space-y-2 overflow-y-auto max-h-44 pr-1">
              {sessionsPreview.length === 0 ? (
                <p className="text-sm text-gray-500">No sessions yet.</p>
              ) : (
                sessionsPreview.map((session) => (
                  <button
                    key={session.evaluation_id}
                    onClick={() => {
                      void loadSession(session.evaluation_id, session);
                    }}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                      activeSession?.evaluation_id === session.evaluation_id
                        ? "border-blue-500 bg-blue-50"
                        : "border-border hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{session.evaluation_id}</span>
                      <span
                        className={`text-xs uppercase ${
                          session.status === "completed" ? "text-green-600" : "text-blue-600"
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Path #{session.path_id}</div>
                    <div className="text-xs text-gray-500">{formatDateTime(session.started_at)}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border shadow-soft p-4 flex-1 min-h-0 overflow-hidden">
            <h2 className="font-semibold text-contrast mb-3">Evaluation History</h2>
            {!evaluationHistory ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">History unavailable.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleRetryWorkspaceLoad();
                  }}
                >
                  Retry History Load
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-border p-2">
                  <div className="text-xs text-gray-500">Total Completed Evaluations</div>
                  <div className="text-lg font-semibold text-contrast">{evaluationHistory.totalEvaluations}</div>
                </div>

                {evaluationHistory.progression && (
                  <div className="rounded-lg border border-border p-2 space-y-1">
                    <div className="text-xs text-gray-500">Progression</div>
                    <div className="text-xs text-gray-700">
                      Reasoning +{formatScore(evaluationHistory.progression.improvement.reasoningImprovement)}
                    </div>
                    <div className="text-xs text-gray-700">
                      Problem Solving +
                      {formatScore(evaluationHistory.progression.improvement.problemSolvingImprovement)}
                    </div>
                    <div className="text-xs text-gray-700">
                      {evaluationHistory.progression.improvement.readinessProgression ?? ""}
                    </div>
                  </div>
                )}

                <div className="space-y-2 overflow-y-auto max-h-44 pr-1">
                  {historyPreview.length === 0 ? (
                    <p className="text-sm text-gray-500">No completed evaluations yet.</p>
                  ) : (
                    historyPreview.map((item) => (
                      <div key={item.evaluationId} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">#{item.evaluationId}</span>
                          <span className="text-xs text-gray-500 uppercase">{item.readinessLevel ?? "-"}</span>
                        </div>
                        <div className="text-xs text-gray-500">{item.trackName || "Unknown track"}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          Reasoning {formatScore(item.reasoningScore)} | Problem Solving {formatScore(item.problemSolvingScore)}
                        </div>
                      </div>
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

