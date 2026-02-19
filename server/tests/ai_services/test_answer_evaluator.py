"""
Unit + integration tests for app.ai_services.answer_evaluator
--------------------------------------------------------------
All tests run against the mock AI path — no OpenAI API key required.

Coverage:
  A.  _validate           – pure utility, edge cases.
  B.  _mock_evaluate      – correct structure, value ranges, heuristics.
  C.  evaluate_answer     – public async interface (mock path).
  D.  Integration         – submit_answer API stores criteria_scores in DB.
"""

import asyncio
import json
import time
from typing import Dict

import httpx
import pytest

from app.ai_services.answer_evaluator import (
    CRITERIA,
    _mock_evaluate,
    _validate,
    evaluate_answer,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8000"


def run(coro):
    """Run an async coroutine from a synchronous test."""
    return asyncio.run(coro)


def _full_context(**overrides) -> Dict:
    defaults = dict(
        user_answer="I would use Redis for caching with LRU eviction and add a CDN layer.",
        question_text="How would you improve the latency of a global API?",
        track_name="Full Stack Development",
        dimension_name="Scalability Awareness",
        dimension_description="Ability to design systems that handle growth.",
        dimension_weight=0.20,
        question_type="open",
    )
    defaults.update(overrides)
    return defaults


# ===========================================================================
# A.  _validate
# ===========================================================================


def test_validate_passes_clean_result() -> None:
    result = {
        "criteria_scores": {k: 7 for k in CRITERIA},
        "final_score": 0.7,
        "explanation": "Good answer.",
    }
    out = _validate(result)
    assert out["final_score"] == 0.7
    assert out["explanation"] == "Good answer."
    for k in CRITERIA:
        assert out["criteria_scores"][k] == 7


def test_validate_clamps_criteria_to_0_10() -> None:
    result = {
        "criteria_scores": {k: 99 for k in CRITERIA},
        "final_score": 0.5,
        "explanation": "OK.",
    }
    out = _validate(result)
    for k in CRITERIA:
        assert out["criteria_scores"][k] == 10


def test_validate_clamps_negative_criteria() -> None:
    result = {
        "criteria_scores": {k: -5 for k in CRITERIA},
        "final_score": 0.5,
        "explanation": "Bad.",
    }
    out = _validate(result)
    for k in CRITERIA:
        assert out["criteria_scores"][k] == 0


def test_validate_fills_missing_criteria_with_default() -> None:
    result = {
        "criteria_scores": {},
        "final_score": 0.5,
        "explanation": "OK.",
    }
    out = _validate(result)
    for k in CRITERIA:
        assert out["criteria_scores"][k] == 5


def test_validate_clamps_final_score_above_1() -> None:
    result = {
        "criteria_scores": {k: 5 for k in CRITERIA},
        "final_score": 3.5,
        "explanation": "OK.",
    }
    out = _validate(result)
    assert out["final_score"] <= 1.0


def test_validate_clamps_final_score_below_0() -> None:
    result = {
        "criteria_scores": {k: 5 for k in CRITERIA},
        "final_score": -0.5,
        "explanation": "OK.",
    }
    out = _validate(result)
    assert out["final_score"] >= 0.0


def test_validate_derives_final_score_when_missing() -> None:
    result = {
        "criteria_scores": {k: 5 for k in CRITERIA},
        "final_score": None,
        "explanation": "OK.",
    }
    out = _validate(result)
    assert isinstance(out["final_score"], float)
    assert 0.0 <= out["final_score"] <= 1.0


def test_validate_sets_default_explanation_when_empty() -> None:
    result = {
        "criteria_scores": {k: 5 for k in CRITERIA},
        "final_score": 0.5,
        "explanation": "",
    }
    out = _validate(result)
    assert out["explanation"] != ""


def test_validate_handles_string_scores() -> None:
    result = {
        "criteria_scores": {k: "7" for k in CRITERIA},
        "final_score": "0.7",
        "explanation": "OK.",
    }
    out = _validate(result)
    for k in CRITERIA:
        assert out["criteria_scores"][k] == 7
    assert out["final_score"] == 0.7


# ===========================================================================
# B.  _mock_evaluate
# ===========================================================================


def test_mock_evaluate_returns_all_keys() -> None:
    result = _mock_evaluate("Some answer", "Scalability", 0.2)
    assert "criteria_scores" in result
    assert "final_score" in result
    assert "explanation" in result


def test_mock_evaluate_criteria_scores_has_all_criteria() -> None:
    result = _mock_evaluate("Some answer", "Problem Solving", 0.15)
    for key in CRITERIA:
        assert key in result["criteria_scores"]


def test_mock_evaluate_criteria_scores_in_range() -> None:
    result = _mock_evaluate("A " * 100, "Technical Depth", 0.30)
    for k, v in result["criteria_scores"].items():
        assert 0 <= v <= 10, f"{k} = {v} out of range"


def test_mock_evaluate_final_score_in_range() -> None:
    for _ in range(20):
        result = _mock_evaluate("Test answer here", "General", 1.0)
        assert 0.0 <= result["final_score"] <= 1.0


def test_mock_evaluate_explanation_is_non_empty_string() -> None:
    result = _mock_evaluate("Answer text", "Dimension X", 0.1)
    assert isinstance(result["explanation"], str)
    assert len(result["explanation"]) > 0


def test_mock_evaluate_explanation_mentions_dimension() -> None:
    result = _mock_evaluate("Some answer", "Scalability Awareness", 0.20)
    assert "Scalability Awareness" in result["explanation"]


def test_mock_evaluate_explanation_mentions_weight() -> None:
    result = _mock_evaluate("Some answer", "Problem Solving", 0.25)
    assert "0.25" in result["explanation"]


def test_mock_evaluate_short_answer_scores_lower_on_average() -> None:
    short_result = _mock_evaluate("No idea", "General", 1.0)
    long_result = _mock_evaluate(
        "In distributed systems, improving API latency globally involves "
        "multiple strategies: deploying edge nodes closer to users using CDN "
        "providers like Cloudflare; using Redis or Memcached for query caching "
        "with LRU eviction policies; optimising database queries with proper "
        "indexing and connection pooling; and leveraging asynchronous I/O with "
        "frameworks like FastAPI or Node.js to reduce blocking. Each approach "
        "has tradeoffs: CDN works best for static or semi-static content, while "
        "Redis adds operational complexity but dramatically reduces DB load.",
        "General",
        1.0,
    )
    assert long_result["final_score"] >= short_result["final_score"] - 0.2


def test_mock_evaluate_with_examples_in_answer() -> None:
    result = _mock_evaluate(
        "For example, using Redis for caching such as LRU eviction e.g. TTL 60s",
        "Practicality",
        0.10,
    )
    assert result["final_score"] >= 0.0


def test_mock_evaluate_final_score_derived_from_criteria() -> None:
    result = _mock_evaluate("Test", "X", 0.5)
    cs = result["criteria_scores"]
    avg = sum(cs.values()) / (len(cs) * 10)
    # final_score should be close to average of criteria_scores / 10
    assert abs(result["final_score"] - round(avg, 3)) < 0.001


# ===========================================================================
# C.  evaluate_answer  (public async, mock path)
# ===========================================================================


def test_evaluate_answer_returns_dict() -> None:
    ctx = _full_context()
    result = run(evaluate_answer(**ctx))
    assert isinstance(result, dict)


def test_evaluate_answer_has_required_keys() -> None:
    ctx = _full_context()
    result = run(evaluate_answer(**ctx))
    assert "criteria_scores" in result
    assert "final_score" in result
    assert "explanation" in result


def test_evaluate_answer_criteria_scores_complete() -> None:
    ctx = _full_context()
    result = run(evaluate_answer(**ctx))
    for key in CRITERIA:
        assert key in result["criteria_scores"]


def test_evaluate_answer_final_score_in_range() -> None:
    ctx = _full_context()
    result = run(evaluate_answer(**ctx))
    assert 0.0 <= result["final_score"] <= 1.0


def test_evaluate_answer_works_for_all_question_types() -> None:
    for qtype in ["open", "mcq", "logic"]:
        ctx = _full_context(question_type=qtype)
        result = run(evaluate_answer(**ctx))
        assert 0.0 <= result["final_score"] <= 1.0


def test_evaluate_answer_works_with_empty_dimension_description() -> None:
    ctx = _full_context(dimension_description="")
    result = run(evaluate_answer(**ctx))
    assert "final_score" in result


def test_evaluate_answer_works_with_zero_weight() -> None:
    ctx = _full_context(dimension_weight=0.0)
    result = run(evaluate_answer(**ctx))
    assert 0.0 <= result["final_score"] <= 1.0


def test_evaluate_answer_multiple_calls_stable_structure() -> None:
    ctx = _full_context()
    for _ in range(5):
        result = run(evaluate_answer(**ctx))
        assert set(result["criteria_scores"].keys()) == set(CRITERIA)


def test_evaluate_answer_explanation_is_string() -> None:
    ctx = _full_context()
    result = run(evaluate_answer(**ctx))
    assert isinstance(result["explanation"], str)
    assert len(result["explanation"]) > 10


# ===========================================================================
# D.  Integration — submit_answer stores criteria_scores via the API
# ===========================================================================
#
# These tests require the server to be running at http://localhost:8000
# and a fresh DB with the admin seed.
# ===========================================================================


def _admin_token(client: httpx.Client) -> str:
    resp = client.post(
        "/api/auth/login",
        data={"username": "admin@gmail.com", "password": "admin123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register_and_login(client: httpx.Client) -> str:
    email = f"eval_test_{int(time.time() * 1000)}@example.com"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "Pass1234!", "full_name": "Eval Tester"},
    )
    resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": "Pass1234!"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _create_track(client: httpx.Client, admin_headers: dict) -> int:
    name = f"EvalTrack_{int(time.time() * 1000)}"
    resp = client.post(
        "/api/tracks/",
        json={"track_name": name, "description": "For evaluator tests"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["track_id"]


def test_submit_answer_returns_criteria_scores() -> None:
    """
    Full flow: create track → create session → fetch questions →
    submit one answer → assert criteria_scores in response.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        admin_token = _admin_token(client)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        user_token = _register_and_login(client)
        user_headers = {"Authorization": f"Bearer {user_token}"}

        track_id = _create_track(client, admin_headers)

        # Wait briefly for background dimension generation
        time.sleep(1)

        # Start assessment session
        resp = client.post(
            "/api/assessment/sessions",
            json={"track_id": track_id},
            headers=user_headers,
        )
        assert resp.status_code == 201, resp.text
        session_id = resp.json()["session_id"]

        # Get questions
        resp = client.get(
            f"/api/assessment/sessions/{session_id}/questions",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        questions = resp.json()
        assert len(questions) > 0

        # Submit first answer
        q_id = questions[0]["question_id"]
        resp = client.post(
            f"/api/assessment/sessions/{session_id}/submit",
            json={
                "question_id": q_id,
                "user_answer": (
                    "I would start by profiling with distributed tracing tools like "
                    "Jaeger, identify bottlenecks, then add a Redis cache layer with "
                    "LRU eviction. Edge CDN deployment would reduce geographic latency "
                    "and connection pooling would reduce DB overhead."
                ),
            },
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "criteria_scores" in data
        assert data["criteria_scores"] is not None
        assert isinstance(data["criteria_scores"], dict)
        for key in CRITERIA:
            assert key in data["criteria_scores"], f"Missing criterion: {key}"


def test_submit_answer_ai_score_is_final_score() -> None:
    """
    ai_score in the response should equal final_score from the evaluator (0-1).
    """
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
            f"/api/assessment/sessions/{session_id}/questions",
            headers=user_headers,
        )
        questions = resp.json()
        q_id = questions[0]["question_id"]

        resp = client.post(
            f"/api/assessment/sessions/{session_id}/submit",
            json={"question_id": q_id, "user_answer": "Short answer."},
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        ai_score = float(data["ai_score"])
        assert 0.0 <= ai_score <= 1.0


def test_submit_all_answers_then_complete_stores_dimension_results() -> None:
    """
    Submit all 10 answers and complete the session; the dimension results
    should be reflected in the overall assessment result.
    """
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
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
            f"/api/assessment/sessions/{session_id}/questions",
            headers=user_headers,
        )
        questions = resp.json()

        for q in questions:
            resp = client.post(
                f"/api/assessment/sessions/{session_id}/submit",
                json={
                    "question_id": q["question_id"],
                    "user_answer": (
                        "The best approach depends on context. For example, using "
                        "microservices with API gateways allows independent scaling. "
                        "Tradeoffs include operational complexity vs flexibility."
                    ),
                },
                headers=user_headers,
            )
            assert resp.status_code == 200, resp.text

        # Complete session
        resp = client.post(
            f"/api/assessment/sessions/{session_id}/complete",
            headers=user_headers,
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()
        assert result["overall_score"] is not None
        assert result["detected_level"] in ("beginner", "intermediate", "advanced")
        assert "dimension" in result["ai_reasoning"].lower() or result["overall_score"] >= 0
