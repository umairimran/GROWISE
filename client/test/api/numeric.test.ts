import { describe, expect, it } from "vitest";
import {
  adaptAssessmentScoreMetrics,
  adaptDecimalSeries,
  adaptDimensionWeight,
  adaptEvaluationScoreMetrics,
  parseDecimal,
  parseDecimalOr,
} from "../../api/adapters/numeric";

describe("numeric adapters", () => {
  it("parses decimal-like values safely", () => {
    expect(parseDecimal("0.75")).toBe(0.75);
    expect(parseDecimal(0.42)).toBe(0.42);
    expect(parseDecimal("not-a-number")).toBeNull();
    expect(parseDecimalOr(undefined)).toBe(0);
  });

  it("adapts assessment and evaluation score payloads", () => {
    const assessmentScores = adaptAssessmentScoreMetrics(
      { overall_score: "0.86" },
      { ai_score: "0.79" },
    );
    const evaluationScores = adaptEvaluationScoreMetrics({
      reasoning_score: "0.9",
      problem_solving: "0.8",
    });

    expect(assessmentScores.overallScore).toBe(0.86);
    expect(assessmentScores.answerScore).toBe(0.79);
    expect(evaluationScores.reasoningScore).toBe(0.9);
    expect(evaluationScores.problemSolvingScore).toBe(0.8);
  });

  it("converts chart series value fields to numbers", () => {
    const series = adaptDecimalSeries(
      [
        { day: "Mon", score: "0.3" },
        { day: "Tue", score: "0.6" },
      ],
      "score",
    );

    expect(series).toEqual([
      { day: "Mon", score: 0.3 },
      { day: "Tue", score: 0.6 },
    ]);
  });

  it("adapts dimension weight strings", () => {
    expect(adaptDimensionWeight({ weight: "0.25" })).toBe(0.25);
  });
});
