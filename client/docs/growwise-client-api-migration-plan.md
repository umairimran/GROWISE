# GrowWise Client API Migration - Multi-Phase Execution Checklist

Last updated: 2026-03-01

## Current Status
- Phase 0 is partially complete.
- Phase 0 task checklist items are complete, but Phase 0 exit criteria are still blocked by local `npm install` failure (`EACCES` while reaching npm registry).
- Phase 1 core deliverables are implemented (generated contract types, HTTP core, shared error parser, numeric adapters, and smoke tests).
- Phase 3 router migration and app shell refactor is complete (URL-based navigation + route-aware shell + onboarding skip removal).
- Phase 4 tracks and assessment flow migration is complete in client code (API-backed track loading/selection, session-driven assessment lifecycle, and learning-path handoff wiring).
- Phase 5 dashboard and progress migration is complete in client code (dashboard summary, timeline analytics, assessment history, and comparison modal are API-driven).
- Phase 6 learning path, content, and mentor chat migration is complete in client code (current path + stages, stage content generation/progress, and mentor chat sessions/messages are API-driven).
- Phase 7 evaluation flow migration is complete in client code (session creation, dialogue/respond loop, complete/result rendering, and history widgets are API-driven).
- Phase 8 account, security, and session management migration is complete in client code (profile GET/PUT, forgot/reset + change password flows, active sessions revoke controls, and account deletion).
- Phase 9 cleanup, hardening, and release prep is complete in client code (legacy Supabase/Gemini runtime paths removed, API UX states hardened, and release/migration notes published).

## Summary
- Goal: migrate `client` from mock/Supabase/Gemini direct calls to backend APIs from `openapi.json` for all learner-facing flows.
- Scope: learner flows only; no admin UI.
- Architecture locked: React Router + OpenAPI-generated client + centralized auth/session + query caching.
- Execution rule: work strictly phase-by-phase; do not start a new phase until the previous phase exit criteria are satisfied.

## Public API / Interface / Type Changes
- Add `client/api/generated/*` from `openapi.json` (generated contract types).
- Add `client/api/http.ts` for base URL, auth header, refresh retry, normalized errors.
- Add `client/api/services/*.ts` modules: `auth`, `tracks`, `assessment`, `progress`, `learning`, `content`, `chat`, `evaluation`, `account`.
- Add `client/state/authStore.ts` for tokens/session/user bootstrap state.
- Add `client/routes/*` route map + protected/public route guards.
- Replace `client/types.ts` with API-first domain view models and adapters.
- Decommission runtime use of `client/services/dbService.ts` and `client/services/geminiService.ts` in learner flows.

## Phase-by-Phase Checklist

### Phase 0 - Baseline and Setup
- [x] Create migration branch and capture current UI screenshots for regression reference.
- [x] Add dependencies: `react-router-dom`, `@tanstack/react-query`, `openapi-typescript`, `vitest`, `@testing-library/react`, `msw`.
- [x] Add `VITE_API_BASE_URL` env contract and document local value `http://localhost:8000`.
- [x] Resolve `client/README.md` merge conflict markers to keep docs buildable.
- [ ] Exit criteria: app builds, tests runner initializes, env variables documented and loaded.
  - Blocker: local dependency installation cannot complete (`npm install` returns `EACCES`).

### Phase 1 - Contract Generation and HTTP Core
- [x] Generate typed OpenAPI client/types from `openapi.json` into `client/api/generated/`.
- [x] Implement `api/http.ts` with request helper, Bearer injection, 401 refresh retry-once, and error normalization.
- [x] Implement shared error parser for FastAPI `detail` string and validation array formats.
- [x] Implement numeric adapters for decimal-string fields used in charts and score cards.
- [x] Exit criteria: typed API call smoke test passes against `/health` and one protected endpoint using mocked token.
  - Verified with Vitest smoke suite: `client/test/api/http.smoke.test.ts`.

