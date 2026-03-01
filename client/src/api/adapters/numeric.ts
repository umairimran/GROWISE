import type { components } from "../generated";

export type DecimalLike = string | number | null | undefined;

export const parseDecimal = (value: DecimalLike): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseDecimalOr = (value: DecimalLike, fallback: number = 0): number => {
  const parsed = parseDecimal(value);
  return parsed ?? fallback;
};

export const formatDecimal = (value: DecimalLike, fractionDigits: number = 2): string => {
  const parsed = parseDecimal(value);
  if (parsed === null) {
    return (0).toFixed(fractionDigits);
  }

  return parsed.toFixed(fractionDigits);
};

export interface AssessmentScoreMetrics {
  overallScore: number | null;
  answerScore: number | null;
}

export interface EvaluationScoreMetrics {
  reasoningScore: number | null;
  problemSolvingScore: number | null;
}

export const adaptDimensionWeight = (
  dimension: Pick<components["schemas"]["AssessmentDimensionResponse"], "weight">,
): number => parseDecimalOr(dimension.weight);

export const adaptAssessmentScoreMetrics = (
  result: Pick<components["schemas"]["AssessmentResultResponse"], "overall_score">,
  response?: Pick<components["schemas"]["AssessmentResponseResponse"], "ai_score">,
): AssessmentScoreMetrics => ({
  overallScore: parseDecimal(result.overall_score),
  answerScore: parseDecimal(response?.ai_score),
});

export const adaptEvaluationScoreMetrics = (
  result: Pick<components["schemas"]["EvaluationResultResponse"], "reasoning_score" | "problem_solving">,
): EvaluationScoreMetrics => ({
  reasoningScore: parseDecimal(result.reasoning_score),
  problemSolvingScore: parseDecimal(result.problem_solving),
});

export const adaptDecimalSeries = <T extends Record<string, unknown>, K extends keyof T>(
  items: T[],
  valueKey: K,
): Array<Omit<T, K> & Record<K, number | null>> =>
  items.map((item) => ({
    ...item,
    [valueKey]: parseDecimal(item[valueKey] as DecimalLike),
  })) as Array<Omit<T, K> & Record<K, number | null>>;
