import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type OpenApiDocument = {
  paths: Record<string, Partial<Record<string, unknown>>>;
};

const httpMethods = new Set(["get", "post", "put", "patch", "delete"]);

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(testFileDir, "..", "..");
const repoRoot = path.resolve(clientRoot, "..");
const openApiPath = path.join(repoRoot, "openapi.json");
const servicesDirectory = path.join(clientRoot, "api", "services");

const requiredLearnerOperations = new Set([
  "POST /api/auth/register",
  "POST /api/auth/login-json",
  "POST /api/auth/refresh",
  "POST /api/auth/logout",
  "GET /api/auth/me",
  "PUT /api/auth/me",
  "DELETE /api/auth/me",
  "POST /api/auth/password/change",
  "POST /api/auth/password/reset/request",
  "POST /api/auth/password/reset/confirm",
  "GET /api/auth/sessions",
  "GET /api/auth/sessions/{session_id}",
  "DELETE /api/auth/sessions/{session_id}",
  "DELETE /api/auth/sessions",
  "GET /api/tracks/",
  "GET /api/tracks/{track_id}",
  "POST /api/tracks/select",
  "GET /api/tracks/my-current-track",
  "POST /api/assessment/sessions",
  "GET /api/assessment/sessions/{session_id}",
  "GET /api/assessment/sessions/{session_id}/questions",
  "POST /api/assessment/sessions/{session_id}/submit",
  "POST /api/assessment/sessions/{session_id}/complete",
  "GET /api/assessment/sessions/{session_id}/result",
  "GET /api/assessment/sessions/{session_id}/learning-path",
  "GET /api/progress/dashboard",
  "GET /api/progress/analytics/timeline",
  "GET /api/progress/assessments/history",
  "GET /api/progress/assessments/compare/{session_id_1}/{session_id_2}",
  "GET /api/progress/evaluations/history",
  "GET /api/learning/my-current-path",
  "GET /api/learning/paths/{path_id}/stages",
  "GET /api/content/stage/{stage_id}",
  "POST /api/content/generate",
  "POST /api/content/progress",
  "PUT /api/content/progress/{content_id}",
  "POST /api/content/{content_id}/complete",
  "GET /api/content/stage/{stage_id}/progress",
  "POST /api/chat/sessions",
  "GET /api/chat/my-sessions",
  "GET /api/chat/sessions/{chat_id}/messages",
  "POST /api/chat/sessions/{chat_id}/messages",
  "POST /api/evaluation/sessions",
  "GET /api/evaluation/sessions/{evaluation_id}",
  "GET /api/evaluation/my-sessions",
  "POST /api/evaluation/sessions/{evaluation_id}/respond",
  "GET /api/evaluation/sessions/{evaluation_id}/dialogues",
  "POST /api/evaluation/sessions/{evaluation_id}/complete",
  "GET /api/evaluation/sessions/{evaluation_id}/result",
]);

const readOpenApiOperations = (): Set<string> => {
  const document = JSON.parse(readFileSync(openApiPath, "utf-8")) as OpenApiDocument;
  const operations = new Set<string>();

  Object.entries(document.paths ?? {}).forEach(([operationPath, operationMethods]) => {
    Object.keys(operationMethods ?? {}).forEach((method) => {
      if (!httpMethods.has(method)) {
        return;
      }
      operations.add(`${method.toUpperCase()} ${operationPath}`);
    });
  });

  return operations;
};

const readServiceOperations = (): Set<string> => {
  const operations = new Set<string>();
  const files = readdirSync(servicesDirectory).filter(
    (fileName) => fileName.endsWith(".ts") && fileName !== "client.ts",
  );

  files.forEach((fileName) => {
    const fullPath = path.join(servicesDirectory, fileName);
    const source = readFileSync(fullPath, "utf-8");
    const callRegex = /apiClient\.call\(\s*{([\s\S]*?)}\s*\)/g;
    let match = callRegex.exec(source);

    while (match) {
      const block = match[1];
      const pathMatch = /path:\s*"([^"]+)"/.exec(block);
      const methodMatch = /method:\s*"([a-z]+)"/.exec(block);
      if (pathMatch && methodMatch) {
        operations.add(`${methodMatch[1].toUpperCase()} ${pathMatch[1]}`);
      }

      match = callRegex.exec(source);
    }
  });

  return operations;
};

const collectSourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory);
  const files: string[] = [];

  entries.forEach((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (
        entry === "docs" ||
        entry === "test" ||
        entry === "node_modules" ||
        entry === ".git" ||
        (entry === "generated" && directory.endsWith(`${path.sep}api`))
      ) {
        return;
      }
      files.push(...collectSourceFiles(fullPath));
      return;
    }

    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) {
      return;
    }

    files.push(fullPath);
  });

  return files;
};

describe("API migration OpenAPI coverage", () => {
  it("keeps required learner endpoints present in openapi.json", () => {
    const openApiOperations = readOpenApiOperations();
    const missing = [...requiredLearnerOperations].filter((operation) => !openApiOperations.has(operation));
    expect(missing).toEqual([]);
  });

  it("keeps service operation paths and methods aligned with OpenAPI", () => {
    const openApiOperations = readOpenApiOperations();
    const serviceOperations = readServiceOperations();
    const unknownOperations = [...serviceOperations].filter((operation) => !openApiOperations.has(operation));
    expect(unknownOperations).toEqual([]);
  });

  it("keeps learner migration endpoints fully covered by the service layer", () => {
    const serviceOperations = readServiceOperations();
    const missingServiceCoverage = [...requiredLearnerOperations].filter(
      (operation) => !serviceOperations.has(operation),
    );
    expect(missingServiceCoverage).toEqual([]);
  });
});

describe("API migration runtime guardrails", () => {
  it("prevents direct fetch usage outside api/http.ts", () => {
    const sourceFiles = collectSourceFiles(clientRoot);
    const offenders = sourceFiles
      .filter((fullPath) => !fullPath.endsWith(`${path.sep}api${path.sep}http.ts`))
      .filter((fullPath) => /\bfetch\s*\(/.test(readFileSync(fullPath, "utf-8")))
      .map((fullPath) => path.relative(clientRoot, fullPath));

    expect(offenders).toEqual([]);
  });

  it("prevents legacy Supabase or Gemini runtime references", () => {
    const sourceFiles = collectSourceFiles(clientRoot);
    const legacyPattern = /@supabase\/supabase-js|@google\/genai|geminiService|dbService|supabaseClient/i;
    const offenders = sourceFiles
      .filter((fullPath) => legacyPattern.test(readFileSync(fullPath, "utf-8")))
      .map((fullPath) => path.relative(clientRoot, fullPath));

    expect(offenders).toEqual([]);
  });
});
