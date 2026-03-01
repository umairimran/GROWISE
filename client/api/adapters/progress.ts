const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return fallback;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

const toString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const toNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const normalizeArrowText = (value: string): string => value.replace(/â†’/g, "→");

const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toString(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
};

export interface ProgressDashboardTrack {
  trackId: number;
  selectedAt: string | null;
}

export interface ProgressDashboardAssessmentResult {
  score: number | null;
  level: string | null;
  date: string | null;
}

export interface ProgressDashboardEvaluationResult {
  reasoningScore: number | null;
  problemSolving: number | null;
  readinessLevel: string | null;
  date: string | null;
}

export interface ProgressDashboardSkillProfile {
  strengths: string[];
  weaknesses: string[];
  thinkingPattern: string | null;
}

export interface ProgressDashboardSummary {
  user: {
    userId: number | null;
    fullName: string;
    email: string;
    memberSince: string | null;
  };
  tracks: {
    totalSelected: number;
    tracks: ProgressDashboardTrack[];
  };
  assessments: {
    totalCompleted: number;
    latestResult: ProgressDashboardAssessmentResult | null;
  };
  learning: {
    totalLearningPaths: number;
    totalContentItems: number;
    completedItems: number;
    completionPercentage: number;
    totalTimeHours: number;
  };
  evaluations: {
    totalCompleted: number;
    latestResult: ProgressDashboardEvaluationResult | null;
  };
  skillProfile: ProgressDashboardSkillProfile | null;
}

export type ProgressTimelineEventType =
  | "content_progress"
  | "assessment"
  | "evaluation"
  | "unknown";

export interface ProgressTimelineEvent {
  type: ProgressTimelineEventType;
  date: string | null;
  details: Record<string, unknown>;
}

export interface ProgressTimelineAnalytics {
  periodDays: number;
  startDate: string | null;
  endDate: string | null;
  totalEvents: number;
  timeline: ProgressTimelineEvent[];
}

export interface ProgressAssessmentHistoryItem {
  sessionId: number;
  trackId: number | null;
  trackName: string;
  attemptDate: string | null;
  completedDate: string | null;
  score: number | null;
  detectedLevel: string;
  aiReasoning: string | null;
}

export interface ProgressAssessmentHistoryImprovement {
  firstAttemptScore: number;
  latestAttemptScore: number;
  improvementPercentage: number;
  levelProgression: string;
}

export interface ProgressAssessmentHistory {
  totalAttempts: number;
  history: ProgressAssessmentHistoryItem[];
  improvement: ProgressAssessmentHistoryImprovement | null;
}

export interface ProgressEvaluationHistoryItem {
  evaluationId: number;
  trackName: string;
  attemptDate: string | null;
  completedDate: string | null;
  reasoningScore: number | null;
  problemSolvingScore: number | null;
  readinessLevel: string | null;
  finalFeedback: string | null;
}

export interface ProgressEvaluationHistoryProgressionSnapshot {
  date: string | null;
  reasoningScore: number | null;
  problemSolvingScore: number | null;
  readiness: string | null;
}

export interface ProgressEvaluationHistoryProgression {
  firstEvaluation: ProgressEvaluationHistoryProgressionSnapshot;
  latestEvaluation: ProgressEvaluationHistoryProgressionSnapshot;
  improvement: {
    reasoningImprovement: number | null;
    problemSolvingImprovement: number | null;
    readinessProgression: string | null;
  };
}

export interface ProgressEvaluationHistory {
  totalEvaluations: number;
  history: ProgressEvaluationHistoryItem[];
  progression: ProgressEvaluationHistoryProgression | null;
}

export interface ProgressAssessmentComparisonAttempt {
  date: string | null;
  overallScore: number | null;
  detectedLevel: string | null;
  questionsAnswered: number;
  averageQuestionScore: number | null;
}

export interface ProgressAssessmentComparisonImprovement {
  scoreChange: number | null;
  percentageImprovement: number | null;
  levelChange: string | null;
  timeBetweenAttempts: string | null;
}

