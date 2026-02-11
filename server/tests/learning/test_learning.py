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
    Reuses the same pattern as tracks/assessment tests.
    """
    email = generate_random_email()
    password = "AdminPass123!"

    # Register normal user
    resp = api_client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Test Admin User",
        },
    )
    assert resp.status_code == 201

    # Promote to admin in DB
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        assert user is not None
        user.role = "admin"
        db.commit()
    finally:
        db.close()

    # Login and return headers
    login = api_client.post(
        "/api/auth/login", data={"username": email, "password": password}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_track(api_client: httpx.Client, admin_headers: Dict[str, str]) -> int:
    """Helper: create a track and return its ID."""
    name = f"LP Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for learning path tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


def _create_assessment_and_result(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> Tuple[int, int, int]:
    """
    Full assessment flow:
    - Create track
    - Create assessment session
    - Answer all questions
    - Complete assessment

    Returns: (result_id, session_id, track_id)
    """
    # 1) Track
    track_id = _create_track(api_client, admin_headers)

    # 2) Assessment session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session = session_resp.json()
    session_id = session["session_id"]

    # 3) Questions
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    assert questions_resp.status_code == 200
    questions = questions_resp.json()
    assert len(questions) > 0

    # 4) Answer all questions
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

    # 5) Complete assessment
    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete", headers=auth_headers
    )
    assert complete_resp.status_code == 200
    result = complete_resp.json()
    result_id = result["result_id"]

    return result_id, session_id, track_id


# ============================================================================
# Learning Path creation & retrieval
# ============================================================================


def test_create_learning_path_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Creating a learning path without auth should fail with 401.
    """
    result_id, _, _ = _create_assessment_and_result(
        api_client, admin_headers, auth_headers
    )

    resp = api_client.post(
        "/api/learning/paths",
        json={"result_id": result_id},
    )
    assert resp.status_code == 401


def test_create_learning_path_invalid_result_id(
    api_client: httpx.Client, auth_headers: Dict[str, str]
) -> None:
    """
    Using a non-existent result_id should return 404.
    """
    resp = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        json={"result_id": 999999},
    )
    assert resp.status_code == 404
    assert "Assessment result not found" in resp.text


def test_create_learning_path_full_flow_with_auto_content(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Full flow:
    - Complete assessment (creates skill profile)
    - Create learning path with auto_generate_content=True
    - Verify stages exist
    - Verify each stage has generated content via /api/content/stage/{stage_id}
    """
    result_id, _, _ = _create_assessment_and_result(
        api_client, admin_headers, auth_headers
    )

    # Create learning path
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

    # Each stage should have content generated
    for stage in stages:
        stage_id = stage["stage_id"]
        content_resp = api_client.get(
            f"/api/content/stage/{stage_id}", headers=auth_headers
        )
        assert content_resp.status_code == 200
        items = content_resp.json()
        assert len(items) > 0


def test_get_my_learning_paths_and_current(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Ensure:
    - /api/learning/my-paths returns at least one path
    - /api/learning/my-current-path returns the most recent path
    """
    result_id, _, _ = _create_assessment_and_result(
        api_client, admin_headers, auth_headers
    )

    # Create first path
    lp1 = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        json={"result_id": result_id},
    )
    assert lp1.status_code == 201

    # Create second path (simulate new assessment result reuse)
    lp2 = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        json={"result_id": result_id},
    )
    assert lp2.status_code == 201
    latest_path_id = lp2.json()["path_id"]

    # my-paths
    list_resp = api_client.get("/api/learning/my-paths", headers=auth_headers)
    assert list_resp.status_code == 200
    paths = list_resp.json()
    assert len(paths) >= 2

    # my-current-path
    current_resp = api_client.get(
        "/api/learning/my-current-path", headers=auth_headers
    )
    assert current_resp.status_code == 200
    current = current_resp.json()
    assert current["path_id"] == latest_path_id


def test_get_stage_and_path_stages_authorization(
    api_client: httpx.Client, admin_headers: Dict[str, str]
) -> None:
    """
    Verify:
    - Stages can be fetched by owner
    - Other users cannot access stages of a path they don't own
    """
    # User A
    email_a = generate_random_email()
    pw_a = "UserAPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": email_a, "password": pw_a, "full_name": "User A"},
    )
    login_a = api_client.post(
        "/api/auth/login", data={"username": email_a, "password": pw_a}
    )
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Complete assessment + learning path for user A
    result_id_a, _, _ = _create_assessment_and_result(
        api_client, admin_headers, headers_a
    )
    lp_a = api_client.post(
        "/api/learning/paths",
        headers=headers_a,
        json={"result_id": result_id_a},
    )
    path_id_a = lp_a.json()["path_id"]

    # Get stages for path A
    stages_resp = api_client.get(
        f"/api/learning/paths/{path_id_a}/stages", headers=headers_a
    )
    assert stages_resp.status_code == 200
    stages = stages_resp.json()
    assert len(stages) > 0
    stage_id = stages[0]["stage_id"]

    # User B
    email_b = generate_random_email()
    pw_b = "UserBPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": email_b, "password": pw_b, "full_name": "User B"},
    )
    login_b = api_client.post(
        "/api/auth/login", data={"username": email_b, "password": pw_b}
    )
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B should NOT be able to access A's stage
    stage_resp_b = api_client.get(
        f"/api/learning/stages/{stage_id}", headers=headers_b
    )
    assert stage_resp_b.status_code in (403, 404)

