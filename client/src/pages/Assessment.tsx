import { FC, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { parseDecimalOr } from "../api/adapters/numeric";
import { assessmentService } from "../api/services/assessment";
import { tracksService } from "../api/services/tracks";
import { ApiHttpError } from "../api/http";
import { Button } from "../components/Button";
import { Panel, StatusPill } from "../components/ui";
import { AssessmentResult, type ComprehensiveReport } from "../types";
import type { components } from "../api/generated/openapi";

type AssessmentQuestionResponse = components["schemas"]["AssessmentQuestionResponse"];
type AssessmentResponseResponse = components["schemas"]["AssessmentResponseResponse"];
type AssessmentResultResponse = components["schemas"]["AssessmentResultResponse"];
type AssessmentSessionResponse = components["schemas"]["AssessmentSessionResponse"];
type TrackResponse = components["schemas"]["TrackResponse"];

interface AssessmentProps {
  onComplete: (result: AssessmentResult) => void;
  onExit: () => void;
}

interface ParsedQuestionBody {
  prompt: string;
  options: string[];
}

const ASSESSMENT_DURATION_SECONDS = 50 * 60;

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const parseQuestionBody = (questionText: string): ParsedQuestionBody => {
  const lines = questionText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { prompt: questionText, options: [] };
  }

  const options: string[] = [];
  const promptLines: string[] = [];

  lines.forEach((line) => {
    const optionMatch = line.match(/^[A-D][\)\.:\-]\s*(.+)$/i);
    if (optionMatch) {
      options.push(optionMatch[1].trim());
      return;
    }

    promptLines.push(line);
  });

  if (options.length < 2) {
    return { prompt: questionText, options: [] };
  }

  return {
    prompt: promptLines.join("\n"),
    options,
  };
};

const toKnowledgeGraph = (score: number, detectedLevel: string): AssessmentResult["knowledgeGraph"] => {
  const levelBoost = detectedLevel === "advanced" ? 12 : detectedLevel === "intermediate" ? 5 : 0;

  return [
    { subject: "Fundamentals", A: clamp(score + levelBoost - 8), fullMark: 100 },
    { subject: "Problem Solving", A: clamp(score + levelBoost - 2), fullMark: 100 },
    { subject: "System Design", A: clamp(score + levelBoost - 12), fullMark: 100 },
    { subject: "Reliability", A: clamp(score + levelBoost - 5), fullMark: 100 },
    { subject: "Communication", A: clamp(score + levelBoost - 3), fullMark: 100 },
  ];
};

const summarizeQuestion = (text: string): string => {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 46 ? `${compact.slice(0, 46)}...` : compact;
};

const toAssessmentResult = ({
  result,
  questions,
  submittedResponses,
  trackName,
}: {
  result: AssessmentResultResponse & { evaluated_responses?: AssessmentResponseResponse[] | null };
  questions: AssessmentQuestionResponse[];
  submittedResponses: Record<number, AssessmentResponseResponse>;
  trackName: string;
}): AssessmentResult => {
  const score = Math.round(parseDecimalOr(result.overall_score, 0));

  const responsesByQuestion =
    result.evaluated_responses?.length && result.evaluated_responses.some((response) => response.ai_score != null)
      ? Object.fromEntries(result.evaluated_responses.map((response) => [response.question_id, response]))
      : submittedResponses;

  const scoredQuestions = questions
    .map((question) => {
      const response = responsesByQuestion[question.question_id];
      if (!response) {
        return null;
      }

      return {
        label: summarizeQuestion(question.question_text),
        score: parseDecimalOr(response.ai_score, 0),
      };
    })
    .filter((value): value is { label: string; score: number } => Boolean(value));

  const strengths = scoredQuestions
    .filter((entry) => entry.score >= 0.75)
    .slice(0, 3)
    .map((entry) => entry.label);

  const weaknesses = scoredQuestions
    .filter((entry) => entry.score <= 0.55)
    .slice(0, 3)
    .map((entry) => entry.label);

  const fallbackStrength = [`Level: ${result.detected_level}`];
  const fallbackWeakness = ["Review AI reasoning for targeted improvement areas"];

  const apiResult = result as typeof result & { comprehensive_report?: ComprehensiveReport | null };
  const comprehensiveReport =
    apiResult.comprehensive_report && typeof apiResult.comprehensive_report === "object"
      ? apiResult.comprehensive_report
      : null;

  return {
    topic: trackName,
    score,
    totalQuestions: questions.length,
    strengths: strengths.length > 0 ? strengths : fallbackStrength,
    weaknesses: weaknesses.length > 0 ? weaknesses : fallbackWeakness,
    knowledgeGraph: toKnowledgeGraph(score, result.detected_level),
    sessionId: result.session_id,
    learningPathId: result.learning_path_id ?? null,
    detectedLevel: result.detected_level,
    aiReasoning: result.ai_reasoning,
    comprehensiveReport: comprehensiveReport ?? null,
  };
};

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
};

