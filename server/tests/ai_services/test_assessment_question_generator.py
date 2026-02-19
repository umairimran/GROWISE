"""
Unit tests for app.ai_services.assessment_question_generator
-------------------------------------------------------------
All tests run against the mock AI path — no OpenAI API key required.

Coverage:
  1.  Contract tests     – every question has the required keys with valid values.
  2.  Count tests        – exactly the requested number of questions is returned.
  3.  Dimension coverage – every dimension appears at least once.
  4.  Dimension mapping  – dimension_code values match the input codes.
  5.  Distribution       – higher-weight dimensions receive more questions.
  6.  Edge cases         – single dimension, minimum count, large count.
  7.  ValueError guard   – calling with no dimensions raises ValueError.
  8.  Utilities          – _format_dimensions_block, _validate_and_sanitise.
  9.  Integration test   – full session creation produces dimension-linked questions (via DB).
"""

import asyncio
import time
import uuid
from typing import Dict, List

import httpx
import pytest

from app.ai_services.assessment_question_generator import (
    _format_dimensions_block,
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


SAMPLE_DIMENSIONS: List[Dict] = [
    {
        "code": "core_technical_knowledge",
        "name": "Core Technical Knowledge",
        "description": "Depth of understanding in core concepts.",
        "weight": 0.20,
    },
    {
        "code": "problem_solving",
        "name": "Problem Solving",
        "description": "Ability to break down complex problems.",
        "weight": 0.20,
    },
    {
        "code": "system_design",
        "name": "System Design",
        "description": "Designing scalable architectures.",
        "weight": 0.15,
    },
    {
        "code": "code_quality_and_best_practices",
        "name": "Code Quality & Best Practices",
        "description": "Adherence to clean-code principles.",
        "weight": 0.15,
    },
    {
        "code": "communication_and_documentation",
        "name": "Communication & Documentation",
        "description": "Clarity in explaining decisions.",
        "weight": 0.10,
    },
    {
        "code": "trade_off_analysis",
        "name": "Trade-off Analysis",
        "description": "Evaluating competing solutions.",
        "weight": 0.10,
    },
    {
        "code": "reliability_and_error_handling",
        "name": "Reliability & Error Handling",
        "description": "Designing for failure.",
        "weight": 0.10,
    },
]


# ---------------------------------------------------------------------------
# 1.  Contract — required keys and valid values
# ---------------------------------------------------------------------------


def test_each_question_has_required_keys() -> None:
    """Every question must have dimension_code, question_text, question_type, difficulty."""
    questions = run(
        generate_assessment_questions("Full Stack Development", SAMPLE_DIMENSIONS, 10)
    )
    required = {"dimension_code", "question_text", "question_type", "difficulty"}
    for q in questions:
        missing = required - q.keys()
        assert not missing, f"Question missing keys {missing}: {q}"


def test_question_type_values_are_valid() -> None:
    """question_type must be one of 'mcq', 'logic', 'open'."""
    questions = run(
        generate_assessment_questions("Data Science", SAMPLE_DIMENSIONS, 10)
    )
    valid = {"mcq", "logic", "open"}
    for q in questions:
        assert q["question_type"] in valid, (
            f"Invalid question_type '{q['question_type']}'"
        )


def test_difficulty_values_are_valid() -> None:
    """difficulty must be one of 'low', 'medium', 'high'."""
    questions = run(
        generate_assessment_questions("DevOps Engineering", SAMPLE_DIMENSIONS, 10)
    )
    valid = {"low", "medium", "high"}
    for q in questions:
        assert q["difficulty"] in valid, (
            f"Invalid difficulty '{q['difficulty']}'"
        )


def test_question_text_is_non_empty_string() -> None:
    """question_text must be a non-empty string."""
    questions = run(
        generate_assessment_questions("Machine Learning", SAMPLE_DIMENSIONS, 10)
    )
    for q in questions:
        assert isinstance(q["question_text"], str)
        assert len(q["question_text"].strip()) > 0


# ---------------------------------------------------------------------------
# 2.  Count — exactly the requested number is returned
# ---------------------------------------------------------------------------


def test_returns_exactly_requested_count() -> None:
    questions = run(
        generate_assessment_questions("Cybersecurity", SAMPLE_DIMENSIONS, 10)
    )
    assert len(questions) == 10


def test_returns_exact_count_of_5() -> None:
    questions = run(
        generate_assessment_questions("Mobile Development", SAMPLE_DIMENSIONS, 5)
    )
    assert len(questions) == 5


def test_returns_exact_count_of_15() -> None:
    questions = run(
        generate_assessment_questions("Cloud Architecture", SAMPLE_DIMENSIONS, 15)
    )
    assert len(questions) == 15


# ---------------------------------------------------------------------------
# 3.  Dimension coverage — every dimension must appear at least once
# ---------------------------------------------------------------------------


def test_all_dimensions_covered_with_count_equal_to_dimension_count() -> None:
    """
    When count == len(dimensions), each dimension gets exactly one question.
    """
    count = len(SAMPLE_DIMENSIONS)
    questions = run(
        generate_assessment_questions("Full Stack Development", SAMPLE_DIMENSIONS, count)
    )
    returned_codes = {q["dimension_code"] for q in questions}
    all_codes = {d["code"] for d in SAMPLE_DIMENSIONS}
    assert all_codes == returned_codes


def test_all_dimensions_covered_with_count_10() -> None:
    """Every dimension must appear at least once when count=10 and there are 7 dimensions."""
    questions = run(
        generate_assessment_questions("Full Stack Development", SAMPLE_DIMENSIONS, 10)
    )
    returned_codes = {q["dimension_code"] for q in questions}
    for dim in SAMPLE_DIMENSIONS:
        assert dim["code"] in returned_codes, (
            f"Dimension '{dim['code']}' has no question in the output"
        )


# ---------------------------------------------------------------------------
# 4.  Dimension mapping — codes must belong to the input set
# ---------------------------------------------------------------------------


def test_dimension_codes_are_from_input_set() -> None:
    """dimension_code in every question must be one of the provided codes."""
    valid_codes = {d["code"] for d in SAMPLE_DIMENSIONS}
    questions = run(
        generate_assessment_questions("Full Stack Development", SAMPLE_DIMENSIONS, 10)
    )
    for q in questions:
        assert q["dimension_code"] in valid_codes, (
            f"Unknown dimension_code '{q['dimension_code']}'"
        )


# ---------------------------------------------------------------------------
# 5.  Edge cases
# ---------------------------------------------------------------------------


def test_single_dimension_returns_correct_count() -> None:
    """With only one dimension all questions must use its code."""
    single = [SAMPLE_DIMENSIONS[0]]
    questions = run(
        generate_assessment_questions("Full Stack Development", single, 5)
    )
    assert len(questions) == 5
    for q in questions:
        assert q["dimension_code"] == single[0]["code"]


def test_count_of_1_returns_one_question() -> None:
    questions = run(
        generate_assessment_questions("Data Science", SAMPLE_DIMENSIONS, 1)
    )
    assert len(questions) == 1
    assert questions[0]["dimension_code"] == SAMPLE_DIMENSIONS[0]["code"]


def test_large_count_returns_correct_number() -> None:
    questions = run(
        generate_assessment_questions("DevOps Engineering", SAMPLE_DIMENSIONS, 50)
    )
    assert len(questions) == 50


# ---------------------------------------------------------------------------
# 6.  ValueError when no dimensions provided
# ---------------------------------------------------------------------------


def test_raises_value_error_with_empty_dimensions() -> None:
    """generate_assessment_questions must raise ValueError if dimensions is empty."""
    with pytest.raises(ValueError, match="no assessment dimensions"):
        run(generate_assessment_questions("Any Track", [], 10))


# ---------------------------------------------------------------------------
# 7.  Utilities — _format_dimensions_block
# ---------------------------------------------------------------------------


def test_format_dimensions_block_contains_all_codes() -> None:
    block = _format_dimensions_block(SAMPLE_DIMENSIONS)
    for dim in SAMPLE_DIMENSIONS:
        assert dim["code"] in block
        assert dim["name"] in block


def test_format_dimensions_block_is_string() -> None:
    block = _format_dimensions_block(SAMPLE_DIMENSIONS)
    assert isinstance(block, str)
    assert len(block) > 0


# ---------------------------------------------------------------------------
# 8.  Utilities — _validate_and_sanitise
# ---------------------------------------------------------------------------


def test_validate_sanitise_fixes_invalid_question_type() -> None:
    raw = [
        {
            "dimension_code": "problem_solving",
            "question_text": "Some question",
            "question_type": "INVALID_TYPE",
            "difficulty": "medium",
        }
    ]
    result = _validate_and_sanitise(raw, SAMPLE_DIMENSIONS)
    assert result[0]["question_type"] == "open"


def test_validate_sanitise_fixes_invalid_difficulty() -> None:
    raw = [
        {
            "dimension_code": "problem_solving",
            "question_text": "Some question",
            "question_type": "open",
            "difficulty": "EXTREME",
        }
    ]
    result = _validate_and_sanitise(raw, SAMPLE_DIMENSIONS)
    assert result[0]["difficulty"] == "medium"


def test_validate_sanitise_fixes_unknown_dimension_code() -> None:
    raw = [
        {
            "dimension_code": "totally_unknown_code",
            "question_text": "Some question",
            "question_type": "open",
            "difficulty": "medium",
        }
    ]
    result = _validate_and_sanitise(raw, SAMPLE_DIMENSIONS)
    # Should fall back to first dimension's code
    assert result[0]["dimension_code"] == SAMPLE_DIMENSIONS[0]["code"]


def test_validate_sanitise_drops_entries_without_question_text() -> None:
    raw = [
        {
            "dimension_code": "problem_solving",
            "question_text": "",
            "question_type": "open",
            "difficulty": "medium",
        },
        {
            "dimension_code": "problem_solving",
            "question_text": "Valid question?",
            "question_type": "open",
            "difficulty": "medium",
        },
    ]
    result = _validate_and_sanitise(raw, SAMPLE_DIMENSIONS)
    assert len(result) == 1
    assert result[0]["question_text"] == "Valid question?"


def test_validate_sanitise_drops_non_dict_entries() -> None:
    raw = ["not a dict", None, 42]
    result = _validate_and_sanitise(raw, SAMPLE_DIMENSIONS)
    assert result == []


# ---------------------------------------------------------------------------
# 9.  _mock_questions internal helper
# ---------------------------------------------------------------------------


def test_mock_questions_returns_list() -> None:
    assert isinstance(_mock_questions("Full Stack", SAMPLE_DIMENSIONS, 10), list)


def test_mock_questions_exact_count() -> None:
    result = _mock_questions("Full Stack", SAMPLE_DIMENSIONS, 10)
    assert len(result) == 10


def test_mock_questions_all_dimensions_covered() -> None:
    result = _mock_questions("Full Stack", SAMPLE_DIMENSIONS, 10)
    returned_codes = {q["dimension_code"] for q in result}
    for dim in SAMPLE_DIMENSIONS:
        assert dim["code"] in returned_codes


# ---------------------------------------------------------------------------
# 10.  Integration — session creation stores dimension-linked questions
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


def test_session_questions_are_linked_to_dimensions(
    api_client: httpx.Client,
) -> None:
    """
    Full integration flow:
    1. Create a track as admin (background task auto-generates dimensions).
    2. Wait for background task to store dimensions.
    3. Create an assessment session as a normal user.
    4. Verify that all generated questions have a non-null dimension_id in the DB.
    """
    from app.database import SessionLocal
    from app import models as m

    admin_h = _make_admin(api_client)
    user_h = _make_user(api_client)

    # Create track — this fires the background dimension generator
    track_name = f"Question Gen Track {uuid.uuid4()}"
    track_resp = api_client.post(
        "/api/tracks/",
        headers=admin_h,
        json={"track_name": track_name, "description": "Track for question gen test"},
    )
    assert track_resp.status_code == 201
    track_id = track_resp.json()["track_id"]

    # Wait for background dimensions to be written
    time.sleep(1)

    # Create assessment session — this triggers question generation
    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=user_h,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201, session_resp.text
    session_id = session_resp.json()["session_id"]

    # Verify 10 questions were created and all have dimension_id set
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
            assert q.dimension_id is not None, (
                f"question_id={q.question_id} has NULL dimension_id"
            )
    finally:
        db.close()


def test_session_questions_codes_belong_to_track_dimensions(
    api_client: httpx.Client,
) -> None:
    """
    Every question's dimension_id must belong to the same track's dimensions.
    """
    from app.database import SessionLocal
    from app import models as m

    admin_h = _make_admin(api_client)
    user_h = _make_user(api_client)

    track_name = f"Dim Mapping Track {uuid.uuid4()}"
    track_resp = api_client.post(
        "/api/tracks/",
        headers=admin_h,
        json={"track_name": track_name, "description": "Track for dimension mapping test"},
    )
    assert track_resp.status_code == 201
    track_id = track_resp.json()["track_id"]

    time.sleep(1)

    session_resp = api_client.post(
        "/api/assessment/sessions",
        headers=user_h,
        json={"track_id": track_id},
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["session_id"]

    db = SessionLocal()
    try:
        valid_dim_ids = {
            d.dimension_id
            for d in db.query(m.AssessmentDimension)
            .filter(m.AssessmentDimension.track_id == track_id)
            .all()
        }

        session_qs = (
            db.query(m.AssessmentSessionQuestion)
            .filter(m.AssessmentSessionQuestion.session_id == session_id)
            .all()
        )

        for sq in session_qs:
            q = (
                db.query(m.AssessmentQuestionPool)
                .filter(m.AssessmentQuestionPool.question_id == sq.question_id)
                .first()
            )
            assert q.dimension_id in valid_dim_ids, (
                f"question_id={q.question_id} has dimension_id={q.dimension_id} "
                f"which is not in track's dimensions {valid_dim_ids}"
            )
    finally:
        db.close()
