import uuid
from typing import Dict

import httpx
import pytest

from app.database import SessionLocal
from app import models
from tests.conftest import generate_random_email


@pytest.fixture
def admin_headers(api_client: httpx.Client) -> Dict[str, str]:
    """
    Create a temporary admin user and return authorization headers.

    Flow:
    - Register a normal user via API
    - Promote that user to admin directly in the database
    - Login via API to obtain a valid admin JWT
    """
    email = generate_random_email()
    password = "AdminPass123!"
    full_name = "Test Admin User"

    # 1) Register normal user
    resp = api_client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": full_name,
        },
    )
    assert resp.status_code == 201

    # 2) Promote to admin in the database
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        assert user is not None
        user.role = "admin"
        db.commit()
    finally:
        db.close()

    # 3) Login as this user to get an admin token
    login_resp = api_client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


def _create_track(api_client: httpx.Client, admin_headers: Dict[str, str]) -> int:
    """
    Helper: create a track and return its ID.
    """
    name = f"Assessment Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for assessment tests"}
    resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert resp.status_code == 201
    return resp.json()["track_id"]


# ============================================================================
# Session creation & retrieval
# ============================================================================


def test_create_assessment_session_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str]
) -> None:
    """
    Creating an assessment session without auth should fail (401).
    """
    track_id = _create_track(api_client, admin_headers)
    resp = api_client.post("/api/assessment/sessions", json={"track_id": track_id})
    assert resp.status_code == 401


def test_create_assessment_session_invalid_track(
    api_client: httpx.Client, auth_headers: Dict[str, str]
) -> None:
    """
    Creating an assessment session with non-existent track should return 404.
    """
    resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": 999999},
    )
    assert resp.status_code == 404
    assert "Track not found" in resp.text


def test_create_assessment_session_generates_questions(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Happy path:
    - Create track
    - Create assessment session
    - Verify session is returned
    - Verify questions were generated and linked to session
    """
    track_id = _create_track(api_client, admin_headers)

    # Create assessment session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session = session_resp.json()
    session_id = session["session_id"]
    assert session["track_id"] == track_id
    assert session["status"] == "in_progress"

    # Fetch questions for this session
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    assert questions_resp.status_code == 200
    questions = questions_resp.json()
    # By default, we generate 5 questions in ai_service mock
    assert len(questions) == 5
    for q in questions:
        assert q["track_id"] == track_id
        assert "question_text" in q
        assert q["question_type"] in ["mcq", "logic", "open"]


def test_get_assessment_session_only_owner_can_access(
    api_client: httpx.Client, admin_headers: Dict[str, str]
) -> None:
    """
    Ensure that a different user cannot access another user's assessment session.
    """
    track_id = _create_track(api_client, admin_headers)

    # User A
    user_a_email = generate_random_email()
    user_a_pw = "UserAPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": user_a_email, "password": user_a_pw, "full_name": "User A"},
    )
    login_a = api_client.post(
        "/api/auth/login",
        data={"username": user_a_email, "password": user_a_pw},
    )
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # User B
    user_b_email = generate_random_email()
    user_b_pw = "UserBPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": user_b_email, "password": user_b_pw, "full_name": "User B"},
    )
    login_b = api_client.post(
        "/api/auth/login",
        data={"username": user_b_email, "password": user_b_pw},
    )
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=headers_a,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["session_id"]

    # User B tries to access A's session → 404
    get_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}", headers=headers_b
    )
    assert get_resp.status_code == 404


# ============================================================================
# Answer submission
# ============================================================================


def test_submit_answer_requires_auth(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Submitting an answer without auth should fail (401).
    """
    track_id = _create_track(api_client, admin_headers)

    # Create session as authenticated user
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    session_id = session_resp.json()["session_id"]

    # Get a question
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    question_id = questions_resp.json()[0]["question_id"]

    # Try to submit without auth
    submit_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/submit",
        json={"question_id": question_id, "user_answer": "Test answer"},
    )
    assert submit_resp.status_code == 401


