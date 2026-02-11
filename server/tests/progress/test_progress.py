import uuid
from typing import Dict, Tuple

import httpx
import pytest

from app.database import SessionLocal
from app import models
from tests.conftest import generate_random_email


@pytest.fixture
def admin_headers(api_client: httpx.Client) -> Dict[str, str]:
    """
    Create a temporary admin user and return Authorization headers.
    """
    email = generate_random_email()
    password = "AdminPass123!"

    resp = api_client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Test Admin User",
        },
    )
    assert resp.status_code == 201

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        assert user is not None
        user.role = "admin"
        db.commit()
    finally:
        db.close()

    login = api_client.post(
        "/api/auth/login", data={"username": email, "password": password}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_track(api_client: httpx.Client, admin_headers: Dict[str, str]) -> int:
    name = f"Progress Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for progress tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


def _complete_assessment(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
    track_id: int,
) -> int:
    """
    Create a completed assessment attempt and return session_id.
    """
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["session_id"]

    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    assert questions_resp.status_code == 200
    questions = questions_resp.json()

    for q in questions:
        submit_resp = api_client.post(
            f"/api/assessment/sessions/{session_id}/submit",
            headers=auth_headers,
            json={
                "question_id": q["question_id"],
                "user_answer": f"Answer for {q['question_id']}",
            },
        )
        assert submit_resp.status_code == 200

    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete",
        headers=auth_headers,
    )
    assert complete_resp.status_code == 200
    return session_id


def _create_learning_path_with_progress(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> Tuple[int, int]:
    """
    Create:
    - One completed assessment
    - One learning path with auto content
    - Some content progress

    Returns: (path_id, one_stage_id)
    """
    track_id = _create_track(api_client, admin_headers)
    session_id = _complete_assessment(api_client, admin_headers, auth_headers, track_id)

    # Get result_id
    result_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/result",
        headers=auth_headers,
    )
    # If not available (e.g. result by POST), fetch from DB or reuse complete response
    # For simplicity, re-call complete if needed:
    if result_resp.status_code != 200:
        complete_resp = api_client.post(
            f"/api/assessment/sessions/{session_id}/complete",
            headers=auth_headers,
        )
        assert complete_resp.status_code == 200
        result_id = complete_resp.json()["result_id"]
    else:
        result_id = result_resp.json()["result_id"]

    # Learning path with auto content
    lp_resp = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        params={"auto_generate_content": True},
        json={"result_id": result_id},
    )
    assert lp_resp.status_code == 201
    lp = lp_resp.json()
    path_id = lp["path_id"]
    stages = lp.get("stages", [])
    assert len(stages) > 0
    stage_id = stages[0]["stage_id"]

    # Generate some progress for at least one content item in first stage
    stage_content_resp = api_client.get(
        f"/api/content/stage/{stage_id}", headers=auth_headers
    )
    assert stage_content_resp.status_code == 200
    items = stage_content_resp.json()
    if items:
        content_id = items[0]["content_id"]
        # Start and complete progress
        start_resp = api_client.post(
            "/api/content/progress",
            headers=auth_headers,
            json={"content_id": content_id, "completion_percentage": 100},
        )
        assert start_resp.status_code in (201, 400)  # 400 if progress already exists
        api_client.post(
            f"/api/content/{content_id}/complete", headers=auth_headers
        )

    return path_id, stage_id


# ============================================================================
# Assessment history & comparison
# ============================================================================


def test_assessment_history_and_compare(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Create two completed assessments and verify:
    - /api/progress/assessments/history
    - /api/progress/assessments/compare/{id1}/{id2}
    """
    track_id = _create_track(api_client, admin_headers)
    s1 = _complete_assessment(api_client, admin_headers, auth_headers, track_id)
    s2 = _complete_assessment(api_client, admin_headers, auth_headers, track_id)

    history_resp = api_client.get(
        "/api/progress/assessments/history", headers=auth_headers
    )
    assert history_resp.status_code == 200
    history_data = history_resp.json()
    assert history_data["total_attempts"] >= 2
    assert len(history_data["history"]) >= 2

    compare_resp = api_client.get(
        f"/api/progress/assessments/compare/{s1}/{s2}", headers=auth_headers
    )
    assert compare_resp.status_code == 200
    compare = compare_resp.json()
    assert "attempt_1" in compare and "attempt_2" in compare
    assert "improvement" in compare


# ============================================================================
# Learning path progress & dashboard
# ============================================================================


def test_learning_path_progress_and_dashboard(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Ensure:
    - /api/progress/learning-path/{path_id} returns sane data
    - /api/progress/dashboard aggregates key metrics
    """
    path_id, stage_id = _create_learning_path_with_progress(
        api_client, admin_headers, auth_headers
    )

    lp_progress_resp = api_client.get(
        f"/api/progress/learning-path/{path_id}", headers=auth_headers
    )
    assert lp_progress_resp.status_code == 200
    data = lp_progress_resp.json()
    assert data["path_id"] == path_id
    assert data["total_content_items"] >= 1
    assert data["overall_completion_percentage"] >= 0

    dashboard_resp = api_client.get("/api/progress/dashboard", headers=auth_headers)
    assert dashboard_resp.status_code == 200
    dash = dashboard_resp.json()
    assert "user" in dash
    assert "assessments" in dash
    assert "learning" in dash


# ============================================================================
# Evaluation history & timeline
# ============================================================================


def test_evaluation_history_and_timeline(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    - Create learning path
    - Create + complete evaluation
    - Check /api/progress/evaluations/history
    - Check /api/progress/analytics/timeline
    """
    # Reuse helper to get path with progress
    path_id, _ = _create_learning_path_with_progress(
        api_client, admin_headers, auth_headers
    )

    # Create evaluation session
    eval_sess_resp = api_client.post(
        "/api/evaluation/sessions",
        headers=auth_headers,
        json={"path_id": path_id},
    )
    assert eval_sess_resp.status_code == 201
    evaluation_id = eval_sess_resp.json()["evaluation_id"]

    # Respond a few times
    for _ in range(2):
        resp = api_client.post(
            f"/api/evaluation/sessions/{evaluation_id}/respond",
            headers=auth_headers,
            json={"message_text": "My explanation."},
        )
        assert resp.status_code == 200

    # Complete evaluation
    complete_resp = api_client.post(
        f"/api/evaluation/sessions/{evaluation_id}/complete",
        headers=auth_headers,
    )
    assert complete_resp.status_code == 200

    # Evaluation history
    eval_hist_resp = api_client.get(
        "/api/progress/evaluations/history", headers=auth_headers
    )
    assert eval_hist_resp.status_code == 200
    eval_hist = eval_hist_resp.json()
    assert eval_hist["total_evaluations"] >= 1

    # Timeline analytics
    timeline_resp = api_client.get(
        "/api/progress/analytics/timeline", headers=auth_headers
    )
    assert timeline_resp.status_code == 200
    timeline = timeline_resp.json()
    assert "total_events" in timeline
    assert timeline["total_events"] >= 1

