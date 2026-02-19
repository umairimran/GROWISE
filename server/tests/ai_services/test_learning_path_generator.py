"""
Unit + Integration tests for app.ai_services.learning_path_generator
----------------------------------------------------------------------
All tests run against the MOCK AI path — no OpenAI API key required.

Coverage:
  A.  _mock_stages       – correct structure, ordering, content derivation.
  B.  _validate_stages   – handles bad AI outputs gracefully.
  C.  _fallback_stages   – returns sensible defaults when no Q&A data.
  D.  generate_learning_path_stages – public async interface (mock path).
  E.  Integration        – complete_assessment auto-generates a learning path
                           stored in the DB, and GET learning-path endpoint works.
"""

import asyncio
import time
from typing import Dict, List

import httpx
import pytest

from app.ai_services.learning_path_generator import (
    _fallback_stages,
    _mock_stages,
    _validate_stages,
    generate_learning_path_stages,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8000"


def run(coro):
    return asyncio.run(coro)


def _make_qa(
    question: str = "How would you design a scalable API?",
    answer: str = "Use load balancers and caching.",
    dimension: str = "Scalability Awareness",
    final_score: float = 0.45,
    strong: bool = False,
) -> Dict:
    score = 8 if strong else 4
    return {
        "question_text": question,
        "user_answer": answer,
        "dimension": dimension,
        "criteria_scores": {
            "problem_understanding": score,
            "structured_thinking": score,
            "technical_depth": score,
            "scalability_awareness": score,
            "failure_handling": score,
            "tradeoff_reasoning": score,
            "practicality": score,
            "communication_clarity": score,
            "engineering_maturity": score,
        },
        "final_score": final_score,
        "ai_explanation": "Candidate shows some understanding but lacks depth.",
    }


def _make_ten_qa(strong: bool = False) -> List[Dict]:
    """10 Q&A items for a complete session."""
    return [_make_qa(strong=strong) for _ in range(10)]


# ===========================================================================
# A.  _mock_stages
# ===========================================================================


def test_mock_stages_returns_list() -> None:
    stages = _mock_stages("Full Stack", "intermediate", _make_ten_qa())
    assert isinstance(stages, list)


def test_mock_stages_returns_at_least_3() -> None:
    stages = _mock_stages("Full Stack", "intermediate", _make_ten_qa())
    assert len(stages) >= 3


def test_mock_stages_returns_at_most_5() -> None:
    stages = _mock_stages("Full Stack", "advanced", _make_ten_qa())
    assert len(stages) <= 5


def test_mock_stages_each_has_required_keys() -> None:
    stages = _mock_stages("Backend", "beginner", _make_ten_qa())
    for stage in stages:
        assert "stage_name" in stage
        assert "stage_order" in stage
        assert "focus_area" in stage


def test_mock_stages_stage_names_are_strings() -> None:
    stages = _mock_stages("Backend", "beginner", _make_ten_qa())
    for stage in stages:
        assert isinstance(stage["stage_name"], str)
        assert len(stage["stage_name"]) > 0


def test_mock_stages_focus_area_is_non_empty_string() -> None:
    stages = _mock_stages("Frontend", "intermediate", _make_ten_qa())
    for stage in stages:
        assert isinstance(stage["focus_area"], str)
        assert len(stage["focus_area"]) > 20


def test_mock_stages_orders_are_sequential() -> None:
    stages = _mock_stages("Full Stack", "intermediate", _make_ten_qa())
    for i, stage in enumerate(stages, start=1):
        assert stage["stage_order"] == i


def test_mock_stages_with_empty_criteria_scores() -> None:
    """Should not crash when criteria_scores is empty."""
    qa = [{"question_text": "?", "user_answer": "ans", "dimension": "X",
            "criteria_scores": {}, "final_score": 0.5, "ai_explanation": ""}]
    stages = _mock_stages("Track", "intermediate", qa)
    assert len(stages) >= 3


def test_mock_stages_single_qa_item() -> None:
    stages = _mock_stages("Track", "beginner", [_make_qa()])
    assert len(stages) >= 3


def test_mock_stages_all_strong_scores_still_returns_stages() -> None:
    """Even if all criteria are strong, we still return stages (can't have 0)."""
    stages = _mock_stages("Track", "advanced", _make_ten_qa(strong=True))
    assert len(stages) >= 3


def test_mock_stages_weak_scalability_creates_systems_thinking_stage() -> None:
    """Weak scalability_awareness should trigger Systems Thinking stage."""
    qa = [_make_qa(dimension="Scalability Awareness", final_score=0.2, strong=False)]
    stages = _mock_stages("Backend", "intermediate", qa)
    names = [s["stage_name"] for s in stages]
    assert any("System" in n or "Scalab" in n for n in names)


def test_mock_stages_weak_communication_creates_communication_stage() -> None:
    """Weak communication_clarity should trigger communication stage."""
    items = []
    for _ in range(5):
        qa = _make_qa()
        qa["criteria_scores"] = {
            "problem_understanding": 8, "structured_thinking": 8,
            "technical_depth": 8, "scalability_awareness": 8,
            "failure_handling": 8, "tradeoff_reasoning": 8,
            "practicality": 8, "communication_clarity": 2,
            "engineering_maturity": 8,
        }
        items.append(qa)
    stages = _mock_stages("Track", "intermediate", items)
    names = [s["stage_name"] for s in stages]
    assert any("Commun" in n or "Document" in n for n in names)


# ===========================================================================
# B.  _validate_stages
# ===========================================================================


def test_validate_stages_passes_valid_list() -> None:
    valid = [
        {"stage_name": "Stage One", "stage_order": 1, "focus_area": "Focus on X."},
        {"stage_name": "Stage Two", "stage_order": 2, "focus_area": "Focus on Y."},
        {"stage_name": "Stage Three", "stage_order": 3, "focus_area": "Focus on Z."},
    ]
    result = _validate_stages(valid)
    assert len(result) == 3
    assert result[0]["stage_name"] == "Stage One"


def test_validate_stages_drops_entries_missing_stage_name() -> None:
    stages = [
        {"stage_name": "Valid Stage", "stage_order": 1, "focus_area": "Good focus."},
        {"stage_name": "", "stage_order": 2, "focus_area": "Missing name."},
    ]
    result = _validate_stages(stages)
    assert all(s["stage_name"] != "" for s in result)


def test_validate_stages_drops_entries_missing_focus_area() -> None:
    stages = [
        {"stage_name": "Stage A", "stage_order": 1, "focus_area": "Proper focus."},
        {"stage_name": "Stage B", "stage_order": 2, "focus_area": ""},
    ]
    result = _validate_stages(stages)
    assert all(s["focus_area"] != "" for s in result)


def test_validate_stages_truncates_long_names() -> None:
    long_name = "A" * 100
    stages = [
        {"stage_name": long_name, "stage_order": 1, "focus_area": "Good focus here."},
    ]
    result = _validate_stages(stages)
    assert len(result[0]["stage_name"]) <= 80


def test_validate_stages_reindexes_stage_order() -> None:
    """stage_order should always be 1, 2, 3... regardless of AI output."""
    stages = [
        {"stage_name": "A", "stage_order": 5, "focus_area": "F."},
        {"stage_name": "B", "stage_order": 99, "focus_area": "G."},
    ]
    result = _validate_stages(stages)
    for i, s in enumerate(result, start=1):
        assert s["stage_order"] == i


def test_validate_stages_caps_at_5() -> None:
    stages = [
        {"stage_name": f"Stage {i}", "stage_order": i, "focus_area": "Focus."}
        for i in range(1, 9)
    ]
    result = _validate_stages(stages)
    assert len(result) <= 5


def test_validate_stages_returns_fallback_on_empty_input() -> None:
    result = _validate_stages([])
    assert len(result) >= 3


# ===========================================================================
# C.  _fallback_stages
# ===========================================================================


def test_fallback_stages_returns_3_for_all_levels() -> None:
    for level in ("beginner", "intermediate", "advanced"):
        result = _fallback_stages("Test Track", level)
        assert len(result) == 3


def test_fallback_stages_stage_order_sequential() -> None:
    result = _fallback_stages("Test Track", "beginner")
    for i, s in enumerate(result, start=1):
        assert s["stage_order"] == i


def test_fallback_stages_all_fields_present() -> None:
    result = _fallback_stages("Test Track", "advanced")
    for s in result:
        assert "stage_name" in s and "stage_order" in s and "focus_area" in s


def test_fallback_stages_unknown_level_uses_intermediate() -> None:
    result = _fallback_stages("Track", "expert")  # Unknown level
    assert len(result) >= 3


# ===========================================================================
# D.  generate_learning_path_stages — public async interface (mock path)
# ===========================================================================


def test_generate_stages_returns_list() -> None:
    result = run(generate_learning_path_stages("Full Stack", "intermediate", _make_ten_qa()))
    assert isinstance(result, list)


def test_generate_stages_at_least_3() -> None:
    result = run(generate_learning_path_stages("Backend", "beginner", _make_ten_qa()))
    assert len(result) >= 3


def test_generate_stages_at_most_5() -> None:
    result = run(generate_learning_path_stages("Frontend", "advanced", _make_ten_qa()))
    assert len(result) <= 5


def test_generate_stages_all_required_keys() -> None:
    result = run(generate_learning_path_stages("Track", "intermediate", _make_ten_qa()))
    for stage in result:
        assert "stage_name" in stage
        assert "stage_order" in stage
        assert "focus_area" in stage


def test_generate_stages_orders_sequential() -> None:
    result = run(generate_learning_path_stages("Track", "intermediate", _make_ten_qa()))
    for i, s in enumerate(result, start=1):
        assert s["stage_order"] == i


def test_generate_stages_empty_qa_uses_fallback() -> None:
    result = run(generate_learning_path_stages("Track", "beginner", []))
    assert len(result) >= 3


def test_generate_stages_single_qa_does_not_crash() -> None:
    result = run(generate_learning_path_stages("Track", "intermediate", [_make_qa()]))
    assert len(result) >= 3


def test_generate_stages_stable_across_multiple_calls() -> None:
    """Structure should be consistent across calls with same input."""
    qa = _make_ten_qa()
    results = [
        run(generate_learning_path_stages("Track", "intermediate", qa))
        for _ in range(3)
    ]
    # All calls should return same number of stages with same names
    for r in results:
        assert len(r) == len(results[0])
        for s1, s2 in zip(r, results[0]):
            assert s1["stage_name"] == s2["stage_name"]


# ===========================================================================
# E.  Integration — full flow via API
# ===========================================================================
#
# Requires the server running at http://localhost:8000
# ===========================================================================


def _admin_token(client: httpx.Client) -> str:
    resp = client.post(
        "/api/auth/login",
        data={"username": "admin@gmail.com", "password": "admin123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register_and_login(client: httpx.Client) -> str:
    email = f"lp_test_{int(time.time() * 1000)}@example.com"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "Pass1234!", "full_name": "LP Tester"},
    )
    resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": "Pass1234!"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _create_track(client: httpx.Client, admin_headers: dict) -> int:
    name = f"LPTrack_{int(time.time() * 1000)}"
    resp = client.post(
        "/api/tracks/",
        json={"track_name": name, "description": "For learning path tests"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["track_id"]


def _complete_full_session(client: httpx.Client, user_headers: dict, track_id: int) -> dict:
    """Helper: start session → submit all answers → complete → return result."""
    resp = client.post(
        "/api/assessment/sessions",
        json={"track_id": track_id},
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    session_id = resp.json()["session_id"]

    resp = client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=user_headers,
    )
    assert resp.status_code == 200, resp.text
    questions = resp.json()
    assert len(questions) > 0

    for q in questions:
        resp = client.post(
            f"/api/assessment/sessions/{session_id}/submit",
            json={
                "question_id": q["question_id"],
                "user_answer": (
                    "I would implement a caching layer using Redis with LRU eviction "
                    "and add a CDN for static assets. The system uses async I/O with "
                    "connection pooling to handle concurrent requests at scale. "
                    "Failure handling uses circuit breakers and exponential backoff."
                ),
            },
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text

    resp = client.post(
        f"/api/assessment/sessions/{session_id}/complete",
        headers=user_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json(), session_id


def test_complete_assessment_returns_learning_path_id() -> None:
    """complete_assessment should include a non-null learning_path_id."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        result, _ = _complete_full_session(client, user_headers, track_id)

        assert "learning_path_id" in result, "learning_path_id missing from result"
        assert result["learning_path_id"] is not None
        assert isinstance(result["learning_path_id"], int)
        assert result["learning_path_id"] > 0


def test_get_session_learning_path_returns_stages() -> None:
    """GET /sessions/{id}/learning-path returns path with >= 3 stages."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        result, session_id = _complete_full_session(client, user_headers, track_id)

        resp = client.get(
            f"/api/assessment/sessions/{session_id}/learning-path",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        path = resp.json()

        assert "path_id" in path
        assert "stages" in path
        assert isinstance(path["stages"], list)
        assert len(path["stages"]) >= 3


def test_get_session_learning_path_stages_have_required_fields() -> None:
    """Every stage returned by the API must have stage_name, stage_order, focus_area."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        _, session_id = _complete_full_session(client, user_headers, track_id)

        resp = client.get(
            f"/api/assessment/sessions/{session_id}/learning-path",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        stages = resp.json()["stages"]

        for stage in stages:
            assert "stage_name" in stage, "stage_name missing"
            assert "stage_order" in stage, "stage_order missing"
            assert "focus_area" in stage, "focus_area missing"
            assert isinstance(stage["stage_name"], str) and stage["stage_name"]
            assert isinstance(stage["stage_order"], int) and stage["stage_order"] >= 1
            assert isinstance(stage["focus_area"], str) and stage["focus_area"]


def test_get_session_learning_path_stages_ordered_sequentially() -> None:
    """stage_order values should be 1, 2, 3, ..."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        _, session_id = _complete_full_session(client, user_headers, track_id)

        resp = client.get(
            f"/api/assessment/sessions/{session_id}/learning-path",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        stages = sorted(resp.json()["stages"], key=lambda s: s["stage_order"])
        for i, stage in enumerate(stages, start=1):
            assert stage["stage_order"] == i


def test_get_session_learning_path_requires_auth() -> None:
    """Unauthenticated request should return 401."""
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        resp = client.get("/api/assessment/sessions/999/learning-path")
        assert resp.status_code == 401


def test_get_session_learning_path_404_before_completion() -> None:
    """Requesting learning path for an incomplete session returns 404."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        resp = client.post(
            "/api/assessment/sessions",
            json={"track_id": track_id},
            headers=user_headers,
        )
        assert resp.status_code == 201, resp.text
        session_id = resp.json()["session_id"]

        resp = client.get(
            f"/api/assessment/sessions/{session_id}/learning-path",
            headers=user_headers,
        )
        assert resp.status_code == 404


def test_get_assessment_result_includes_learning_path_id() -> None:
    """GET result endpoint should also return learning_path_id after completion."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)
        time.sleep(1)

        _, session_id = _complete_full_session(client, user_headers, track_id)

        resp = client.get(
            f"/api/assessment/sessions/{session_id}/result",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "learning_path_id" in data
        assert data["learning_path_id"] is not None