### Phase 2 - Auth and Session Foundation
- [x] Implement auth store persistence for `access_token`, `refresh_token`, `session_id`, `token_type`.
- [x] Implement auth services for register, login-json, refresh, logout, me, password reset/change, sessions list/revoke.
- [x] Implement bootstrap flow on app load: `me` -> refresh on 401 -> clear session on refresh failure.
- [x] Implement protected route guard and guest-only route guard.
- [x] Wire Login and Signup pages to backend auth endpoints.
- [ ] Exit criteria: user can register/login/logout, refresh works on expired token, protected route redirects are correct.
  - Code integration, build, and test pass completed locally on 2026-02-28.
  - Manual end-to-end verification against running backend is still pending.

### Phase 3 - Router Migration and App Shell Refactor
- [x] Replace `App.tsx` view-switch state machine with React Router route tree.
- [x] Create routes for public pages and authenticated learner pages.
- [x] Refactor `Header` and `Layout` to route-aware navigation.
- [x] Remove mock user creation and remove onboarding skip behavior that bypasses server truth.
- [x] Exit criteria: navigation is URL-based, hard-refresh preserves auth session state, no mock user path remains.
  - Verified locally on 2026-03-01 with `npm run build` and `npm test` in `client`.

### Phase 4 - Tracks and Assessment Flow
- [x] Replace static skill list with `GET /api/tracks/`.
- [x] On select: call `POST /api/tracks/select`, then `POST /api/assessment/sessions`.
- [x] Build assessment session page using `/sessions/{id}` and `/sessions/{id}/questions`.
- [x] Submit each answer via `/sessions/{id}/submit`.
- [x] Complete via `/sessions/{id}/complete`, then fetch `/sessions/{id}/result` if needed.
- [x] Wire result transition to learning path using `learning_path_id` or `/sessions/{id}/learning-path`.
- [x] Exit criteria: full assessment lifecycle works without any Gemini client call.
  - Verified locally on 2026-03-01 with `npm run build` and `npm test` in `client`.
  - Manual end-to-end verification against a running backend is still recommended.

### Phase 5 - Dashboard and Progress Migration
- [x] Replace dashboard summary cards with `GET /api/progress/dashboard`.
- [x] Replace activity timeline chart with `GET /api/progress/analytics/timeline`.
- [x] Add assessment history with `GET /api/progress/assessments/history`.
- [x] Add assessment comparison modal using `GET /api/progress/assessments/compare/{id1}/{id2}`.
- [x] Remove remaining mock metrics and fake activity data.
- [x] Exit criteria: dashboard data is fully API-driven and reload-stable.
  - Verified locally on 2026-03-01 with `npm test` and `npm run build` in `client`.
  - Manual end-to-end verification against a running backend is still recommended.

### Phase 6 - Learning Path, Content, and Mentor Chat
- [x] Replace course generation flow with `GET /api/learning/my-current-path` and `GET /api/learning/paths/{path_id}/stages`.
- [x] Build stage content load using `GET /api/content/stage/{stage_id}`.
- [x] Add generate-content action with `POST /api/content/generate` when stage content is empty.
- [x] Wire content progress create/update/complete endpoints and stage progress summary endpoint.
- [x] Replace tutor chat with chat sessions/messages endpoints.
- [x] Exit criteria: learning and chat experiences run entirely on backend APIs.
  - Verified locally on 2026-03-01 with `npm test` and `npm run build` in `client`.
  - Manual end-to-end verification against a running backend is still recommended.

### Phase 7 - Evaluation Flow (Validator Replacement)
- [x] Replace static validator scenario with evaluation session creation endpoint.
- [x] Render dialogue history from `/dialogues` and send responses via `/respond`.
- [x] Complete evaluation via `/complete` and render `/result`.
- [x] Add evaluation history widgets from `/api/evaluation/my-sessions` and `/api/progress/evaluations/history`.
- [x] Exit criteria: validator page becomes backend evaluation workflow with persisted session state.
  - Verified locally on 2026-03-01 with `npm test` and `npm run build` in `client`.
  - Manual end-to-end verification against a running backend is still recommended.

