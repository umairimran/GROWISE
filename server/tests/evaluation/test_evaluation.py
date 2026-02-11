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
    name = f"Eval Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for evaluation tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


def _create_learning_path_for_evaluation(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> int:
    """
    Helper:
    - Create track
    - Assessment (session + answers + complete)
    - Learning path (auto_generate_content=False is fine)
    Returns: path_id
    """
    track_id = _create_track(api_client, admin_headers)

    # Assessment session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["session_id"]

    # Questions
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    assert questions_resp.status_code == 200
    questions = questions_resp.json()
    assert len(questions) > 0

    # Answer all
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

    # Complete
    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete",
        headers=auth_headers,
    )
    assert complete_resp.status_code == 200
    result_id = complete_resp.json()["result_id"]

    # Learning path
    lp_resp = api_client.post(
        "/api/learning/paths",
        headers=auth_headers,
        json={"result_id": result_id},
    )
    assert lp_resp.status_code == 201
    return lp_resp.json()["path_id"]


# ============================================================================
# Evaluation session creation
# ============================================================================


def test_create_evaluation_session_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Creating evaluation session without auth should fail with 401.
    """
    path_id = _create_learning_path_for_evaluation(
        api_client, admin_headers, auth_headers
    )

    resp = api_client.post(
        "/api/evaluation/sessions",
        json={"path_id": path_id},
    )
    assert resp.status_code == 401


def test_create_evaluation_session_invalid_path(
    api_client: httpx.Client, auth_headers: Dict[str, str]
) -> None:
    """
    Using a non-existent path_id should return 404.
    """
    resp = api_client.post(
        "/api/evaluation/sessions",
        headers=auth_headers,
        json={"path_id": 999999},
    )
    assert resp.status_code == 404
    assert "Learning path not found" in resp.text


def test_evaluation_conversation_and_complete_flow(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Full flow:
    - Create learning path
    - Create evaluation session
    - Check initial AI message exists
    - Respond multiple times
    - Complete evaluation
    - Fetch evaluation result
    """
    path_id = _create_learning_path_for_evaluation(
        api_client, admin_headers, auth_headers
    )

    # Create evaluation session
    create_resp = api_client.post(
        "/api/evaluation/sessions",
        headers=auth_headers,
        json={"path_id": path_id},
    )
    assert create_resp.status_code == 201
    session = create_resp.json()
    evaluation_id = session["evaluation_id"]

    # Check initial dialogues
    dialogues_resp = api_client.get(
        f"/api/evaluation/sessions/{evaluation_id}/dialogues",
        headers=auth_headers,
    )
    assert dialogues_resp.status_code == 200
    dialogues = dialogues_resp.json()
    assert len(dialogues) >= 1
    assert dialogues[0]["speaker"] == "ai"

    # Respond a few times
    for _ in range(2):
        resp = api_client.post(
            f"/api/evaluation/sessions/{evaluation_id}/respond",
            headers=auth_headers,
            json={"message_text": "Here is my detailed explanation."},
        )
        assert resp.status_code == 200
        ai_reply = resp.json()
        assert ai_reply["speaker"] == "ai"
        assert isinstance(ai_reply["message_text"], str)

    # Complete evaluation
    complete_resp = api_client.post(
        f"/api/evaluation/sessions/{evaluation_id}/complete",
        headers=auth_headers,
    )
    assert complete_resp.status_code == 200
    result = complete_resp.json()
    assert result["evaluation_id"] == evaluation_id
    assert result["reasoning_score"] is not None
    assert result["problem_solving"] is not None
    assert result["readiness_level"] in ["junior", "mid", "senior_ready"]

    # Result via GET
    get_result_resp = api_client.get(
        f"/api/evaluation/sessions/{evaluation_id}/result",
        headers=auth_headers,
    )
    assert get_result_resp.status_code == 200


def test_get_my_evaluation_sessions_order(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Ensure /api/evaluation/my-sessions returns sessions ordered by started_at desc.
    """
    path_id = _create_learning_path_for_evaluation(
        api_client, admin_headers, auth_headers
    )

    # Create two sessions
    resp1 = api_client.post(
        "/api/evaluation/sessions",
        headers=auth_headers,
        json={"path_id": path_id},
    )
    assert resp1.status_code == 201

    resp2 = api_client.post(
        "/api/evaluation/sessions",
        headers=auth_headers,
        json={"path_id": path_id},
    )
    assert resp2.status_code == 201

    list_resp = api_client.get(
        "/api/evaluation/my-sessions", headers=auth_headers
    )
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert len(sessions) >= 2
    assert sessions[0]["evaluation_id"] == resp2.json()["evaluation_id"]