const difficultyTone = (difficulty: string): "success" | "accent" | "warning" | "danger" => {
  if (difficulty === "low") {
    return "success";
  }

  if (difficulty === "medium") {
    return "accent";
  }

  if (difficulty === "high") {
    return "warning";
  }

  return "danger";
};

export const Assessment: FC<AssessmentProps> = ({ onComplete, onExit }) => {
  const { sessionId: sessionIdParam } = useParams<{ sessionId: string }>();
  const sessionId = Number(sessionIdParam);
  const hasValidSessionId = Number.isInteger(sessionId) && sessionId > 0;

  const [session, setSession] = useState<AssessmentSessionResponse | null>(null);
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionResponse[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittedResponses, setSubmittedResponses] = useState<Record<number, AssessmentResponseResponse>>({});
  const [freeTextAnswer, setFreeTextAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(ASSESSMENT_DURATION_SECONDS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const parsedQuestion = useMemo(
    () => parseQuestionBody(currentQuestion?.question_text ?? ""),
    [currentQuestion?.question_text],
  );
  const isMcqWithOptions = currentQuestion?.question_type === "mcq" && parsedQuestion.options.length > 0;
  const progressValue = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  const loadSessionData = useCallback(async () => {
    if (!hasValidSessionId) {
      setErrorMessage("Invalid assessment session URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const sessionData = await assessmentService.getSession(sessionId);
      const [sessionQuestions, trackDetails] = await Promise.all([
        assessmentService.getSessionQuestions(sessionId),
        tracksService.getById(sessionData.track_id).catch(() => null),
      ]);

      setSession(sessionData);
      setQuestions(sessionQuestions);
      setTrack(trackDetails);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to load assessment session."));
    } finally {
      setLoading(false);
    }
  }, [hasValidSessionId, sessionId]);

  useEffect(() => {
    void loadSessionData();
  }, [loadSessionData]);

  const completeAssessment = useCallback(async () => {
    if (!hasValidSessionId) {
      return;
    }

    setStatusMessage("Finalizing assessment...");
    setErrorMessage(null);

    try {
      let result: AssessmentResultResponse;

      try {
        result = await assessmentService.completeSession(sessionId);
      } catch (error) {
        if (
          error instanceof ApiHttpError &&
          error.status === 400 &&
          error.message.toLowerCase().includes("already completed")
        ) {
          result = await assessmentService.getSessionResult(sessionId);
        } else {
          throw error;
        }
      }

      if (result.overall_score === null || result.overall_score === undefined) {
        result = await assessmentService.getSessionResult(sessionId);
      }

      if (!result.learning_path_id) {
        try {
          const learningPath = await assessmentService.getSessionLearningPath(sessionId);
          result = {
            ...result,
            learning_path_id: learningPath.path_id,
          };
        } catch (error) {
          if (!(error instanceof ApiHttpError) || error.status !== 404) {
            throw error;
          }
        }
      }

      const finalResult = toAssessmentResult({
        result,
        questions,
        submittedResponses,
        trackName: track?.track_name ?? `Track ${session?.track_id ?? ""}`.trim(),
      });

      onComplete(finalResult);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to complete assessment."));
    } finally {
      setStatusMessage(null);
    }
  }, [hasValidSessionId, onComplete, questions, session?.track_id, sessionId, submittedResponses, track?.track_name]);

  useEffect(() => {
    if (loading || questions.length === 0 || statusMessage) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          window.clearInterval(timer);
          void completeAssessment();
          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [completeAssessment, loading, questions.length, statusMessage]);

  const submitCurrentAnswer = async (answerText: string) => {
    if (!currentQuestion || !hasValidSessionId) {
      return;
    }

    const normalizedAnswer = answerText.trim();
    if (!normalizedAnswer) {
      return;
    }

    setIsSubmittingAnswer(true);
    setStatusMessage("Submitting answer...");
    setErrorMessage(null);

    try {
      const response = await assessmentService.submitAnswer(sessionId, {
        question_id: currentQuestion.question_id,
        user_answer: normalizedAnswer,
      });

      setSubmittedResponses((currentResponses) => ({
        ...currentResponses,
        [currentQuestion.question_id]: response,
      }));

      setFreeTextAnswer("");

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((index) => index + 1);
        return;
      }

      await completeAssessment();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not submit your answer."));
    } finally {
      setIsSubmittingAnswer(false);
      setStatusMessage(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-20">
        <div className="page-shell py-10">
          <Panel className="p-10 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-4 text-lg font-semibold text-contrast">Loading assessment session...</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Fetching the server-generated questions for this track.
            </p>
          </Panel>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-background pt-20">
        <div className="page-shell py-10">
          <Panel className="p-10 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-danger" />
            <h2 className="mt-4 font-display text-3xl font-semibold text-contrast">
              Unable to load assessment
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              {errorMessage || "No questions were found for this session. Please start again."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => void loadSessionData()}>
                <RefreshCw className="h-4 w-4" />
                Retry load
              </Button>
              <Button onClick={onExit}>Back to track selection</Button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="page-shell py-6 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[0.34fr,0.66fr]">
          <div className="space-y-6">
            <Panel className="p-6 sm:sticky sm:top-24">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <StatusPill tone="accent">Assessment live</StatusPill>
                  <h1 className="mt-4 font-display text-3xl font-semibold text-contrast">
                    {track?.track_name || `Track #${session?.track_id ?? ""}`}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Stay focused. Each answer is submitted directly to the assessment session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExitModal(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/75 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-contrast"
                >
                  <LogOut className="h-4 w-4" />
                  Exit
                </button>
              </div>

              <div className="mt-6 rounded-[24px] border border-border bg-surface/70 p-4">
                <div className="flex items-center justify-between">
                  <div className="metric-label">Time remaining</div>
                  <div className="inline-flex items-center gap-2 text-lg font-semibold text-contrast">
                    <Clock3 className="h-4 w-4 text-primary" />
                    {formatTime(timeLeft)}
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-contrast/8">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>
                    Question {currentQuestionIndex + 1} / {questions.length}
                  </span>
                  <span>{Math.round(progressValue)}%</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <StatusPill tone={difficultyTone(currentQuestion.difficulty)}>
                  Difficulty: {currentQuestion.difficulty}
                </StatusPill>
                <StatusPill tone="neutral">Type: {currentQuestion.question_type}</StatusPill>
                <StatusPill tone="neutral">
                  {questions.length - currentQuestionIndex - 1} questions after this
                </StatusPill>
              </div>

              <div className="mt-6 rounded-[24px] border border-border bg-surface/55 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <div className="font-semibold text-contrast">Answering guidance</div>
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>Answer directly and keep your reasoning tight.</li>
                  <li>Multiple-choice submissions advance immediately.</li>
                  <li>Free-text answers should be specific enough to evaluate.</li>
                </ul>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            {errorMessage && (
              <div className="status-banner" data-tone="error">
                <AlertCircle className="mt-0.5 h-4 w-4 text-danger" />
                <span className="text-sm leading-6 text-contrast">{errorMessage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadSessionData()}
                  disabled={isSubmittingAnswer || Boolean(statusMessage)}
                >
                  Retry
                </Button>
              </div>
            )}

            <Panel className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="accent">Question {currentQuestionIndex + 1}</StatusPill>
                <StatusPill tone={difficultyTone(currentQuestion.difficulty)}>
                  {currentQuestion.difficulty}
                </StatusPill>
                <StatusPill tone="neutral">{currentQuestion.question_type}</StatusPill>
              </div>

              <div className="mt-6">
                <div className="markdown-content text-lg sm:text-xl">
                  <ReactMarkdown>{parsedQuestion.prompt}</ReactMarkdown>
                </div>
              </div>

              <div className="mt-8">
                {isMcqWithOptions ? (
                  <div className="space-y-3">
                    {parsedQuestion.options.map((option, index) => (
                      <button
                        key={`${currentQuestion.question_id}-${index}`}
                        type="button"
                        onClick={() => void submitCurrentAnswer(option)}
                        disabled={statusMessage !== null || isSubmittingAnswer}
                        className="group flex w-full items-start gap-4 rounded-[24px] border border-border bg-surface/70 px-4 py-4 text-left transition-all hover:border-primary/25 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                          {String.fromCharCode(65 + index)}
                        </div>
                        <div className="pt-1 text-base leading-7 text-contrast">{option}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label htmlFor="assessment-answer" className="field-label">
                      Your answer
                    </label>
                    <textarea
                      id="assessment-answer"
                      className="field-textarea min-h-[220px]"
                      placeholder="Write your response..."
                      value={freeTextAnswer}
                      onChange={(event) => setFreeTextAnswer(event.target.value)}
                      disabled={statusMessage !== null || isSubmittingAnswer}
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={() => void submitCurrentAnswer(freeTextAnswer)}
                        disabled={!freeTextAnswer.trim() || statusMessage !== null || isSubmittingAnswer}
                        size="lg"
                      >
                        Submit answer
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-md">
          <Panel className="max-w-md p-8 text-center">
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-[6px] border-primary border-t-transparent" />
            <p className="mt-5 font-display text-3xl font-semibold text-contrast">{statusMessage}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The session is being updated and scored on the backend.
            </p>
          </Panel>
        </div>
      )}

      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <Panel className="max-w-md p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-3xl font-semibold text-contrast">Exit assessment?</h3>
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="rounded-full border border-border bg-surface/70 p-2 text-muted-foreground transition-colors hover:text-contrast"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Your session stays on the server, but unfinished answers will not be submitted.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => setShowExitModal(false)} className="flex-1">
                Resume
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setShowExitModal(false);
                  onExit();
                }}
                className="flex-1"
              >
                Exit
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};
