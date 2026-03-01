# GrowWise Client Phase 9 Release Notes

Date: 2026-03-01

## Scope
- Finalized client API migration hardening and cleanup for learner flows.
- Removed remaining direct-runtime Gemini/Supabase client usage paths.
- Standardized API UX states across learner-facing API views.

## Shipped Changes
- Reworked `client/pages/Blog.tsx` to static assets mode (no client-side Gemini image generation).
- Added explicit retry actions for API error states in:
  - `client/pages/Assessment.tsx`
  - `client/pages/Course.tsx`
  - `client/pages/Validator.tsx`
  - `client/pages/AccountSecurity.tsx`
- Removed legacy files:
  - `client/services/geminiService.ts`
  - `client/services/dbService.ts`
  - `client/lib/supabaseClient.ts`
  - `client/pages/api/generate-blog-image.ts`
- Cleaned obsolete deps and config references:
  - Removed `@google/genai`, `@supabase/supabase-js`, `fs`, `path` from `client/package.json`
  - Removed related import-map entries in `client/index.html`
  - Removed legacy Gemini env defines in `client/vite.config.ts`

## Environment Migration Notes
- Required env for client:
  - `VITE_API_BASE_URL=http://localhost:8000`
- Removed legacy client env dependency paths:
  - `GEMINI_API_KEY`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Validation Summary
- Automated suite:
  - `npm test` passed (`5` files, `18` tests).
  - `npm run build` passed.
- Build warnings to track separately:
  - `/index.css` unresolved at build time (left for runtime resolution).
  - Large JS chunk warning from Vite/Rollup.

## Manual QA Checklist (Release Gate)
- [ ] Auth bootstrap/login/logout/refresh behavior against live backend
- [ ] Route guards (public vs protected) on hard refresh
- [ ] Track selection + assessment complete lifecycle
- [ ] Dashboard history/comparison interactions
- [ ] Learning path stage load, content generation, progress updates
- [ ] Mentor chat session/message behavior
- [ ] Evaluation session creation/respond/complete/result
- [ ] Account profile/password/session revoke/delete behavior
- [ ] Error-state retry behavior for network/server failures
