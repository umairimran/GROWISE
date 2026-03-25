import { FC, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { components } from "../api/generated/openapi";
import { ApiHttpError } from "../api/http";
import { chatService } from "../api/services/chat";
import { contentService } from "../api/services/content";
import { learningService } from "../api/services/learning";
import { progressService, type PathCompletionReport } from "../api/services/progress";
import { Button } from "../components/Button";
import { HeroBadge, Panel, WorkspaceFrame } from "../components/workspace";

type LearningPathResponse = components["schemas"]["LearningPathResponse"];
type LearningPathStageResponse = components["schemas"]["LearningPathStageResponse"];
type StageContentWithProgress = components["schemas"]["StageContentWithProgress"];
type StageProgressSummary = components["schemas"]["StageProgressSummary"];
type ChatSessionResponse = components["schemas"]["ChatSessionResponse"];
type ChatMessageResponse = components["schemas"]["ChatMessageResponse"];
type UserContentProgressResponse = components["schemas"]["UserContentProgressResponse"];

interface CourseProps {
  onStartAssessment: () => void;
}

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
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseTags = (raw: string | null | undefined): string[] => {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const byStageOrder = (a: LearningPathStageResponse, b: LearningPathStageResponse): number =>
  a.stage_order - b.stage_order;

const progressLabel = (progress: UserContentProgressResponse | null | undefined): string => {
  if (!progress) {
    return "Not started";
  }

  if (progress.is_completed) {
    return "Completed";
  }

  return `${progress.completion_percentage}% complete`;
};

export const Course: FC<CourseProps> = ({ onStartAssessment }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [stages, setStages] = useState<LearningPathStageResponse[]>([]);
  const [activeStageId, setActiveStageId] = useState<number | null>(null);

  const [contentItems, setContentItems] = useState<StageContentWithProgress[]>([]);
  const [stageProgress, setStageProgress] = useState<StageProgressSummary | null>(null);
  const [chatSession, setChatSession] = useState<ChatSessionResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);

  const [chatInput, setChatInput] = useState("");
  const [isLoadingPath, setIsLoadingPath] = useState(true);
  const [isLoadingStage, setIsLoadingStage] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeContentActionKey, setActiveContentActionKey] = useState<string | null>(null);
  const [isNoPath, setIsNoPath] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pathProgress, setPathProgress] = useState<{
    overallCompletionPercentage: number;
    totalContentItems: number;
    completedItems: number;
  } | null>(null);
  const [pathReport, setPathReport] = useState<PathCompletionReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const activeStage = useMemo(
    () => stages.find((stage) => stage.stage_id === activeStageId) ?? null,
    [activeStageId, stages],
  );

  const { targetPathId, targetTrackName } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const rawId = params.get("pathId");
    const parsed = rawId ? Number(rawId) : NaN;
    const pathId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const track = params.get("track");
    return {
      targetPathId: pathId,
      targetTrackName: track && track.trim().length > 0 ? track : null,
    };
  }, [location.search]);

  const scrollChatToBottom = useCallback(() => {
    const el = chatMessagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollChatToBottom();
  }, [messages, scrollChatToBottom]);

  const loadPathProgress = useCallback(async (pathId: number) => {
    try {
      const progress = await progressService.getLearningPathProgress(pathId);
      setPathProgress({
        overallCompletionPercentage: progress.overallCompletionPercentage,
        totalContentItems: progress.totalContentItems,
        completedItems: progress.completedItems,
      });
    } catch {
      setPathProgress(null);
    }
  }, []);

  const loadLearningPath = useCallback(async () => {
    setIsLoadingPath(true);
    setErrorMessage(null);

    try {
      let currentPath: LearningPathResponse | null = null;

      if (targetPathId) {
        // Try to find the requested path in the user's paths
        const myPaths = await learningService.getMyPaths();
        currentPath = myPaths.find((p) => p.path_id === targetPathId) ?? null;
      }

      if (!currentPath) {
        currentPath = await learningService.getMyCurrentPath();
      }

      const loadedStages = await learningService.getPathStages(currentPath.path_id);
      const orderedStages = [...loadedStages].sort(byStageOrder);

      setPath(currentPath);
      setStages(orderedStages);
      setIsNoPath(false);
      await loadPathProgress(currentPath.path_id);

      setActiveStageId((currentStageId) => {
        if (currentStageId && orderedStages.some((stage) => stage.stage_id === currentStageId)) {
          return currentStageId;
        }

        return orderedStages[0]?.stage_id ?? null;
      });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 404) {
        setPath(null);
        setStages([]);
        setActiveStageId(null);
        setPathProgress(null);
        setIsNoPath(true);
        return;
      }

      setErrorMessage(toErrorMessage(error, "Failed to load your learning path."));
    } finally {
      setIsLoadingPath(false);
    }
  }, [loadPathProgress, targetPathId]);

  const loadStageExperience = useCallback(
    async (stageId: number) => {
      setIsLoadingStage(true);
      setErrorMessage(null);

      try {
        const [stageContent, summary, existingSessions] = await Promise.all([
          contentService.getStageContent(stageId),
          contentService.getStageProgress(stageId),
          chatService.getMySessions(stageId),
        ]);

        const session = existingSessions[0] ?? (await chatService.createSession(stageId));
        const chatMessages = await chatService.getMessages(session.chat_id);

        setContentItems(stageContent);
        setStageProgress(summary);
        setChatSession(session);
        setMessages(chatMessages);
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to load stage content and mentor chat."));
      } finally {
        setIsLoadingStage(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadLearningPath();
  }, [loadLearningPath]);

  useEffect(() => {
    if (!activeStageId) {
      setContentItems([]);
      setStageProgress(null);
      setChatSession(null);
      setMessages([]);
      return;
    }

    let isCancelled = false;

    const load = async () => {
      await loadStageExperience(activeStageId);
      if (isCancelled) {
        return;
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [activeStageId, loadStageExperience]);

  const withContentAction = async (
    actionKey: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (!activeStageId) {
      return;
    }

    setActiveContentActionKey(actionKey);
    setErrorMessage(null);

    try {
      const currentScrollY = window.scrollY;
      await action();
      await loadStageExperience(activeStageId);
      if (path?.path_id) {
        await loadPathProgress(path.path_id);
      }
      window.scrollTo({ top: currentScrollY });
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Content action failed."));
    } finally {
      setActiveContentActionKey(null);
    }
  };

  const handleGenerateContent = async () => {
    if (!activeStageId) {
      return;
    }

    setIsGeneratingContent(true);
    setErrorMessage(null);

    try {
      await contentService.generateStageContent({
        stage_id: activeStageId,
        content_count: 8,
      });
      await loadStageExperience(activeStageId);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not generate content for this stage."));
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleStartProgress = async (contentId: number) => {
    await withContentAction(`start-${contentId}`, async () => {
      await contentService.startContentProgress({
        content_id: contentId,
        completion_percentage: 0,
        time_spent_minutes: 0,
        notes: null,
      });
    });
  };

  const handleUpdateProgress = async (
    contentId: number,
    currentProgress: UserContentProgressResponse,
  ) => {
    await withContentAction(`update-${contentId}`, async () => {
      await contentService.updateContentProgress(contentId, {
        completion_percentage: Math.min(95, currentProgress.completion_percentage + 25),
        time_spent_minutes: currentProgress.time_spent_minutes + 10,
        is_completed: false,
      });
    });
  };

  const handleCompleteContent = async (contentId: number) => {
    await withContentAction(`complete-${contentId}`, async () => {
      await contentService.completeContent(contentId);
    });
  };

  const handleGenerateOrViewReport = async () => {
    if (!path?.path_id) return;
    setIsGeneratingReport(true);
    setErrorMessage(null);
    try {
      await progressService.createPathCompletionReport(path.path_id);
      const report = await progressService.getPathCompletionReport(path.path_id);
      setPathReport(report);
      setIsReportModalOpen(true);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Could not generate or load path completion report."));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const isPathComplete =
    pathProgress &&
    pathProgress.totalContentItems > 0 &&
    pathProgress.completedItems >= pathProgress.totalContentItems;

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed || !chatSession) {
      return;
    }

    setIsSendingMessage(true);
    setErrorMessage(null);

    try {
      setChatInput("");
      await chatService.sendMessage(chatSession.chat_id, trimmed);
      const chatMessages = await chatService.getMessages(chatSession.chat_id);
      setMessages(chatMessages);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "Failed to send mentor message."));
      setChatInput(trimmed);
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (isLoadingPath) {
    return (
      <Panel className="p-10 text-center">
        <div className="mx-auto h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading your latest learning path...</p>
      </Panel>
    );
  }

  if (isNoPath) {
    return (
      <Panel className="p-8 lg:p-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center mb-4">
          <BookOpen className="h-6 w-6" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-contrast mb-3">
          No Learning Path Found
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Complete an assessment first so the backend can generate your personalized stages.
        </p>
        <Button onClick={onStartAssessment}>Start Assessment</Button>
      </Panel>
    );
  }

  return (
    <WorkspaceFrame label={<HeroBadge text="Learning path" />} title="Learning Path" className="pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-contrast">
            Learning Path
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {targetTrackName ? (
              <>
                Track: <span className="font-medium text-contrast">{targetTrackName}</span> · Path #
                {path?.path_id ?? "N/A"} · {stages.length} stages
              </>
            ) : (
              <>
                Path #{path?.path_id ?? "N/A"} · {stages.length} stages
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadLearningPath()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Path
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <Button size="sm" variant="ghost" onClick={() => void loadLearningPath()}>
            Retry
          </Button>
        </div>
      )}

      {isPathComplete && path && (
        <div className="rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              You have completed all {pathProgress?.totalContentItems} content items across all stages!
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleGenerateOrViewReport()} isLoading={isGeneratingReport}>
              <FileText className="h-4 w-4 mr-2" />
              {isGeneratingReport ? "Loading..." : "View Learning Report"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/improvement/${path.path_id}`)}
              className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              View Progress Analysis
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/validator?pathId=${path.path_id}`)}
            >
              Start AI Evaluation
            </Button>
          </div>
        </div>
      )}

      {isReportModalOpen && pathReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setIsReportModalOpen(false)}
        >
          <Panel
            className="shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-display text-lg font-semibold text-contrast">
                Path Completion Report
              </h2>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Learning Summary
                </h3>
                <div className="mt-2 text-slate-700 dark:text-gray-300 whitespace-pre-wrap">
                  {pathReport.learningSummary}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.8fr,1fr] gap-6">
        <div className="flex flex-col gap-6">
          <Panel className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Stages
            </div>
            <div className="flex flex-wrap gap-2">
              {stages.map((stage) => {
                const isActive = stage.stage_id === activeStageId;
                return (
                  <button
                    key={stage.stage_id}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      isActive
                        ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                        : "border-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-900"
                    }`}
                    onClick={() => setActiveStageId(stage.stage_id)}
                  >
                    {stage.stage_order}. {stage.stage_name}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-lg font-medium text-contrast">
                  {activeStage?.stage_name ?? "Stage"}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Focus: {activeStage?.focus_area ?? "N/A"}
                </p>
              </div>
              {activeStage && contentItems.length === 0 && (
                <Button onClick={handleGenerateContent} isLoading={isGeneratingContent}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Content
                </Button>
              )}
            </div>

            {stageProgress && (
              <div className="rounded-xl border bg-surface border-border px-4 py-3 text-sm mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Completion
                    </div>
                    <div className="font-semibold text-contrast">
                      {stageProgress.completion_percentage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Completed
                    </div>
                    <div className="font-semibold text-contrast">
                      {stageProgress.completed_items}/{stageProgress.total_content_items}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Time Spent
                    </div>
                    <div className="font-semibold text-contrast">
                      {stageProgress.total_time_spent_minutes}m
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Remaining
                    </div>
                    <div className="font-semibold text-contrast">
                      {stageProgress.estimated_time_remaining}m
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isLoadingStage ? (
              <div className="py-10 text-center">
                <div className="mx-auto h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Loading stage experience...</p>
              </div>
            ) : !activeStage ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  This learning path has no stages yet.
                </p>
              </div>
            ) : contentItems.length > 0 ? (
              <div className="space-y-4">
                {contentItems.map((content) => {
                  const contentProgress = content.progress;
                  const tags = parseTags(content.tags);
                  const updateKey = `update-${content.content_id}`;
                  const completeKey = `complete-${content.content_id}`;
                  const startKey = `start-${content.content_id}`;

                  return (
                    <article
                      key={content.content_id}
                      className="rounded-xl border border-border p-4 bg-white/90 dark:bg-zinc-900/30"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <h3 className="font-medium text-contrast">{content.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {content.description}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="px-2 py-1 rounded-full border border-border text-gray-600 dark:text-gray-300">
                            {content.content_type}
                          </span>
                          <span className="px-2 py-1 rounded-full border border-border text-gray-600 dark:text-gray-300">
                            {content.difficulty_level}
                          </span>
                          {content.estimated_duration !== null && content.estimated_duration !== undefined && (
                            <span className="px-2 py-1 rounded-full border border-border text-gray-600 dark:text-gray-300 flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {content.estimated_duration}m
                            </span>
                          )}
                        </div>
                      </div>

                      {content.content_text && (
                        <div className="rounded-lg border bg-surface border-border px-4 py-3 prose prose-sm text-gray-800 dark:text-gray-100 dark:prose-invert max-w-none">
                          <ReactMarkdown>{content.content_text}</ReactMarkdown>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Order #{content.order_index}</span>
                        <span>·</span>
                        <span>Added {formatDateTime(content.created_at)}</span>
                        {content.source_platform && (
                          <>
                            <span>·</span>
                            <span>Source: {content.source_platform}</span>
                          </>
                        )}
                      </div>

                      {content.url && (
                        <a
                          href={content.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-2 text-sm text-blue-600 dark:text-blue-300 hover:underline"
                        >
                          Open resource
                        </a>
                      )}

                      {tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span
                              key={`${content.content_id}-${tag}`}
                              className="text-[11px] px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 rounded-lg border border-border px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{progressLabel(contentProgress)}</span>
                          {contentProgress && (
                            <span>{contentProgress.time_spent_minutes} minutes tracked</span>
                          )}
                        </div>
                        {contentProgress?.is_completed && (
                          <div className="mt-1 text-green-700 dark:text-green-300 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Completed {formatDateTime(contentProgress.completed_at)}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {!contentProgress && (
                          <Button
                            size="sm"
                            onClick={() => void handleStartProgress(content.content_id)}
                            isLoading={activeContentActionKey === startKey}
                          >
                            Start Tracking
                          </Button>
                        )}

                        {contentProgress && !contentProgress.is_completed && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleUpdateProgress(content.content_id, contentProgress)}
                              isLoading={activeContentActionKey === updateKey}
                            >
                              Update (+25%, +10m)
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleCompleteContent(content.content_id)}
                              isLoading={activeContentActionKey === completeKey}
                            >
                              Mark Complete
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  No content has been generated for this stage yet.
                </p>
                <Button onClick={handleGenerateContent} isLoading={isGeneratingContent}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Stage Content
                </Button>
              </div>
            )}
          </Panel>
        </div>

        <Panel className="flex flex-col min-h-[620px] max-h-[calc(100vh-160px)]">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-contrast">Mentor Chat</div>
              <div className="text-[11px] text-muted-foreground">
                {chatSession ? `Session #${chatSession.chat_id}` : "Loading session..."}
              </div>
            </div>
          </div>

          <div
            ref={chatMessagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                Start the conversation for this stage to get mentor guidance.
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.sender.toLowerCase() === "user";
                return (
                  <div
                    key={message.message_id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                        isUser
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 rounded-bl-none"
                      }`}
                    >
                      {isUser ? (
                        message.message_text
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{message.message_text}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {isSendingMessage && (
              <div className="text-xs text-muted-foreground">Mentor is responding...</div>
            )}
          </div>

          <div className="p-4 border-t border-border">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about this stage..."
                className="flex-1 h-10 px-3 rounded-lg border bg-surface border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                disabled={!chatSession || isSendingMessage}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!chatSession || !chatInput.trim()}
                isLoading={isSendingMessage}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Panel>
      </div>
    </WorkspaceFrame>
  );
};
