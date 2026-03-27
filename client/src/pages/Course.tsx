import { FC, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [courseTab, setCourseTab] = useState<"stages" | "content" | "info">("stages");

  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const courseSidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingSidebarScrollRestore = useRef<number | null>(null);
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

  useLayoutEffect(() => {
    const pending = pendingSidebarScrollRestore.current;
    if (pending === null) {
      return;
    }
    const el = courseSidebarScrollRef.current;
    if (el) {
      el.scrollTop = pending;
    }
    pendingSidebarScrollRestore.current = null;
  }, [contentItems]);

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
      const sidebarScrollTop = courseSidebarScrollRef.current?.scrollTop ?? 0;
      await action();
      // Set before loadStageExperience so when React commits the new contentItems,
      // useLayoutEffect already has the scroll position to restore (avoids a race with loadPathProgress).
      pendingSidebarScrollRestore.current = sidebarScrollTop;
      await loadStageExperience(activeStageId);
      if (path?.path_id) {
        await loadPathProgress(path.path_id);
      }
      window.scrollTo({ top: currentScrollY });
    } catch (error) {
      pendingSidebarScrollRestore.current = null;
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
    <WorkspaceFrame
      title="Learning Path"
      description={targetTrackName
        ? `Track: ${targetTrackName} · Path #${path?.path_id ?? "N/A"} · ${stages.length} stages`
        : `Path #${path?.path_id ?? "N/A"} · ${stages.length} stages`
      }
      actions={
        <Button variant="outline" size="sm" onClick={() => void loadLearningPath()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Path
        </Button>
      }
      className="pb-10"
    >

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
          className="fixed inset-0 top-16 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={() => setIsReportModalOpen(false)}
        >
          <Panel
            className="max-h-[85vh] w-full max-w-2xl !bg-background flex flex-col overflow-hidden border border-border shadow-2xl ring-1 ring-black/10 dark:!bg-zinc-950 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-5 py-4 dark:bg-zinc-950">
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
            <div className="flex-1 space-y-4 overflow-y-auto bg-background px-5 py-4 dark:bg-zinc-950">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Learning Summary
                </h3>
                <div className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-gray-200">
                  {pathReport.learningSummary}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Main content: Chat center + Tabbed sidebar right */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}>
        {/* CENTER: Mentor Chat */}
        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden">
          <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-2 bg-violet-500/5">
            <div className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-contrast">Mentor Chat</div>
              <div className="text-[10px] text-muted-foreground">
                {chatSession ? `Session #${chatSession.chat_id}` : "Loading..."} · {activeStage?.stage_name ?? "Select a stage"}
              </div>
            </div>
          </div>

          <div
            ref={chatMessagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-2"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
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
                      className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm ${
                        isUser
                          ? "bg-violet-500 text-white"
                          : "bg-surface border border-border text-contrast"
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-4 w-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Mentor is responding...
              </div>
            )}
          </div>

          <div className="shrink-0 p-3 border-t border-border">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about this stage..."
                className="flex-1 h-9 px-3 rounded-lg border bg-surface border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40"
                disabled={!chatSession || isSendingMessage}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!chatSession || !chatInput.trim()}
                isLoading={isSendingMessage}
                className="h-9"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>

        {/* RIGHT: Tabbed sidebar */}
        <div className="shrink-0 w-[300px] min-h-0 flex flex-col rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {([
              { key: "stages" as const, label: "Stages", icon: BookOpen },
              { key: "content" as const, label: "Content", icon: FileText },
              { key: "info" as const, label: "Info", icon: TrendingUp },
            ]).map((tab) => {
              const Icon = tab.icon;
              const isActive = courseTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setCourseTab(tab.key)}
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
          <div ref={courseSidebarScrollRef} className="flex-1 overflow-y-auto p-3">
            {/* Stages tab */}
            {courseTab === "stages" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {stages.map((stage) => {
                    const isActive = stage.stage_id === activeStageId;
                    return (
                      <button
                        key={stage.stage_id}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                          isActive
                            ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                            : "border-border text-muted-foreground hover:bg-surface/50 hover:text-contrast"
                        }`}
                        onClick={() => setActiveStageId(stage.stage_id)}
                      >
                        {stage.stage_order}. {stage.stage_name}
                      </button>
                    );
                  })}
                </div>

                {activeStage && (
                  <div className="rounded-lg border border-border p-2.5">
                    <div className="text-xs font-semibold text-contrast">{activeStage.stage_name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Focus: {activeStage.focus_area ?? "N/A"}</div>
                  </div>
                )}

                {stageProgress && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Completion</div>
                      <div className="text-sm font-bold text-contrast">{stageProgress.completion_percentage}%</div>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Items</div>
                      <div className="text-sm font-bold text-contrast">{stageProgress.completed_items}/{stageProgress.total_content_items}</div>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Time</div>
                      <div className="text-sm font-bold text-contrast">{stageProgress.total_time_spent_minutes}m</div>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Remaining</div>
                      <div className="text-sm font-bold text-contrast">{stageProgress.estimated_time_remaining}m</div>
                    </div>
                  </div>
                )}

                {activeStage && contentItems.length === 0 && !isLoadingStage && (
                  <Button onClick={handleGenerateContent} isLoading={isGeneratingContent} className="w-full" size="sm">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Generate Content
                  </Button>
                )}

                {isLoadingStage && (
                  <div className="py-6 text-center">
                    <div className="mx-auto h-6 w-6 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-[10px] text-muted-foreground">Loading stage...</p>
                  </div>
                )}
              </div>
            )}

            {/* Content tab */}
            {courseTab === "content" && (
              <div className="space-y-2">
                {isLoadingStage ? (
                  <div className="py-6 text-center">
                    <div className="mx-auto h-6 w-6 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-[10px] text-muted-foreground">Loading content...</p>
                  </div>
                ) : contentItems.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-[11px] text-muted-foreground mb-2">No content for this stage yet.</p>
                    {activeStage && (
                      <Button onClick={handleGenerateContent} isLoading={isGeneratingContent} size="sm">
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        Generate
                      </Button>
                    )}
                  </div>
                ) : (
                  contentItems.map((content) => {
                    const contentProgress = content.progress;
                    const tags = parseTags(content.tags);
                    const updateKey = `update-${content.content_id}`;
                    const completeKey = `complete-${content.content_id}`;
                    const startKey = `start-${content.content_id}`;

                    return (
                      <article key={content.content_id} className="rounded-lg border border-border p-2.5">
                        <div className="text-xs font-medium text-contrast">{content.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{content.description}</div>

                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{content.content_type}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{content.difficulty_level}</span>
                          {content.estimated_duration != null && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground flex items-center gap-0.5">
                              <Clock3 className="h-2.5 w-2.5" />{content.estimated_duration}m
                            </span>
                          )}
                        </div>

                        {content.content_text && (
                          <div className="mt-2 rounded border border-border bg-surface/50 p-2 text-[11px] prose prose-sm dark:prose-invert max-w-none max-h-[120px] overflow-y-auto">
                            <ReactMarkdown>{content.content_text}</ReactMarkdown>
                          </div>
                        )}

                        {content.url && (
                          <a href={content.url} target="_blank" rel="noreferrer" className="inline-block mt-1 text-[10px] text-blue-400 hover:underline">
                            Open resource
                          </a>
                        )}

                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.map((tag) => (
                              <span key={`${content.content_id}-${tag}`} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-900/20 text-blue-300 border border-blue-900/40">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="font-medium">{progressLabel(contentProgress)}</span>
                          {contentProgress?.is_completed && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {!contentProgress && (
                            <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => void handleStartProgress(content.content_id)} isLoading={activeContentActionKey === startKey}>
                              Start
                            </Button>
                          )}
                          {contentProgress && !contentProgress.is_completed && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => void handleUpdateProgress(content.content_id, contentProgress)} isLoading={activeContentActionKey === updateKey}>
                                +25%
                              </Button>
                              <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={() => void handleCompleteContent(content.content_id)} isLoading={activeContentActionKey === completeKey}>
                                Complete
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {/* Info tab */}
            {courseTab === "info" && (
              <div className="space-y-3">
                {pathProgress && (
                  <div className="rounded-lg border border-border p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Path Progress</div>
                    <div className="text-lg font-bold text-contrast">{pathProgress.overallCompletionPercentage}%</div>
                    <div className="text-[10px] text-muted-foreground">{pathProgress.completedItems}/{pathProgress.totalContentItems} items completed</div>
                    <div className="mt-2 h-1.5 rounded-full bg-contrast/8 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pathProgress.overallCompletionPercentage}%` }} />
                    </div>
                  </div>
                )}

                {isPathComplete && path && (
                  <div className="rounded-lg border border-green-900/40 bg-green-950/20 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-green-300 text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Path Complete!
                    </div>
                    <Button size="sm" className="w-full h-7 text-[10px]" onClick={() => void handleGenerateOrViewReport()} isLoading={isGeneratingReport}>
                      <FileText className="h-3 w-3 mr-1" />
                      View Report
                    </Button>
                    <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" onClick={() => navigate(`/improvement/${path.path_id}`)}>
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Progress Analysis
                    </Button>
                    <Button size="sm" variant="secondary" className="w-full h-7 text-[10px]" onClick={() => navigate(`/validator?pathId=${path.path_id}`)}>
                      Start AI Evaluation
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border border-border p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <div>Path: <span className="text-contrast font-medium">#{path?.path_id ?? "N/A"}</span></div>
                  {targetTrackName && <div>Track: <span className="text-contrast font-medium">{targetTrackName}</span></div>}
                  <div>Stages: <span className="text-contrast font-medium">{stages.length}</span></div>
                </div>

                <Button size="sm" variant="outline" className="w-full" onClick={onStartAssessment}>
                  Choose Different Track
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkspaceFrame>
  );
};
