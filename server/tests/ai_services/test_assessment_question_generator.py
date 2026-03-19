"""
Unit tests for app.ai_services.assessment_question_generator
-------------------------------------------------------------
All tests run against the mock AI path — no OpenAI API key required.

Coverage:
  1. Contract tests  – every question has required keys with valid values.
  2. Count tests    – exactly the requested number of questions is returned.
  3. Edge cases     – minimum count, large count.
  4. Utilities      – _validate_and_sanitise.
  5. Integration    – session creation produces questions (dimension_id may be None).
"""

import asyncio
import time
import uuid
from typing import Dict

import httpx
import pytest

from app.ai_services.assessment_question_generator import (
    _mock_questions,
    _validate_and_sanitise,
    generate_assessment_questions,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def run(coro):
    """Run an async coroutine from a synchronous test without pytest-asyncio."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# 1. Contract — required keys and valid values
# ---------------------------------------------------------------------------


def test_each_question_has_required_keys() -> None:
    """Every question must have question_text, question_type, difficulty."""
    questions = run(generate_assessment_questions("Full Stack Development", 10))
    required = {"question_text", "question_type", "difficulty"}
    for q in questions:
        missing = required - q.keys()
        assert not missing, f"Question missing keys {missing}: {q}"


def test_question_type_values_are_valid() -> None:
    """question_type must be one of 'mcq', 'logic', 'open'."""
    questions = run(generate_assessment_questions("Data Science", 10))
    valid = {"mcq", "logic", "open"}
    for q in questions:
        assert q["question_type"] in valid, (
            f"Invalid question_type '{q['question_type']}'"
        )


def test_difficulty_values_are_valid() -> None:
    """difficulty must be one of 'low', 'medium', 'high'."""
    questions = run(generate_assessment_questions("DevOps Engineering", 10))
    valid = {"low", "medium", "high"}
    for q in questions:
        assert q["difficulty"] in valid, (
            f"Invalid difficulty '{q['difficulty']}'"
        )


def test_question_text_is_non_empty_string() -> None:
    """question_text must be a non-empty string."""
    questions = run(generate_assessment_questions("Machine Learning", 10))
    for q in questions:
        assert isinstance(q["question_text"], str)
        assert len(q["question_text"].strip()) > 0


# ---------------------------------------------------------------------------
# 2. Count — exactly the requested number is returned
# ---------------------------------------------------------------------------


def test_returns_exactly_requested_count() -> None:
    questions = run(generate_assessment_questions("Cybersecurity", 10))
    assert len(questions) == 10


def test_returns_exact_count_of_5() -> None:
    questions = run(generate_assessment_questions("Mobile Development", 5))
    assert len(questions) == 5


def test_returns_exact_count_of_15() -> None:
    questions = run(generate_assessment_questions("Cloud Architecture", 15))
    assert len(questions) == 15


# ---------------------------------------------------------------------------
# 3. Edge cases
# ---------------------------------------------------------------------------


def test_count_of_1_returns_one_question() -> None:
    questions = run(generate_assessment_questions("Data Science", 1))
    assert len(questions) == 1


def test_large_count_returns_correct_number() -> None:
    questions = run(generate_assessment_questions("DevOps Engineering", 50))
    assert len(questions) == 50


# ---------------------------------------------------------------------------
# 4. Utilities — _validate_and_sanitise
# ---------------------------------------------------------------------------


def test_validate_sanitise_fixes_invalid_question_type() -> None:
    raw = [
        {
            "question_text": "Some question",
            "question_type": "INVALID_TYPE",
            "difficulty": "medium",
        }
    ]
    result = _validate_and_sanitise(raw)
    assert result[0]["question_type"] == "open"


def test_validate_sanitise_fixes_invalid_difficulty() -> None:
    raw = [
        {
            "question_text": "Some question",
            "question_type": "open",
            "difficulty": "EXTREME",
        }
    ]
    result = _validate_and_sanitise(raw)
    assert result[0]["difficulty"] == "medium"


def test_validate_sanitise_drops_entries_without_question_text() -> None:
    raw = [
        {
            "question_text": "",
            "question_type": "open",
            "difficulty": "medium",
        },
        {
            "question_text": "Valid question?",
            "question_type": "open",
            "difficulty": "medium",
        },
    ]
    result = _validate_and_sanitise(raw)
    assert len(result) == 1
    assert result[0]["question_text"] == "Valid question?"


def test_validate_sanitise_drops_non_dict_entries() -> None:
    raw = ["not a dict", None, 42]
    result = _validate_and_sanitise(raw)
    assert result == []


# ---------------------------------------------------------------------------
# 5. _mock_questions internal helper
# ---------------------------------------------------------------------------


def test_mock_questions_returns_list() -> None:
    assert isinstance(_mock_questions("Full Stack", 10), list)


def test_mock_questions_exact_count() -> None:
    result = _mock_questions("Full Stack", 10)
    assert len(result) == 10


# ---------------------------------------------------------------------------
# 6. Integration — session creation stores questions
# ---------------------------------------------------------------------------


def _make_admin(api_client: httpx.Client) -> Dict[str, str]:
    from tests.conftest import generate_random_email
    from app.database import SessionLocal
    from app import models as m

    email = generate_random_email()
    pw = "AdminPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": email, "password": pw, "full_name": "Admin"},
    )
    db = SessionLocal()
    try:
        user = db.query(m.User).filter(m.User.email == email).first()
        user.role = "admin"
        db.commit()
    finally:
        db.close()
    resp = api_client.post("/api/auth/login", data={"username": email, "password": pw})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _make_user(api_client: httpx.Client) -> Dict[str, str]:
    from tests.conftest import generate_random_email

    email = generate_random_email()
    pw = "UserPass123!"
    api_client.post(
        "/api/auth/register",
        json={"email": email, "password": pw, "full_name": "Tester"},
    )
    resp = api_client.post("/api/auth/login", data={"username": email, "password": pw})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_session_questions_are_created(
    api_client: httpx.Client,
) -> None:
    """
    Full integration flow:
    1. Create a track as admin.
    2. Create an assessment session as a normal user.
    3. Verify that 10 questions were created and linked to the session.
    """
    from app.database import SessionLocal
    from app import models as m

    admin_h = _make_admin(api_client)
    user_h = _make_user(api_client)

    track_name = f"Question Gen Track {uuid.uuid4()}"
    track_resp = api_client.post(
        "/api/tracks/",
        headers=admin_h,
        json={"track_name": track_name, "description": "Track for question gen test"},
    )
    assert track_resp.status_code == 201
    track_id = track_resp.json()["track_id"]

    # Wait for background dimensions (if any) to be written
    time.sleep(1)

    # Create assessment session — this triggers question generation
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=user_h,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201, session_resp.text
    session_id = session_resp.json()["session_id"]

    # Verify 10 questions were created
    db = SessionLocal()
    try:
        session_qs = (
            db.query(m.AssessmentSessionQuestion)
            .filter(m.AssessmentSessionQuestion.session_id == session_id)
            .all()
        )
        assert len(session_qs) == 10, (
            f"Expected 10 questions, got {len(session_qs)}"
        )

        for sq in session_qs:
            q = (
                db.query(m.AssessmentQuestionPool)
                .filter(m.AssessmentQuestionPool.question_id == sq.question_id)
                .first()
            )
            assert q is not None
            assert q.question_text
            assert q.question_type in ("mcq", "logic", "open")
            assert q.difficulty in ("low", "medium", "high")
    finally:
        db.close()
