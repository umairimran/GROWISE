import { FC, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, CheckCircle, MessageSquare, TrendingUp } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiHttpError } from "../api/http";
import {
  evaluationService,
  type EvaluationDialogueResponse,
  type EvaluationResultResponse,
  type EvaluationSessionResponse,
} from "../api/services/evaluation";
import { parseDecimal } from "../api/adapters/numeric";
import { Button } from "../components/Button";
import { useTheme } from "../providers/ThemeProvider";

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiHttpError) return error.message || fallback;
  if (error instanceof Error) return error.message;
  return fallback;
};

const formatScore = (value: string | number | null | undefined): string => {
  const parsed = parseDecimal(value);
  if (parsed === null) return "—";
  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return `${Math.round(normalized)}%`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const sortDialogues = (dialogues: EvaluationDialogueResponse[]) =>
  [...dialogues].sort((a, b) => a.sequence_no - b.sequence_no);

export const EvaluationReport: FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark);

  const [session, setSession] = useState<EvaluationSessionResponse | null>(null);
  const [result, setResult] = useState<EvaluationResultResponse | null>(null);
  const [dialogues, setDialogues] = useState<EvaluationDialogueResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    const id = evaluationId ? parseInt(evaluationId, 10) : NaN;
    if (!Number.isInteger(id) || id <= 0) {
      setErrorMessage("Invalid evaluation session.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [sessionData, resultData, dialoguesData] = await Promise.all([
        evaluationService.getSession(id),
        evaluationService.getResult(id),
        evaluationService.getDialogues(id),
      ]);

      setSession(sessionData);
      setResult(resultData);
      setDialogues(sortDialogues(dialoguesData));
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not load evaluation report."));
      setSession(null);
      setResult(null);
      setDialogues([]);
    } finally {
      setIsLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const readinessColor = (level: string) => {
    const l = level?.toLowerCase() ?? "";
    if (l.includes("ready") || l.includes("junior")) return "text-emerald-600 dark:text-emerald-400";
    if (l.includes("intermediate")) return "text-blue-600 dark:text-blue-400";
    if (l.includes("beginner")) return "text-amber-600 dark:text-amber-400";
    return "text-gray-600 dark:text-gray-400";
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading evaluation report...</p>
      </div>
    );
  }

  if (errorMessage || !session || !result) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-6 text-center">
          <p className="text-red-700 dark:text-red-300 mb-4">{errorMessage ?? "Report not found."}</p>
          <Button variant="outline" onClick={() => navigate("/validator")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Validator
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/validator")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Validator
        </Button>
      </div>

      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
        }`}
      >
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <h1 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
              Evaluation Report
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Session #{session.evaluation_id} · Path #{session.path_id} ·{" "}
              {session.completed_at ? formatDateTime(session.completed_at) : "Completed"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div
            className={`rounded-xl p-4 ${
              isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
            }`}
          >
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Reasoning
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatScore(result.reasoning_score)}
            </div>
          </div>
          <div
            className={`rounded-xl p-4 ${
              isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
            }`}
          >
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Problem Solving
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatScore(result.problem_solving)}
            </div>
          </div>
          <div
            className={`rounded-xl p-4 ${
              isDark ? "bg-zinc-800/80 border border-zinc-700/60" : "bg-gray-50 border border-gray-200/80"
            }`}
          >
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Readiness
            </div>
            <div className={`text-xl font-bold uppercase ${readinessColor(result.readiness_level)}`}>
              {result.readiness_level?.replace(/_/g, " ") ?? "—"}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            AI Feedback
          </h2>
          <div
            className={`prose prose-sm max-w-none rounded-xl p-5 ${
              isDark ? "bg-zinc-800/50 text-zinc-200 prose-invert" : "bg-gray-50 text-gray-800"
            }`}
          >
            <ReactMarkdown>{result.final_feedback}</ReactMarkdown>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/validator")}>
            Back to Validator
          </Button>
          {session.path_id && (
            <Button onClick={() => navigate(`/improvement/${session.path_id}`)} className="gap-2">
              <TrendingUp className="h-4 w-4" />
              View Progress Analysis
            </Button>
          )}
        </div>
      </div>

      {dialogues.length > 0 && (
        <div
          className={`rounded-2xl border p-6 shadow-sm ${
            isDark ? "bg-zinc-900/50 border-zinc-700/80" : "bg-white border-gray-200/80"
          }`}
        >
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            Conversation
          </h2>
          <div className="space-y-4">
            {dialogues.map((d) => {
              const isAi = d.speaker?.toLowerCase() === "ai" || d.speaker?.toLowerCase() === "assistant";
              return (
              <div
                key={d.sequence_no}
                className={`rounded-xl p-4 ${
                  isAi
                    ? isDark
                      ? "bg-blue-950/20 border border-blue-800/40"
                      : "bg-blue-50 border border-blue-200/80"
                    : isDark
                      ? "bg-zinc-800/60 border border-zinc-700/60"
                      : "bg-gray-50 border border-gray-200/80"
                }`}
              >
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
                  {isAi ? "AI Interviewer" : "You"}
                </div>
                <div
                  className={`prose prose-sm max-w-none ${
                    isDark ? "prose-invert text-zinc-200" : "text-gray-800"
                  }`}
                >
                  <ReactMarkdown>{d.message_text}</ReactMarkdown>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