export interface ProgressAssessmentComparison {
  attempt1: ProgressAssessmentComparisonAttempt;
  attempt2: ProgressAssessmentComparisonAttempt;
  improvement: ProgressAssessmentComparisonImprovement;
}

const adaptDashboardAssessmentResult = (value: unknown): ProgressDashboardAssessmentResult | null => {
  const input = toRecord(value);
  if (Object.keys(input).length === 0) {
    return null;
  }

  return {
    score: toNullableNumber(input.score),
    level: toNullableString(input.level),
    date: toNullableString(input.date),
  };
};

const adaptDashboardEvaluationResult = (value: unknown): ProgressDashboardEvaluationResult | null => {
  const input = toRecord(value);
  if (Object.keys(input).length === 0) {
    return null;
  }

  return {
    reasoningScore: toNullableNumber(input.reasoning_score),
    problemSolving: toNullableNumber(input.problem_solving),
    readinessLevel: toNullableString(input.readiness_level),
    date: toNullableString(input.date),
  };
};

export const adaptProgressDashboardSummary = (payload: unknown): ProgressDashboardSummary => {
  const root = toRecord(payload);
  const user = toRecord(root.user);
  const tracks = toRecord(root.tracks);
  const assessments = toRecord(root.assessments);
  const learning = toRecord(root.learning);
  const evaluations = toRecord(root.evaluations);
  const skillProfile = toRecord(root.skill_profile);

  return {
    user: {
      userId: toNullableNumber(user.user_id),
      fullName: toString(user.full_name),
      email: toString(user.email),
      memberSince: toNullableString(user.member_since),
    },
    tracks: {
      totalSelected: toNumber(tracks.total_selected),
      tracks: toArray(tracks.tracks).map((track): ProgressDashboardTrack => {
        const item = toRecord(track);
        return {
          trackId: toNumber(item.track_id),
          selectedAt: toNullableString(item.selected_at),
        };
      }),
    },
    assessments: {
      totalCompleted: toNumber(assessments.total_completed),
      latestResult: adaptDashboardAssessmentResult(assessments.latest_result),
    },
    learning: {
      totalLearningPaths: toNumber(learning.total_learning_paths),
      totalContentItems: toNumber(learning.total_content_items),
      completedItems: toNumber(learning.completed_items),
      completionPercentage: toNumber(learning.completion_percentage),
      totalTimeHours: toNumber(learning.total_time_hours),
    },
    evaluations: {
      totalCompleted: toNumber(evaluations.total_completed),
      latestResult: adaptDashboardEvaluationResult(evaluations.latest_result),
    },
    skillProfile:
      Object.keys(skillProfile).length === 0
        ? null
        : {
            strengths: toStringList(skillProfile.strengths),
            weaknesses: toStringList(skillProfile.weaknesses),
            thinkingPattern: toNullableString(skillProfile.thinking_pattern),
          },
  };
};

export const adaptProgressTimelineAnalytics = (payload: unknown): ProgressTimelineAnalytics => {
  const root = toRecord(payload);

  return {
    periodDays: toNumber(root.period_days, 30),
    startDate: toNullableString(root.start_date),
    endDate: toNullableString(root.end_date),
    totalEvents: toNumber(root.total_events),
    timeline: toArray(root.timeline).map((event): ProgressTimelineEvent => {
      const item = toRecord(event);
      const eventType = toString(item.type);
      const type: ProgressTimelineEventType =
        eventType === "content_progress" || eventType === "assessment" || eventType === "evaluation"
          ? eventType
          : "unknown";

      return {
        type,
        date: toNullableString(item.date),
        details: toRecord(item.details),
      };
    }),
  };
};