def test_submit_answer_valid_flow(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Submit a valid answer:
    - Ensure the question belongs to the session
    - Ensure AI score and explanation are returned
    """
    track_id = _create_track(api_client, admin_headers)

    # Create session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    session_id = session_resp.json()["session_id"]

    # Get questions
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=auth_headers,
    )
    questions = questions_resp.json()
    q = questions[0]
    question_id = q["question_id"]

    # Submit answer
    submit_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/submit",
        headers=auth_headers,
        json={"question_id": question_id, "user_answer": "My detailed answer"},
    )
    assert submit_resp.status_code == 200
    data = submit_resp.json()
    assert data["session_id"] == session_id
    assert data["question_id"] == question_id
    assert data["ai_score"] is not None
    assert isinstance(data["ai_explanation"], str)
    assert len(data["ai_explanation"]) > 0


def test_submit_answer_question_not_in_session(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Submitting answer for a question not linked to the session should return 400.
    """
    track_id = _create_track(api_client, admin_headers)

    # Create session 1
    session1_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    session1_id = session1_resp.json()["session_id"]

    # Create session 2
    session2_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    session2_id = session2_resp.json()["session_id"]

    # Get a question from session 1
    questions1_resp = api_client.get(
        f"/api/assessment/sessions/{session1_id}/questions",
        headers=auth_headers,
    )
    question1_id = questions1_resp.json()[0]["question_id"]

    # Try to submit that question as part of session 2
    submit_resp = api_client.post(
        f"/api/assessment/sessions/{session2_id}/submit",
        headers=auth_headers,
        json={"question_id": question1_id, "user_answer": "Wrong session"},
    )
    assert submit_resp.status_code == 400
    assert "Question not part of this assessment" in submit_resp.text


# ============================================================================
# Completing assessment & results
# ============================================================================


def _answer_all_questions_for_session(
    api_client: httpx.Client, session_id: int, headers: Dict[str, str]
) -> None:
    """
    Helper: fetch all questions for a session and submit answers for each.
    """
    questions_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/questions",
        headers=headers,
    )
    assert questions_resp.status_code == 200
    questions = questions_resp.json()

    for q in questions:
        submit_resp = api_client.post(
            f"/api/assessment/sessions/{session_id}/submit",
            headers=headers,
            json={
                "question_id": q["question_id"],
                "user_answer": f"Answer for question {q['question_id']}",
            },
        )
        assert submit_resp.status_code == 200


def test_complete_assessment_without_answers_fails(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Trying to complete an assessment with no answers should return 400.
    """
    track_id = _create_track(api_client, admin_headers)
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    session_id = session_resp.json()["session_id"]

    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete", headers=auth_headers
    )
    assert complete_resp.status_code == 400
    assert "No answers submitted yet" in complete_resp.text


def test_complete_assessment_creates_result_and_skill_profile(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Full flow:
    - Create session
    - Answer all questions
    - Complete assessment
    - Verify result and skill profile exist
    """
    track_id = _create_track(api_client, admin_headers)

    # Create session
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session = session_resp.json()
    session_id = session["session_id"]

    # Answer all questions
    _answer_all_questions_for_session(api_client, session_id, auth_headers)

    # Complete assessment
    complete_resp = api_client.post(
        f"/api/assessment/sessions/{session_id}/complete", headers=auth_headers
    )
    assert complete_resp.status_code == 200
    result = complete_resp.json()
    assert result["session_id"] == session_id
    assert result["overall_score"] is not None
    assert result["detected_level"] in ["beginner", "intermediate", "advanced"]

    # Verify result can be fetched via GET
    get_result_resp = api_client.get(
        f"/api/assessment/sessions/{session_id}/result", headers=auth_headers
    )
    assert get_result_resp.status_code == 200

    # Verify skill profile exists in DB
    db = SessionLocal()
    try:
        user_id = session["user_id"]
        profile = db.query(models.SkillProfile).filter(
            models.SkillProfile.user_id == user_id
        ).first()
        assert profile is not None
        assert isinstance(profile.strengths, str)
        assert isinstance(profile.weaknesses, str)
        assert isinstance(profile.thinking_pattern, str)
    finally:
        db.close()


def test_get_my_assessment_sessions_order(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    Ensure /api/assessment/my-sessions returns sessions in descending order by started_at.
    """
    track_id = _create_track(api_client, admin_headers)

    # Create two sessions
    resp1 = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    resp2 = api_client.post(
        "/api/assessment/sessions",
        headers=auth_headers,
        json={"track_id": track_id},
    )
    assert resp1.status_code == 201
    assert resp2.status_code == 201

    list_resp = api_client.get("/api/assessment/my-sessions", headers=auth_headers)
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert len(sessions) >= 2

    # First element should be the most recent session
    assert sessions[0]["session_id"] == resp2.json()["session_id"]

