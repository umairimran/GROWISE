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
    name = f"Content Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for content tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


def _create_assessment_and_result(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> Tuple[int, int, int]:
    """
    Same helper logic as in learning tests:
    - Create track
    - Create assessment session
    - Answer all questions
    - Complete assessment
    """
    track_id = _create_track(api_client, admin_headers)
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session = session_resp.json()
    session_id = session["session_id"]

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
                "user_answer": f"Answer for question {q['question_id']}",
            },
        )
        assert submit_resp.status_code == 200

    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete", headers=auth_headers
    )
    assert complete_resp.status_code == 200
    result_id = complete_resp.json()["result_id"]
    return result_id, session_id, track_id


def _create_learning_path_without_content(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> Tuple[int, int]:
    """
    Create a learning path with auto_generate_content=False
    so we can test manual content generation endpoints.

    Returns: (path_id, first_stage_id)
    """
    result_id, _, _ = _create_assessment_and_result(
        api_client, admin_headers, auth_headers
    )

    lp_resp = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        params={"auto_generate_content": False},
        json={"result_id": result_id},
    )
    assert lp_resp.status_code == 201
    lp = lp_resp.json()
    path_id = lp["path_id"]
    stages = lp.get("stages", [])
    assert len(stages) > 0
    first_stage_id = stages[0]["stage_id"]
    return path_id, first_stage_id


# ============================================================================
# Content generation
# ============================================================================


def test_generate_content_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    POST /api/content/generate without auth should fail with 401.
    """
    _, stage_id = _create_learning_path_without_content(
        api_client, admin_headers, auth_headers
    )

    resp = api_client.post(
        "/api/content/generate",
        json={"stage_id": stage_id, "content_count": 5},
    )
    assert resp.status_code == 401


def test_generate_content_for_stage_happy_flow(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    - Create learning path with no content
    - Generate content for a stage
    - Verify content is created and retrievable via /stage/{stage_id}
    """
    _, stage_id = _create_learning_path_without_content(
        api_client, admin_headers, auth_headers
    )

    gen_resp = api_client.post(
        "/api/content/generate",
        headers=auth_headers,
        json={"stage_id": stage_id, "content_count": 6},
    )
    assert gen_resp.status_code == 201
    data = gen_resp.json()
    assert data["stage_id"] == stage_id
    assert data["content_count"] > 0

    # Fetch content for stage
    stage_content_resp = api_client.get(
        f"/api/content/stage/{stage_id}", headers=auth_headers
    )
    assert stage_content_resp.status_code == 200
    items = stage_content_resp.json()
    assert len(items) == data["content_count"]


# ============================================================================
# Progress tracking
# ============================================================================


def test_start_update_and_complete_content_progress(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Full progress flow:
    - Generate content for a stage
    - Start progress for one content item
    - Update progress
    - Mark complete
    - Verify via stage content & my-progress endpoints
    """
    _, stage_id = _create_learning_path_without_content(
        api_client, admin_headers, auth_headers
    )

    # Generate content
    gen_resp = api_client.post(
        "/api/content/generate",
        headers=auth_headers,
        json={"stage_id": stage_id, "content_count": 3},
    )
    assert gen_resp.status_code == 201

    stage_content_resp = api_client.get(
        f"/api/content/stage/{stage_id}", headers=auth_headers
    )
    assert stage_content_resp.status_code == 200
    items = stage_content_resp.json()
    assert len(items) > 0
    content_id = items[0]["content_id"]

    # Start progress
    start_resp = api_client.post(
        "/api/content/progress",
        headers=auth_headers,
        json={
            "content_id": content_id,
            "completion_percentage": 10,
            "time_spent_minutes": 5,
        },
    )
    assert start_resp.status_code == 201
    progress = start_resp.json()
    assert progress["content_id"] == content_id
    assert progress["completion_percentage"] == 10

    # Update progress
    update_resp = api_client.put(
        f"/api/content/progress/{content_id}",
        headers=auth_headers,
        json={
            "completion_percentage": 60,
            "time_spent_minutes": 25,
            "notes": "Watched most of the video",
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["completion_percentage"] == 60
    assert updated["time_spent_minutes"] == 25
    assert updated["notes"] == "Watched most of the video"

    # Mark complete
    complete_resp = api_client.post(
        f"/api/content/{content_id}/complete", headers=auth_headers
    )
    assert complete_resp.status_code == 200
    completed = complete_resp.json()
    assert completed["is_completed"] is True
    assert completed["completion_percentage"] == 100

    # Stage progress summary
    stage_progress_resp = api_client.get(
        f"/api/content/stage/{stage_id}/progress", headers=auth_headers
    )
    assert stage_progress_resp.status_code == 200
    stage_summary = stage_progress_resp.json()
    assert stage_summary["stage_id"] == stage_id
    assert stage_summary["total_content_items"] >= 1
    assert stage_summary["completed_items"] >= 1

    # My progress list (all + completed_only)
    all_progress_resp = api_client.get(
        "/api/content/my-progress", headers=auth_headers
    )
    assert all_progress_resp.status_code == 200
    all_progress = all_progress_resp.json()
    assert any(p["content_id"] == content_id for p in all_progress)

    completed_only_resp = api_client.get(
        "/api/content/my-progress",
        headers=auth_headers,
        params={"completed_only": True},
    )
    assert completed_only_resp.status_code == 200
    completed_only = completed_only_resp.json()
    assert any(p["content_id"] == content_id for p in completed_only)