export const adaptProgressAssessmentHistory = (payload: unknown): ProgressAssessmentHistory => {
  const root = toRecord(payload);
  const improvement = toRecord(root.improvement);

  return {
    totalAttempts: toNumber(root.total_attempts),
    history: toArray(root.history).map((entry): ProgressAssessmentHistoryItem => {
      const item = toRecord(entry);
      return {
        sessionId: toNumber(item.session_id),
        trackId: toNullableNumber(item.track_id),
        trackName: toString(item.track_name),
        attemptDate: toNullableString(item.attempt_date),
        completedDate: toNullableString(item.completed_date),
        score: toNullableNumber(item.score),
        detectedLevel: toString(item.detected_level),
        aiReasoning: toNullableString(item.ai_reasoning),
      };
    }),
    improvement:
      Object.keys(improvement).length === 0
        ? null
        : {
            firstAttemptScore: toNumber(improvement.first_attempt_score),
            latestAttemptScore: toNumber(improvement.latest_attempt_score),
            improvementPercentage: toNumber(improvement.improvement_percentage),
            levelProgression: normalizeArrowText(toString(improvement.level_progression)),
          },
  };
};

const adaptEvaluationProgressionSnapshot = (
  payload: unknown,
): ProgressEvaluationHistoryProgressionSnapshot => {
  const input = toRecord(payload);

  return {
    date: toNullableString(input.date),
    reasoningScore: toNullableNumber(input.reasoning_score),
    problemSolvingScore: toNullableNumber(input.problem_solving),
    readiness: toNullableString(input.readiness),
  };
};

export const adaptProgressEvaluationHistory = (payload: unknown): ProgressEvaluationHistory => {
  const root = toRecord(payload);
  const progression = toRecord(root.progression);
  const improvement = toRecord(progression.improvement);

  return {
    totalEvaluations: toNumber(root.total_evaluations),
    history: toArray(root.history).map((entry): ProgressEvaluationHistoryItem => {
      const item = toRecord(entry);
      return {
        evaluationId: toNumber(item.evaluation_id),
        trackName: toString(item.track_name),
        attemptDate: toNullableString(item.attempt_date),
        completedDate: toNullableString(item.completed_date),
        reasoningScore: toNullableNumber(item.reasoning_score),
        problemSolvingScore: toNullableNumber(item.problem_solving_score),
        readinessLevel: toNullableString(item.readiness_level),
        finalFeedback: toNullableString(item.final_feedback),
      };
    }),
    progression:
      Object.keys(progression).length === 0
        ? null
        : {
            firstEvaluation: adaptEvaluationProgressionSnapshot(progression.first_evaluation),
            latestEvaluation: adaptEvaluationProgressionSnapshot(progression.latest_evaluation),
            improvement: {
              reasoningImprovement: toNullableNumber(improvement.reasoning_improvement),
              problemSolvingImprovement: toNullableNumber(improvement.problem_solving_improvement),
              readinessProgression: toNullableString(
                normalizeArrowText(toString(improvement.readiness_progression)),
              ),
            },
          },
  };
};

const adaptComparisonAttempt = (payload: unknown): ProgressAssessmentComparisonAttempt => {
  const input = toRecord(payload);

  return {
    date: toNullableString(input.date),
    overallScore: toNullableNumber(input.overall_score),
    detectedLevel: toNullableString(input.detected_level),
    questionsAnswered: toNumber(input.questions_answered),
    averageQuestionScore: toNullableNumber(input.average_question_score),
  };
};

export const adaptProgressAssessmentComparison = (payload: unknown): ProgressAssessmentComparison => {
  const root = toRecord(payload);
  const improvement = toRecord(root.improvement);

  return {
    attempt1: adaptComparisonAttempt(root.attempt_1),
    attempt2: adaptComparisonAttempt(root.attempt_2),
    improvement: {
      scoreChange: toNullableNumber(improvement.score_change),
      percentageImprovement: toNullableNumber(improvement.percentage_improvement),
      levelChange: toNullableString(normalizeArrowText(toString(improvement.level_change))),
      timeBetweenAttempts: toNullableString(improvement.time_between_attempts),
    },
  };
};
