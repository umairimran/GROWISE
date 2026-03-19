# Database Queries for Progress Analysis & Dashboard

Run these in your PostgreSQL client (psql, pgAdmin, or any SQL runner) **one at a time** if you need to create or update the schema for the progress dashboard. The app may already create tables on startup; use these when you want to run migrations manually or inspect data.

---

## 1. Create progress_analysis_reports table (if not exists)

Stores the AI-generated structured report (dashboard metrics, story, chart_data) per path.

```sql
CREATE TABLE IF NOT EXISTS progress_analysis_reports (
    report_id SERIAL PRIMARY KEY,
    path_id INTEGER NOT NULL UNIQUE REFERENCES learning_paths(path_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    evaluation_id INTEGER REFERENCES evaluation_sessions(evaluation_id) ON DELETE SET NULL,
    structured_report JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_progress_analysis_reports_path ON progress_analysis_reports(path_id);
CREATE INDEX IF NOT EXISTS idx_progress_analysis_reports_user ON progress_analysis_reports(user_id);
```

---

## 2. Verify tables used by chart data

These tables must exist for the dashboard charts to have data. No changes needed if your schema is already from `growwise_database.sql`.

- `assessment_sessions` (completed_at for activity timeline)
- `assessment_results` (overall_score, session_id for score progression)
- `assessment_dimension_results` (dimension_id, dimension_score for dimension chart)
- `assessment_dimensions` (name for dimension labels)
- `learning_path_stages` (path_id, stage_id for time by stage)
- `stage_content` (stage_id, content_id for content list)
- `user_content_progress` (user_id, content_id, time_spent_minutes, completed_at)
- `evaluation_sessions` (path_id, completed_at for activity timeline)
- `evaluation_results` (reasoning_score, problem_solving for score progression)

---

## 3. Useful queries to inspect progress data (read-only)

### All progress reports (last 10)

```sql
SELECT report_id, path_id, user_id, evaluation_id, created_at,
       jsonb_pretty(structured_report->'headline') AS headline,
       (structured_report->'chart_data'->'score_progression') IS NOT NULL AS has_chart_data
FROM progress_analysis_reports
ORDER BY created_at DESC
LIMIT 10;
```

### Chart data for a specific path (e.g. path_id = 117)

```sql
SELECT path_id, user_id,
       structured_report->'chart_data'->'score_progression' AS score_progression,
       structured_report->'chart_data'->'time_spent_by_stage' AS time_by_stage,
       structured_report->'chart_data'->'dimension_scores' AS dimension_scores,
       structured_report->'chart_data'->'activity_timeline' AS activity_timeline
FROM progress_analysis_reports
WHERE path_id = 117;
```

### Time spent per stage for a user (from raw tables)

```sql
-- Replace :path_id and :user_id with actual values
SELECT s.stage_name, s.stage_order,
       COALESCE(SUM(p.time_spent_minutes), 0) AS total_minutes,
       COUNT(p.progress_id) AS content_items_completed
FROM learning_path_stages s
LEFT JOIN stage_content c ON c.stage_id = s.stage_id
LEFT JOIN user_content_progress p ON p.content_id = c.content_id AND p.user_id = :user_id AND p.is_completed = true
WHERE s.path_id = :path_id
GROUP BY s.stage_id, s.stage_name, s.stage_order
ORDER BY s.stage_order;
```

### Activity timeline for a path (assessment + content completed + evaluation)

```sql
-- Replace :path_id and :user_id with actual values
-- Assessment
SELECT a.completed_at AS event_date, 'assessment' AS event_type, 'Assessment completed' AS label
FROM assessment_results ar
JOIN assessment_sessions a ON a.session_id = ar.session_id
JOIN learning_paths lp ON lp.result_id = ar.result_id
WHERE lp.path_id = :path_id AND a.completed_at IS NOT NULL

UNION ALL

-- Content completed
SELECT p.completed_at, 'content', 'Completed: ' || LEFT(c.title, 40)
FROM user_content_progress p
JOIN stage_content c ON c.content_id = p.content_id
JOIN learning_path_stages s ON s.stage_id = c.stage_id
WHERE s.path_id = :path_id AND p.user_id = :user_id AND p.is_completed = true AND p.completed_at IS NOT NULL

UNION ALL

-- Evaluation
SELECT e.completed_at, 'evaluation', 'AI evaluation completed'
FROM evaluation_sessions e
WHERE e.path_id = :path_id AND e.user_id = :user_id AND e.status = 'completed' AND e.completed_at IS NOT NULL

ORDER BY event_date;
```

### Dimension scores for a path’s assessment

```sql
-- Replace :path_id with actual value (path_id)
SELECT d.name AS dimension, ROUND((dr.dimension_score * 100)::numeric, 0) AS score
FROM assessment_results ar
JOIN learning_paths lp ON lp.result_id = ar.result_id
JOIN assessment_dimension_results dr ON dr.session_id = ar.session_id
JOIN assessment_dimensions d ON d.dimension_id = dr.dimension_id
WHERE lp.path_id = :path_id
ORDER BY d.name;
```

---

## 4. Drop progress_analysis_reports (only if you need to reset)

```sql
DROP TABLE IF EXISTS progress_analysis_reports CASCADE;
```

After this, run **Query 1** again to recreate the table.
