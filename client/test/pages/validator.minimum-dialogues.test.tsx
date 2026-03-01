// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Validator } from "../../pages/Validator";
import type {
  EvaluationDialogueResponse,
  EvaluationResultResponse,
  EvaluationSessionResponse,
} from "../../api/services/evaluation";
import type { ProgressEvaluationHistory } from "../../api/services/progress";

const evaluationMocks = vi.hoisted(() => ({
  getMySessions: vi.fn(),
  getSession: vi.fn(),
  getDialogues: vi.fn(),
  getResult: vi.fn(),
  complete: vi.fn(),
  createSession: vi.fn(),
  respond: vi.fn(),
}));

const progressMocks = vi.hoisted(() => ({
  getEvaluationHistory: vi.fn(),
}));

vi.mock("../../api/services/evaluation", () => ({
  evaluationService: {
    getMySessions: evaluationMocks.getMySessions,
    getSession: evaluationMocks.getSession,
    getDialogues: evaluationMocks.getDialogues,
    getResult: evaluationMocks.getResult,
    complete: evaluationMocks.complete,
    createSession: evaluationMocks.createSession,
    respond: evaluationMocks.respond,
  },
}));

vi.mock("../../api/services/progress", () => ({
  progressService: {
    getEvaluationHistory: progressMocks.getEvaluationHistory,
  },
}));

const inProgressSession: EvaluationSessionResponse = {
  evaluation_id: 901,
  user_id: 11,
  path_id: 77,
  status: "in_progress",
  started_at: "2026-03-01T00:00:00Z",
  completed_at: null,
};

const completedSession: EvaluationSessionResponse = {
  ...inProgressSession,
  status: "completed",
  completed_at: "2026-03-01T00:20:00Z",
};

const makeDialogues = (count: number): EvaluationDialogueResponse[] =>
  Array.from({ length: count }, (_, index) => ({
    dialogue_id: index + 1,
    evaluation_id: 901,
    sequence_no: index + 1,
    speaker: index % 2 === 0 ? "ai" : "user",
    message_text: `Dialogue ${index + 1}`,
    timestamp: `2026-03-01T00:0${index}:00Z`,
  }));

const historyFixture: ProgressEvaluationHistory = {
  totalEvaluations: 1,
  history: [
    {
      evaluationId: 900,
      trackName: "Backend Engineering",
      attemptDate: "2026-02-20T00:00:00Z",
      completedDate: "2026-02-20T00:30:00Z",
      reasoningScore: 0.7,
      problemSolvingScore: 0.68,
      readinessLevel: "junior",
      finalFeedback: "Keep improving.",
    },
  ],
  progression: null,
};

const resultFixture: EvaluationResultResponse = {
  result_id: 77,
  evaluation_id: 901,
  reasoning_score: "0.82",
  problem_solving: "0.79",
  readiness_level: "mid",
  final_feedback: "Great progress.",
  generated_at: "2026-03-01T00:25:00Z",
};

describe("validator minimum dialogue threshold", () => {
  beforeEach(() => {
    cleanup();
    evaluationMocks.getMySessions.mockReset();
    evaluationMocks.getSession.mockReset();
    evaluationMocks.getDialogues.mockReset();
    evaluationMocks.getResult.mockReset();
    evaluationMocks.complete.mockReset();
    evaluationMocks.createSession.mockReset();
    evaluationMocks.respond.mockReset();
    progressMocks.getEvaluationHistory.mockReset();
  });

  it("disables completion while dialogue count is below threshold", async () => {
    evaluationMocks.getMySessions.mockResolvedValueOnce([inProgressSession]);
    evaluationMocks.getDialogues.mockResolvedValueOnce(makeDialogues(2));
    progressMocks.getEvaluationHistory.mockResolvedValueOnce(historyFixture);

    render(<Validator />);

    await waitFor(() => {
      expect(evaluationMocks.getMySessions).toHaveBeenCalledTimes(1);
      expect(evaluationMocks.getDialogues).toHaveBeenCalledTimes(1);
    });

    const completeButton = screen.getByRole("button", { name: "Complete Evaluation" });
    expect((completeButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 more message required/i)).toBeTruthy();
  });

  it("allows completion at threshold and retrieves latest result payload", async () => {
    evaluationMocks.getMySessions
      .mockResolvedValueOnce([inProgressSession])
      .mockResolvedValueOnce([completedSession]);
    evaluationMocks.getDialogues
      .mockResolvedValueOnce(makeDialogues(3))
      .mockResolvedValueOnce(makeDialogues(3));
    evaluationMocks.complete.mockResolvedValueOnce(resultFixture);
    evaluationMocks.getResult.mockResolvedValueOnce(resultFixture);
    progressMocks.getEvaluationHistory
      .mockResolvedValueOnce(historyFixture)
      .mockResolvedValueOnce(historyFixture);

    render(<Validator />);

    await waitFor(() => {
      expect(evaluationMocks.getDialogues).toHaveBeenCalledTimes(1);
    });

    const completeButton = screen.getByRole("button", { name: "Complete Evaluation" });
    expect((completeButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(evaluationMocks.complete).toHaveBeenCalledWith(901);
      expect(evaluationMocks.getResult).toHaveBeenCalledWith(901);
      expect(screen.getByText(/Great progress\./i)).toBeTruthy();
    });
  });
});
