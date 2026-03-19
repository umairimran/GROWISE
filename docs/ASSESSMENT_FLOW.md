# Assessment Flow: From Answer Submit to Final Report

This document explains **exactly** what happens after each answer is submitted and how the final report is formed.

## Overview of Report Generation (Updated)

When the assessment is **completed**, all Q&A data is sent to the AI in one call. The AI produces a **comprehensive report** that:
- Provides an executive summary (used as `ai_reasoning`)
- Lists strengths and weaknesses with evidence
- Breaks down performance by dimension
- Defines learning priorities
- Includes `content_generation_context` for downstream content generation

This report is stored in `assessment_results.comprehensive_report` (JSON) and returned in the API.

---

## Part 1: Per-Answer Flow (One by One)

```
User submits Answer #1
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  POST /api/assessment/sessions/{session_id}/submit                 │
│  Body: { question_id: 101, user_answer: "My answer..." }            │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  Backend: evaluate_answer_ai()  →  1 LLM API call                  │
│  Returns: { criteria_scores, final_score, explanation }            │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  INSERT INTO assessment_responses                                  │
│  (session_id, question_id, user_answer, ai_score, ai_explanation,   │
│   criteria_scores)                                                 │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  Frontend: setSubmittedResponses({ [question_id]: response })       │
│  Frontend: setCurrentQuestionIndex(index + 1)  →  Show next Q       │
└───────────────────────────────────────────────────────────────────┘
```

**Same flow repeats for Answer #2, #3, ... #10.**

---

## Part 2: When Does "Complete" Happen?

The **complete** flow is triggered in two cases:

### Case A: User submits the last answer (Question 10)

```javascript
// Assessment.tsx lines 313-318
if (currentQuestionIndex < questions.length - 1) {
  setCurrentQuestionIndex((index) => index + 1);  // Move to next question
  return;
}
await completeAssessment();  // ← Last question: trigger complete
```

### Case B: Timer runs out (50 minutes)

```javascript
// Assessment.tsx lines 269-279
const timer = window.setInterval(() => {
  setTimeLeft((currentTime) => {
    if (currentTime <= 1) {
      window.clearInterval(timer);
      void completeAssessment();  // ← Timer expired: trigger complete
      return 0;
    }
    return currentTime - 1;
  });
}, 1000);
```

---

## Part 3: How the Final Report Is Formed

```
completeAssessment()  →  POST /api/assessment/sessions/{session_id}/complete
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Read all assessment_responses for this session                     │
│  (All 10 rows already exist — each was saved when user submitted)            │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Aggregate per-dimension scores                                     │
│  For each dimension:                                                         │
│    - Get all responses whose question belongs to that dimension              │
│    - avg_score = mean(ai_score) of those responses                           │
│    - weighted_contribution = avg_score × dimension.weight                    │
│  INSERT INTO assessment_dimension_results (one row per dimension)            │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Calculate overall score                                             │
│  weighted_total = sum(weighted_contribution) for all dimensions              │
│  total_weight = sum(dimension.weight) for all dimensions                      │
│  overall_score = (weighted_total / total_weight) × 100  →  0–100%            │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Determine level                                                    │
│  if overall_score >= 80  →  "advanced"                                      │
│  if overall_score >= 60  →  "intermediate"                                  │
│  else  →  "beginner"                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: Send ALL Q&A to AI for comprehensive report (AI call)              │
│  "Based on 10 responses with weighted average score 72.50%, user demonstrates│
│   intermediate level understanding. Dimension breakdown — Problem Solving:  │
│   75.0%, System Design: 68.0%, ..."                                         │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: INSERT INTO assessment_results                                     │
│  (session_id, overall_score, detected_level, ai_reasoning, comprehensive_report) │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 7: Update session  →  status = 'completed', completed_at = now        │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 8: Skill profile (AI call)                                             │
│  ai_service.analyze_skill_profile(responses, overall_score)                   │
│  CREATE/UPDATE skill_profiles (strengths, weaknesses, thinking_pattern)      │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 9: Learning path (AI call)                                            │
│  generate_learning_path_stages(questions_and_answers, detected_level)       │
│  INSERT INTO learning_paths + learning_path_stages                           │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 10: Return AssessmentResultResponse to frontend                        │
│  { result_id, session_id, overall_score, detected_level, ai_reasoning,      │
│    learning_path_id }                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend: onComplete(result)  →  Navigate to Dashboard                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary: Data Flow

| Stage | When | What gets created |
|-------|------|-------------------|
| **Submit answer** | Each of 10 questions | 1 row in `assessment_responses` (per answer) |
| **Complete** | Last question or timer | 1 row in `assessment_results` |
| **Complete** | Same | N rows in `assessment_dimension_results` (per dimension) |
| **Complete** | Same | 1 row in `skill_profiles` (create/update) |
| **Complete** | Same | 1 row in `learning_paths` + N rows in `learning_path_stages` |

---

## Path Storage (DB)

The learning path is stored in:

- **`learning_paths`**: `path_id`, `user_id`, `result_id`, `created_at`
- **`learning_path_stages`**: `stage_id`, `path_id`, `stage_name`, `stage_order`, `focus_area`

The Course page fetches via `GET /api/learning/my-current-path` (most recent path by `created_at`), then `GET /api/learning/paths/{path_id}/stages`.

**If path generation fails** (e.g. 429 during complete): `POST /api/assessment/sessions/{session_id}/regenerate-path` regenerates it.

---

## Stage Content Generation (Gemini + Google Search)

When the user clicks **"Generate Content"** on the Course page for a stage:

1. `POST /api/content/generate` with `{ stage_id, content_count: 8 }`
2. Backend loads stage (stage_name, focus_area), result (detected_level), track (track_name)
3. If `USE_MOCK_AI=false` and `AI_PROVIDER=gemini`: calls `stage_content_generator.generate_stage_content_with_search()`
4. Uses **Gemini with Google Search grounding** to find real resources:
   - Videos (YouTube, etc.)
   - Documentation (MDN, official docs)
   - Articles/tutorials (Medium, Dev.to, freeCodeCamp)
   - Exercises (Codecademy, Exercism, etc.)
5. Returns structured JSON with real URLs; saves to `stage_content` table
6. If search fails or returns empty, falls back to mock content

**Note:** Google Search grounding costs ~$35 per 1,000 queries (Gemini API paid tier).

---

## Key Point

**The per-question scores are already in the database** when complete runs. The `complete` endpoint does **not** call the answer evaluator again. It **aggregates** the existing `assessment_responses` rows to compute:

- Per-dimension scores
- Overall score
- Detected level
- AI reasoning text (built from the aggregated data)

Only the **skill profile** and **learning path** stages need extra AI calls during complete.
