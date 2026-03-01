// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Dashboard } from "../../pages/Dashboard";
import type {
  ProgressAssessmentHistory,
  ProgressDashboardSummary,
  ProgressTimelineAnalytics,
} from "../../api/services/progress";

const progressMocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getTimeline: vi.fn(),
  getAssessmentHistory: vi.fn(),
  compareAssessments: vi.fn(),
  getEvaluationHistory: vi.fn(),
}));

vi.mock("../../api/services/progress", () => ({
  progressService: {
    getDashboard: progressMocks.getDashboard,
    getTimeline: progressMocks.getTimeline,
    getAssessmentHistory: progressMocks.getAssessmentHistory,
    compareAssessments: progressMocks.compareAssessments,
    getEvaluationHistory: progressMocks.getEvaluationHistory,
  },
}));

vi.mock("../../providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: () => undefined,
  }),
}));

vi.mock("recharts", () => {
  const ResponsiveContainer = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const AreaChart = () => <div data-testid="area-chart" />;

  return {
    ResponsiveContainer,
    AreaChart,
    CartesianGrid: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Area: () => null,
  };
});

const dashboardFixture: ProgressDashboardSummary = {
  user: {
    userId: 99,
    fullName: "API Learner",
    email: "learner@growwise.test",
    memberSince: "2026-01-01T00:00:00Z",
  },
  tracks: {
    totalSelected: 1,
    tracks: [{ trackId: 3, selectedAt: "2026-02-28T00:00:00Z" }],
  },
  assessments: {
    totalCompleted: 4,
    latestResult: {
      score: 84.2,
      level: "intermediate",
      date: "2026-02-28T00:00:00Z",
    },
  },
  learning: {
    totalLearningPaths: 1,
    totalContentItems: 8,
    completedItems: 3,
    completionPercentage: 37,
    totalTimeHours: 5.5,
  },
  evaluations: {
    totalCompleted: 2,
    latestResult: null,
  },
  skillProfile: {
    strengths: ["Testing", "Debugging"],
    weaknesses: ["System Design"],
    thinkingPattern: "Structured",
  },
};

const timelineFixture: ProgressTimelineAnalytics = {
  periodDays: 30,
  startDate: "2026-02-01T00:00:00Z",
  endDate: "2026-03-01T00:00:00Z",
  totalEvents: 2,
  timeline: [
    {
      type: "assessment",
      date: "2026-02-20T10:00:00Z",
      details: { session_id: 2001 },
    },
    {
      type: "content_progress",
      date: "2026-02-21T10:00:00Z",
      details: { content_id: 88 },
    },
  ],
};

const assessmentHistoryFixture: ProgressAssessmentHistory = {
  totalAttempts: 1,
  history: [
    {
      sessionId: 2001,
      trackId: 3,
      trackName: "Frontend",
      attemptDate: "2026-02-20T00:00:00Z",
      completedDate: "2026-02-20T00:10:00Z",
      score: 84.2,
      detectedLevel: "intermediate",
      aiReasoning: "Good progress.",
    },
  ],
  improvement: null,
};

describe("dashboard API rendering states", () => {
  beforeEach(() => {
    progressMocks.getDashboard.mockReset();
    progressMocks.getTimeline.mockReset();
    progressMocks.getAssessmentHistory.mockReset();
    progressMocks.compareAssessments.mockReset();
    progressMocks.getEvaluationHistory.mockReset();
  });

  it("renders non-empty dashboard/timeline/history payloads from backend services", async () => {
    progressMocks.getDashboard.mockResolvedValueOnce(dashboardFixture);
    progressMocks.getTimeline.mockResolvedValueOnce(timelineFixture);
    progressMocks.getAssessmentHistory.mockResolvedValueOnce(assessmentHistoryFixture);

    render(
      <Dashboard
        user={{ id: "99", name: "API Learner", email: "learner@growwise.test", isPro: false }}
        result={null}
        onOpenLearningPath={() => undefined}
        onStartAssessment={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(progressMocks.getDashboard).toHaveBeenCalledTimes(1);
      expect(progressMocks.getTimeline).toHaveBeenCalledTimes(1);
      expect(progressMocks.getAssessmentHistory).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/API-backed progress overview/i)).toBeTruthy();
    expect(screen.getByText(/Completed attempts/i)).toBeTruthy();
    expect(screen.getByText(/Assessment History/i)).toBeTruthy();
    expect(screen.getByTestId("area-chart")).toBeTruthy();
  });

  it("renders deterministic empty states when backend returns no timeline/history data", async () => {
    progressMocks.getDashboard.mockResolvedValueOnce({
      ...dashboardFixture,
      assessments: { totalCompleted: 0, latestResult: null },
      learning: {
        totalLearningPaths: 0,
        totalContentItems: 0,
        completedItems: 0,
        completionPercentage: 0,
        totalTimeHours: 0,
      },
      skillProfile: null,
    } satisfies ProgressDashboardSummary);
    progressMocks.getTimeline.mockResolvedValueOnce({
      ...timelineFixture,
      totalEvents: 0,
      timeline: [],
    } satisfies ProgressTimelineAnalytics);
    progressMocks.getAssessmentHistory.mockResolvedValueOnce({
      totalAttempts: 0,
      history: [],
      improvement: null,
    } satisfies ProgressAssessmentHistory);

    render(
      <Dashboard
        user={{ id: "99", name: "API Learner", email: "learner@growwise.test", isPro: false }}
        result={null}
        onOpenLearningPath={() => undefined}
        onStartAssessment={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(progressMocks.getDashboard).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/No timeline activity yet/i)).toBeTruthy();
    expect(screen.getByText(/No completed assessments yet/i)).toBeTruthy();
    expect(screen.getByText(/Start Assessment/i)).toBeTruthy();
  });
});
