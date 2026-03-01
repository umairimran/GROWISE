import { describe, expect, it } from "vitest";
import {
  adaptProgressAssessmentComparison,
  adaptProgressAssessmentHistory,
  adaptProgressDashboardSummary,
  adaptProgressEvaluationHistory,
  adaptProgressTimelineAnalytics,
} from "../../src/api/adapters/progress";

describe("progress adapters", () => {
  it("adapts dashboard summary payload", () => {
    const dashboard = adaptProgressDashboardSummary({
      user: {
        user_id: 7,
        full_name: "Demo Learner",
        email: "demo@growwise.test",
        member_since: "2026-01-01T00:00:00Z",
      },
      tracks: {
        total_selected: 1,
        tracks: [{ track_id: 3, selected_at: "2026-02-10T00:00:00Z" }],
      },
      assessments: {
        total_completed: 4,
        latest_result: { score: 84.2, level: "intermediate", date: "2026-02-20T00:00:00Z" },
      },
      learning: {
        total_learning_paths: 1,
        total_content_items: 8,
        completed_items: 3,
        completion_percentage: 37,
        total_time_hours: 5.5,
      },
      evaluations: {
        total_completed: 2,
      },
      skill_profile: {
        strengths: "Debugging,Testing",
        weaknesses: "System Design",
        thinking_pattern: "Structured",
      },
    });

    expect(dashboard.user.fullName).toBe("Demo Learner");
    expect(dashboard.assessments.latestResult?.score).toBe(84.2);
    expect(dashboard.learning.completedItems).toBe(3);
    expect(dashboard.skillProfile?.strengths).toEqual(["Debugging", "Testing"]);
  });

  it("adapts timeline analytics payload", () => {
    const timeline = adaptProgressTimelineAnalytics({
      period_days: 30,
      total_events: 2,
      timeline: [
        {
          type: "assessment",
          date: "2026-02-01T10:00:00Z",
          details: { session_id: 1, score: 81.2 },
        },
        {
          type: "content_progress",
          date: "2026-02-02T10:00:00Z",
          details: { content_id: 10 },
        },
      ],
    });

    expect(timeline.periodDays).toBe(30);
    expect(timeline.totalEvents).toBe(2);
    expect(timeline.timeline[0].type).toBe("assessment");
    expect(timeline.timeline[1].type).toBe("content_progress");
  });

  it("adapts assessment history and comparison payloads", () => {
    const history = adaptProgressAssessmentHistory({
      total_attempts: 2,
      history: [
        {
          session_id: 101,
          track_id: 4,
          track_name: "Frontend",
          attempt_date: "2026-02-10T00:00:00Z",
          score: 62.1,
          detected_level: "beginner",
        },
        {
          session_id: 102,
          track_id: 4,
          track_name: "Frontend",
          attempt_date: "2026-02-20T00:00:00Z",
          score: 74.9,
          detected_level: "intermediate",
        },
      ],
      improvement: {
        first_attempt_score: 62.1,
        latest_attempt_score: 74.9,
        improvement_percentage: 20.61,
        level_progression: "beginner -> intermediate",
      },
    });

    const comparison = adaptProgressAssessmentComparison({
      attempt_1: {
        date: "2026-02-10T00:00:00Z",
        overall_score: 62.1,
        detected_level: "beginner",
        questions_answered: 12,
        average_question_score: 0.62,
      },
      attempt_2: {
        date: "2026-02-20T00:00:00Z",
        overall_score: 74.9,
        detected_level: "intermediate",
        questions_answered: 12,
        average_question_score: 0.75,
      },
      improvement: {
        score_change: 12.8,
        percentage_improvement: 20.61,
        level_change: "beginner -> intermediate",
        time_between_attempts: "10 days",
      },
    });

    expect(history.totalAttempts).toBe(2);
    expect(history.improvement?.levelProgression).toContain("intermediate");
    expect(comparison.improvement.levelChange).toContain("intermediate");
    expect(comparison.attempt2.overallScore).toBe(74.9);
  });

  it("adapts evaluation history payload", () => {
    const history = adaptProgressEvaluationHistory({
      total_evaluations: 2,
      history: [
        {
          evaluation_id: 301,
          track_name: "Backend Engineering",
          attempt_date: "2026-02-15T10:00:00Z",
          completed_date: "2026-02-15T10:25:00Z",
          reasoning_score: 0.72,
          problem_solving_score: 0.68,
          readiness_level: "junior",
          final_feedback: "Good fundamentals.",
        },
        {
          evaluation_id: 302,
          track_name: "Backend Engineering",
          attempt_date: "2026-02-28T10:00:00Z",
          completed_date: "2026-02-28T10:32:00Z",
          reasoning_score: 0.83,
          problem_solving_score: 0.79,
          readiness_level: "mid",
          final_feedback: "Clear improvement.",
        },
      ],
      progression: {
        first_evaluation: {
          date: "2026-02-15T10:00:00Z",
          reasoning_score: 0.72,
          problem_solving: 0.68,
          readiness: "junior",
        },
        latest_evaluation: {
          date: "2026-02-28T10:00:00Z",
          reasoning_score: 0.83,
          problem_solving: 0.79,
          readiness: "mid",
        },
        improvement: {
          reasoning_improvement: 0.11,
          problem_solving_improvement: 0.11,
          readiness_progression: "junior -> mid",
        },
      },
    });

    expect(history.totalEvaluations).toBe(2);
    expect(history.history[0].evaluationId).toBe(301);
    expect(history.history[1].problemSolvingScore).toBe(0.79);
    expect(history.progression?.improvement.readinessProgression).toContain("mid");
  });
});