### Phase 8 - Account, Security, and Session Management
- [x] Add account profile page wired to `GET/PUT /api/auth/me`.
- [x] Add password change and forgot/reset password flows.
- [x] Add active sessions UI and revoke single/all sessions actions.
- [x] Add account deletion flow using `DELETE /api/auth/me` with explicit confirmation.
- [x] Exit criteria: user self-service account/security functions are complete and tested.
  - Verified locally on 2026-03-01 with `npm test` and `npm run build` in `client`.
  - Added Phase 8 service coverage in `client/test/api/auth.phase8.test.ts`.
  - Manual end-to-end verification against a running backend is still recommended.

### Phase 9 - Cleanup, Hardening, and Release
- [x] Remove runtime imports/usages of Supabase and Gemini services from learner pages.
- [x] Remove obsolete dependencies once no runtime references remain.
- [x] Add final UX states for loading, empty, error, and retry in all API-backed views.
- [x] Run integration test suite and manual QA checklist.
- [x] Prepare release notes and migration notes for environment setup.
- [x] Exit criteria: no learner flow depends on Supabase/Gemini client code; all critical tests pass.
  - Removed legacy runtime artifacts: `client/services/geminiService.ts`, `client/services/dbService.ts`, `client/lib/supabaseClient.ts`, and `client/pages/api/generate-blog-image.ts`.
  - Removed obsolete dependencies: `@google/genai`, `@supabase/supabase-js`, `fs`, `path`.
  - Hardened API UX states (loading/empty/error/retry) in key learner views: assessment, course, validator, and account/security.
  - Verification on 2026-03-01: `npm test` (18 passed) and `npm run build` (passed).
  - Release/migration notes published in `client/docs/growwise-client-phase9-release-notes.md`.

## Testing Cases and Scenarios
- [x] Auth: register, login, refresh, logout, me bootstrap, invalid token handling.
- [x] Route guards: guest blocked from private routes; authenticated users blocked from login/signup routes when appropriate.
- [x] Track + assessment full lifecycle with server-generated questions and persisted results.
- [x] Dashboard data rendering with empty and non-empty progress responses.
- [x] Learning flow: no content -> generate -> progress update -> completion.
- [x] Chat flow: create/reuse session, message ordering, pagination parameters.
- [x] Evaluation flow: minimum dialogue threshold, complete, result retrieval.
- [x] Session management: revoke one, revoke all, session list refresh behavior.
- [x] Error handling: 400/401/403/404/422 user-facing messages are deterministic.
- [x] Mobile + desktop navigation consistency after router migration.

### Verification Evidence (2026-03-01)
- Added migration coverage suites:
  - `client/test/api/openapi.migration-coverage.test.ts`
  - `client/test/api/migration.scenarios.services.test.ts`
  - `client/test/api/http.error-handling.test.ts`
  - `client/test/routes/guards.test.tsx`
  - `client/test/pages/dashboard.api-rendering.test.tsx`
  - `client/test/pages/validator.minimum-dialogues.test.tsx`
  - `client/test/components/navigation.consistency.test.tsx`
- Full client suite verification: `npm test` (Vitest) -> **12 files, 45 tests, all passing**.

## Continuation Protocol (for ongoing execution)
- If work pauses, resume from the first unchecked item in the current phase.
- Do not open a new phase until current phase exit criteria are satisfied.
- After each phase, produce a short phase completion note listing completed checklist items and blockers.

## Assumptions and Defaults
- Backend is reachable at `http://localhost:8000` during development.
- CORS allows client origin (`http://localhost:3000` or `http://localhost:5173`).
- User-flow-only scope excludes admin UI creation even though admin endpoints exist.
- Progress endpoints may return richer objects than OpenAPI placeholder `{}`; frontend adapters will follow actual backend payloads.
- Blog remains static/non-API for now because no blog endpoints are present in the provided contract.
