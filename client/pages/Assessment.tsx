import { FC, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useParams } from "react-router-dom";
import { AlertCircle, Clock, LogOut, RefreshCw, X } from "lucide-react";
import { parseDecimalOr } from "../api/adapters/numeric";
import { assessmentService } from "../api/services/assessment";
import { tracksService } from "../api/services/tracks";
import { ApiHttpError } from "../api/http";
import { Button } from "../components/Button";
import { AssessmentResult } from "../types";
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
  result: AssessmentResultResponse;
  questions: AssessmentQuestionResponse[];
  submittedResponses: Record<number, AssessmentResponseResponse>;
  trackName: string;
}): AssessmentResult => {
  const score = Math.round(parseDecimalOr(result.overall_score, 0));

  const scoredQuestions = questions
    .map((question) => {
      const response = submittedResponses[question.question_id];
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
  };
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

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const difficultyClass = (difficulty: string) => {
    switch (difficulty) {
      case "low":
        return "bg-green-900/30 text-green-400 border-green-800";
      case "medium":
        return "bg-blue-900/30 text-blue-400 border-blue-800";
      case "high":
        return "bg-yellow-900/30 text-yellow-400 border-yellow-800";
      default:
        return "bg-purple-900/30 text-purple-400 border-purple-800";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0A] text-center p-4">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mb-6" />
        <p className="font-display text-2xl md:text-3xl font-bold text-white animate-pulse-slow">
          Loading assessment session...
        </p>
        <p className="text-gray-500 mt-2">Fetching your server-generated questions.</p>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
        <h2 className="text-2xl font-bold mb-3">Unable to Load Assessment</h2>
        <p className="text-gray-400 mb-6">
          {errorMessage || "No questions were found for this session. Please start again."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              void loadSessionData();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Load
          </Button>
          <Button onClick={onExit}>Back to Track Selection</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-0 md:p-4 font-sans text-white">
      <div
        className="absolute inset-0 z-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-20">
        <button
          onClick={() => setShowExitModal(true)}
          className="text-gray-400 hover:text-red-400 transition-colors flex items-center text-sm font-medium bg-black/40 backdrop-blur rounded-full px-3 py-1 md:bg-transparent md:p-0 border md:border-none border-gray-800"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Quit
        </button>
      </div>

      <div className="w-full h-full md:h-auto md:max-w-3xl bg-[#111111] md:rounded-2xl shadow-2xl border-0 md:border border-white/5 flex flex-col relative z-10 min-h-screen md:min-h-[500px]">
        <div className="bg-[#111111] px-6 py-4 border-b border-white/5 flex justify-between items-center sticky top-0 z-30">
          <div className="flex items-center space-x-3 text-white">
            <div className="bg-neutral-800 p-2 rounded-lg text-gray-300">
              <Clock className="h-5 w-5" />
            </div>
            <span className="font-mono font-bold text-lg">{formatTime(timeLeft)}</span>
          </div>
          <div className="flex flex-col items-end mr-8 md:mr-0">
            <div className="text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
              Q {currentQuestionIndex + 1} / {questions.length}
            </div>
            <div className="flex gap-1 mt-1">
              {questions.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 w-1.5 md:w-2 rounded-full ${
                    index <= currentQuestionIndex ? "bg-blue-500" : "bg-neutral-800"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-12 flex-1 flex flex-col pb-32 md:pb-12 overflow-y-auto">
          <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-3">
            <span
              className={`inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${difficultyClass(
                currentQuestion.difficulty,
              )}`}
            >
              {currentQuestion.difficulty}
            </span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-800 px-2 py-1 rounded-full truncate max-w-[200px]">
              {track?.track_name || `Track #${session?.track_id ?? ""}`}
            </span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider border border-gray-800 px-2 py-1 rounded-full">
              {currentQuestion.question_type}
            </span>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-xl border border-red-900/60 bg-red-900/20 text-red-200 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <span className="text-sm flex-1">{errorMessage}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-100 hover:text-white hover:bg-red-900/30"
                onClick={() => {
                  void loadSessionData();
                }}
                disabled={isSubmittingAnswer || Boolean(statusMessage)}
              >
                Retry
              </Button>
            </div>
          )}

          <div className="mb-6 md:mb-8">
            <div className="max-w-none text-white">
              <ReactMarkdown
                components={{
                  p: ({ node, ...props }) => (
                    <p className="text-lg md:text-xl font-medium text-gray-200 leading-relaxed mb-6" {...props} />
                  ),
                  code: ({ node, className, children, ...props }: any) => (
                    <code
                      className="font-mono text-sm md:text-base bg-neutral-800 text-pink-400 px-1.5 py-0.5 rounded border border-neutral-700 break-words"
                      {...props}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ node, ...props }) => (
                    <pre
                      className="bg-neutral-900/50 p-4 rounded-lg overflow-x-auto text-sm mb-4 border border-neutral-800 text-gray-300"
                      {...props}
                    />
                  ),
                }}
              >
                {parsedQuestion.prompt}
              </ReactMarkdown>
            </div>
          </div>

          <div className="flex-1">
            {isMcqWithOptions ? (
              <div className="space-y-3 md:space-y-4 pb-20 md:pb-0">
                {parsedQuestion.options.map((option, index) => (
                  <button
                    key={`${currentQuestion.question_id}-${index}`}
                    onClick={() => {
                      void submitCurrentAnswer(option);
                    }}
                    disabled={statusMessage !== null || isSubmittingAnswer}
                    className="w-full text-left p-4 md:p-5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 transition-all group relative overflow-hidden active:bg-blue-900/40 disabled:opacity-60"
                  >
                    <div className="flex items-start md:items-center relative z-10">
                      <span className="flex-shrink-0 h-8 w-8 rounded-lg bg-neutral-700 flex items-center justify-center text-sm font-bold text-gray-400 mr-4 group-hover:bg-blue-600 group-hover:text-white transition-colors mt-0.5 md:mt-0">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="text-base md:text-lg text-gray-300 group-hover:text-white font-medium leading-tight">
                        {option}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in pb-24 md:pb-0">
                <p className="text-sm text-gray-400 mb-2 font-medium">Type your answer:</p>
                <textarea
                  className="w-full h-48 p-4 border border-neutral-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none bg-neutral-800 text-white placeholder-gray-500 text-base md:text-lg font-sans transition-all"
                  placeholder="Write your response..."
                  value={freeTextAnswer}
                  onChange={(event) => setFreeTextAnswer(event.target.value)}
                  disabled={statusMessage !== null || isSubmittingAnswer}
                />
                <div className="hidden md:flex justify-end">
                  <Button
                    onClick={() => {
                      void submitCurrentAnswer(freeTextAnswer);
                    }}
                    disabled={!freeTextAnswer.trim() || statusMessage !== null || isSubmittingAnswer}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white border-none"
                  >
                    Submit Answer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/60 flex flex-col items-center justify-center animate-fade-in px-4">
          <div className="flex flex-col items-center max-w-md text-center p-4">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-600 rounded-full blur-2xl opacity-30 animate-pulse" />
              <div className="h-16 w-16 md:h-20 md:w-20 border-[6px] border-blue-500 border-t-transparent rounded-full animate-spin relative z-10" />
            </div>
            <p className="font-display text-2xl md:text-3xl font-bold text-white animate-pulse-slow">
              {statusMessage}
            </p>
          </div>
        </div>
      )}

      {showExitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111111] rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-neutral-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-xl md:text-2xl font-bold text-white">Quit Assessment?</h3>
              <button onClick={() => setShowExitModal(false)} className="text-gray-500 hover:text-gray-300">
                <X className="h-6 w-6" />
              </button>
            </div>
            <p className="text-gray-400 mb-8 text-sm md:text-base">
              Your assessment session will remain on the server, but unfinished answers will not be submitted.
            </p>
            <div className="flex flex-col md:flex-row gap-4">
              <Button
                variant="outline"
                onClick={() => setShowExitModal(false)}
                className="flex-1 h-12 order-2 md:order-1 border-neutral-700 text-gray-300 hover:bg-neutral-800 hover:text-white"
              >
                Resume
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowExitModal(false);
                  onExit();
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 h-12 border-none order-1 md:order-2 text-white"
              >
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
