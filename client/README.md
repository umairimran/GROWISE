# GrowWise Client

Frontend for GrowWise learner workflows.

## Phase 0 Status

- Migration branch: `phase0-api-migration`
- Visual regression baseline: `client/docs/regression-baseline-2026-02-28/`
- API base URL contract introduced via `.env.example`

## Prerequisites

- Node.js 20+
- npm

## Environment

Create `.env.local` in `client/` using `.env.example` as reference.

Required for API migration:

- `VITE_API_BASE_URL=http://localhost:8000`

## Run Locally

1. Install dependencies:
   `npm install`
2. Start dev server:
   `npm run dev`
3. Open the app at `http://localhost:3000`

## Useful Commands

- `npm run build` - production build
- `npm run test` - run tests
- `npm run generate:api-types` - regenerate API types from `../openapi.json`

## Notes

- Learner flows are fully API-backed and no longer rely on direct Supabase/Gemini runtime calls.
- Blog remains static until dedicated backend blog endpoints are introduced.
- Phase 9 release/migration notes: `client/docs/growwise-client-phase9-release-notes.md`.
