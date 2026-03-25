# GrowWise Frontend Redesign Plan

## Objective

Redesign and harden the entire GrowWise frontend so it feels like one coherent product, works reliably across all pages, and holds up on desktop and mobile without layout, UX, or visual consistency issues.

## Current Audit Summary

### Primary problem

The frontend is not unstyled; it is fragmented. Public pages, auth pages, and learner workflow pages feel like different products.

### Key issues

- Visual language is inconsistent across marketing, auth, and product surfaces.
- Shared primitives are too thin to support a polished system.
- Styling foundation is brittle because theme tokens and Tailwind config live inline in `index.html`.
- Dense pages like Dashboard, Course, and Validator mix strong functionality with weak hierarchy and heavy layout risk.
- Decorative effects are overused in some places and under-supported by system rules.
- Loading, error, empty, success, and navigation states are inconsistent.
- Frontend tests already show stability drift around route-aware page rendering.

## Design Direction

### Product aesthetic

GrowWise should feel like a precision editorial learning workbench:

- refined, technical, confident
- premium without being glossy
- high-clarity typography and hierarchy
- restrained motion
- strong light and dark themes
- fewer visual tricks, better composition

### Visual principles

- One brand language across all pages
- Editorial headings, disciplined product typography
- Clear panel, card, and surface system
- Strong spacing rhythm and alignment rules
- Better contrast and readability in all states
- Mobile-first resilience for dense screens

## Frontend Inventory

### Shared shell and system

- `client/src/App.tsx`
- `client/src/components/Header.tsx`
- `client/src/components/Layout.tsx`
- `client/src/components/Button.tsx`
- `client/src/components/Toast.tsx`
- `client/src/components/ThemeToggle.tsx`
- `client/src/providers/ThemeProvider.tsx`
- `client/index.html`

### Public and auth pages

- `client/src/pages/Home.tsx`
- `client/src/pages/Blog.tsx`
- `client/src/pages/Login.tsx`
- `client/src/pages/Signup.tsx`
- `client/src/pages/ForgotPassword.tsx`
- `client/src/pages/ResetPassword.tsx`
- `client/src/pages/SkillSelection.tsx`

### Learner workflow pages

- `client/src/pages/Assessment.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/Course.tsx`
- `client/src/pages/Validator.tsx`
- `client/src/pages/EvaluationReport.tsx`
- `client/src/pages/ImprovementAnalysis.tsx`
- `client/src/pages/AccountSecurity.tsx`

## Execution Plan

### Phase 1: Foundation and Design System

- Move styling foundations out of `index.html` into a maintainable shared layer.
- Define reusable theme tokens for color, spacing, typography, radius, shadow, borders, and motion.
- Rebuild shared primitives:
  - buttons
  - cards
  - badges
  - alerts
  - inputs and form sections
  - loading, empty, and error states
  - modal and panel patterns
- Standardize shell behavior for header, sidebar, and content containers.

### Phase 2: Public and Auth Surfaces

- Redesign Home to align messaging with the actual product.
- Redesign Blog to match GrowWise branding and remove placeholder/product-mismatch content.
- Redesign Login, Signup, Forgot Password, and Reset Password as one auth family.
- Improve form UX:
  - clearer validation
  - stronger trust signals
  - better success and error feedback
  - better mobile spacing
- Reframe Skill Selection as a meaningful onboarding step, not just a track grid.

### Phase 3: Product Shell and Learner Workflows

- Refactor the logged-in shell before touching deep page layouts.
- Redesign Dashboard with better hierarchy for metrics, history, reports, and comparisons.
- Redesign Course for clearer stage navigation, content readability, and mentor chat usability.
- Redesign Validator for stronger interview flow, dialogue readability, and completion guidance.
- Redesign Evaluation Report and Improvement Analysis for report clarity and visual structure.
- Redesign Account Security for cleaner settings UX and clearer action grouping.

### Phase 4: Hardening and QA

- Fix route-aware frontend test failures.
- Add stable rendering helpers for router-dependent pages.
- Validate all pages in light and dark themes.
- Validate all pages on desktop and mobile widths.
- Review all empty, loading, success, and error states.
- Check for overflow, clipping, broken spacing, and unreadable contrast.
- Run build and tests after each redesign phase.

## Priority Order

1. Foundation and shared system
2. Header, layout, navigation, shell
3. Public and auth pages
4. Dashboard, Course, Validator
5. Reporting and account pages
6. QA and regression hardening

## Acceptance Criteria

- Every route feels like part of one product.
- No page has broken layout on common desktop or mobile widths.
- Light and dark themes both look intentional and readable.
- Shared actions, feedback states, and navigation patterns are consistent.
- Dense pages remain clear under real data.
- No implementation-facing text leaks into user-facing UI.
- Frontend tests pass and the app builds cleanly.

## Risks to Manage

- Large single-file pages can make redesign brittle unless broken into smaller sections.
- Inline styling and theme setup in `index.html` will slow down safe iteration if not fixed first.
- A page-by-page redesign without a shared system will recreate inconsistency.
- Heavy visual effects can hurt clarity if they are not reduced and standardized.

## Implementation Notes

- Do not redesign isolated pages first.
- Build the system first, then refactor pages into it.
- Use real app states during QA, not only static happy paths.
- Keep functionality stable while improving structure and presentation.
