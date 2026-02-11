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
    name = f"Chat Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for chat tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


def _create_assessment_and_learning_path_with_stage(
    api_client: httpx.Client,
    admin_headers: Dict[str, str],
    auth_headers: Dict[str, str],
) -> Tuple[int, int, int]:
    """
    Helper:
    - Create track
    - Create assessment session
    - Answer all questions
    - Complete assessment
    - Create learning path (auto content OFF)
    Returns: (path_id, first_stage_id, track_id)
    """
    track_id = _create_track(api_client, admin_headers)

    # Assessment session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session = session_resp.json()
    session_id = session["session_id"]

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

    # Learning path (no auto content; not needed for chat)
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

    return path_id, first_stage_id, track_id


# ============================================================================
# Chat session creation
# ============================================================================


def test_create_chat_session_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Creating a chat session without auth should fail with 401.
    """
    _, stage_id, _ = _create_assessment_and_learning_path_with_stage(
        api_client, admin_headers, auth_headers
    )

    resp = api_client.post("/api/chat/sessions", json={"stage_id": stage_id})
    assert resp.status_code == 401


def test_create_chat_session_invalid_stage(
    api_client: httpx.Client, auth_headers: Dict[str, str]
) -> None:
    """
    Using a non-existent stage should return 404.
    """
    resp = api_client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"stage_id": 999999},
    )
    assert resp.status_code == 404
    assert "Learning stage not found" in resp.text


def test_chat_session_flow_and_messages(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Full flow:
    - Have a learning path + stage
    - Create chat session
    - Verify welcome message exists
    - Send a user message and receive AI response
    - Fetch messages and my-sessions
    - Delete chat session
    """
    _, stage_id, _ = _create_assessment_and_learning_path_with_stage(
        api_client, admin_headers, auth_headers
    )

    # Create chat session
    create_resp = api_client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"stage_id": stage_id},
    )
    assert create_resp.status_code == 201
    chat = create_resp.json()
    chat_id = chat["chat_id"]

    # Check session details
    get_resp = api_client.get(f"/api/chat/sessions/{chat_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["chat_id"] == chat_id

    # Initial messages should include AI welcome
    msgs_resp = api_client.get(
        f"/api/chat/sessions/{chat_id}/messages", headers=auth_headers
    )
    assert msgs_resp.status_code == 200
    messages = msgs_resp.json()
    assert len(messages) >= 1
    assert messages[0]["sender"] == "ai"

    # Send a user message
    send_resp = api_client.post(
        f"/api/chat/sessions/{chat_id}/messages",
        headers=auth_headers,
        json={"message_text": "Can you explain this topic?"},
    )
    assert send_resp.status_code == 200
    ai_msg = send_resp.json()
    assert ai_msg["sender"] == "ai"
    assert isinstance(ai_msg["message_text"], str)
    assert len(ai_msg["message_text"]) > 0

    # Fetch messages again; should include user + AI messages
    msgs_resp_2 = api_client.get(
        f"/api/chat/sessions/{chat_id}/messages", headers=auth_headers
    )
    assert msgs_resp_2.status_code == 200
    messages2 = msgs_resp_2.json()
    senders = {m["sender"] for m in messages2}
    assert "user" in senders and "ai" in senders

    # My chat sessions
    my_sessions_resp = api_client.get(
        "/api/chat/my-sessions", headers=auth_headers
    )
    assert my_sessions_resp.status_code == 200
    my_sessions = my_sessions_resp.json()
    assert any(s["chat_id"] == chat_id for s in my_sessions)

    # Delete session
    delete_resp = api_client.delete(
        f"/api/chat/sessions/{chat_id}", headers=auth_headers
    )
    assert delete_resp.status_code == 204

    # Now it should be gone
    get_after_delete = api_client.get(
        f"/api/chat/sessions/{chat_id}", headers=auth_headers
    )
    assert get_after_delete.status_code == 404

