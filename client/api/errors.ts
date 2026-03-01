export interface ApiValidationIssue {
  location: string;
  message: string;
  code?: string;
}

export interface ParsedApiError {
  message: string;
  issues: ApiValidationIssue[];
  rawDetail?: unknown;
}

const DEFAULT_ERROR_MESSAGE = "Request failed.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toLocation = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "number" || typeof item === "string" ? String(item) : "unknown"))
      .join(".");
  }

  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return "unknown";
};

const parseValidationIssue = (value: unknown): ApiValidationIssue | null => {
  if (!isRecord(value)) {
    return null;
  }

  const msg = typeof value.msg === "string" ? value.msg : typeof value.message === "string" ? value.message : null;
  if (!msg) {
    return null;
  }

  return {
    location: toLocation(value.loc),
    message: msg,
    code: typeof value.type === "string" ? value.type : undefined,
  };
};

const joinIssues = (issues: ApiValidationIssue[]): string =>
  issues.map((issue) => `${issue.location}: ${issue.message}`).join("; ");

export const parseFastApiError = (
  payload: unknown,
  fallbackMessage: string = DEFAULT_ERROR_MESSAGE,
): ParsedApiError => {
  if (typeof payload === "string" && payload.trim()) {
    return {
      message: payload,
      issues: [],
      rawDetail: payload,
    };
  }

  if (!isRecord(payload)) {
    return {
      message: fallbackMessage,
      issues: [],
    };
  }

  const detail = payload.detail;

  if (typeof detail === "string" && detail.trim()) {
    return {
      message: detail,
      issues: [],
      rawDetail: detail,
    };
  }

  if (Array.isArray(detail)) {
    const issues = detail.map(parseValidationIssue).filter((issue): issue is ApiValidationIssue => issue !== null);
    if (issues.length > 0) {
      return {
        message: joinIssues(issues),
        issues,
        rawDetail: detail,
      };
    }

    const detailMessages = detail.filter((item): item is string => typeof item === "string");
    if (detailMessages.length > 0) {
      return {
        message: detailMessages.join("; "),
        issues: [],
        rawDetail: detail,
      };
    }
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return {
      message: payload.message,
      issues: [],
      rawDetail: detail,
    };
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return {
      message: payload.error,
      issues: [],
      rawDetail: detail,
    };
  }

  return {
    message: fallbackMessage,
    issues: [],
    rawDetail: detail,
  };
};
