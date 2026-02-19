"""
Unit tests for app.ai_services.assessment_dimensions_generator
---------------------------------------------------------------
All tests run entirely against the mock AI path — no OpenAI API key required.

Coverage:
  1.  _normalise_weights  – pure utility, tested with multiple edge-cases.
  2.  generate_assessment_dimensions  – public async entry point.
  3.  Mock output contract  – correct keys, valid weights, count in range.
  4.  Return is a deep copy  – mutations must not affect the internal constant.
  5.  Different track names  – mock always returns a valid set regardless of input.
"""

import asyncio
from typing import Dict, List

import pytest

from app.ai_services.assessment_dimensions_generator import (
    _mock_dimensions,
    _normalise_weights,
    generate_assessment_dimensions,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def run(coro):
    """Run an async coroutine from a synchronous test."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# 1.  _normalise_weights  –  pure function
# ---------------------------------------------------------------------------


def test_normalise_weights_already_correct() -> None:
    """
    When weights already sum to 1.0, values should remain unchanged.
    """
    dims = [
        {"name": "A", "description": "d", "weight": 0.5},
        {"name": "B", "description": "d", "weight": 0.5},
    ]
    result = _normalise_weights(dims)
    total = sum(d["weight"] for d in result)
    assert round(total, 4) == 1.0


def test_normalise_weights_scales_up() -> None:
    """
    Weights that sum to 0.5 should be doubled so they sum to 1.0.
    """
    dims = [
        {"name": "A", "description": "d", "weight": 0.25},
        {"name": "B", "description": "d", "weight": 0.25},
    ]
    result = _normalise_weights(dims)
    assert round(sum(d["weight"] for d in result), 4) == 1.0
    assert result[0]["weight"] == result[1]["weight"]


def test_normalise_weights_handles_uneven_distribution() -> None:
    """
    Weights that drift from 1.0 due to rounding are corrected.
    """
    dims = [{"name": str(i), "description": "d", "weight": 0.111} for i in range(9)]
    result = _normalise_weights(dims)
    assert round(sum(d["weight"] for d in result), 4) == 1.0


def test_normalise_weights_zero_total_distributes_evenly() -> None:
    """
    If all weights are 0, each dimension should receive an equal share.
    """
    dims = [{"name": str(i), "description": "d", "weight": 0} for i in range(4)]
    result = _normalise_weights(dims)
    total = round(sum(d["weight"] for d in result), 4)
    assert total == 1.0
    first = result[0]["weight"]
    assert all(d["weight"] == first for d in result)


def test_normalise_weights_single_item() -> None:
    """
    A single dimension's weight must be normalised to exactly 1.0.
    """
    dims = [{"name": "Solo", "description": "d", "weight": 0.42}]
    result = _normalise_weights(dims)
    assert result[0]["weight"] == 1.0


def test_normalise_weights_preserves_other_keys() -> None:
    """
    _normalise_weights must not drop or alter non-weight keys.
    """
    dims = [
        {"name": "X", "description": "desc-x", "weight": 0.6},
        {"name": "Y", "description": "desc-y", "weight": 0.4},
    ]
    result = _normalise_weights(dims)
    assert result[0]["name"] == "X"
    assert result[0]["description"] == "desc-x"
    assert result[1]["name"] == "Y"


# ---------------------------------------------------------------------------
# 2.  generate_assessment_dimensions  –  public async function
# ---------------------------------------------------------------------------


def test_generate_returns_list() -> None:
    """
    Return type must be a list.
    """
    result = run(generate_assessment_dimensions("Python"))
    assert isinstance(result, list)


def test_generate_returns_at_least_eight_dimensions() -> None:
    """
    The prompt requires 8-12 dimensions; mock provides exactly 9.
    """
    result = run(generate_assessment_dimensions("Data Science"))
    assert len(result) >= 8


def test_generate_returns_at_most_twelve_dimensions() -> None:
    """
    Upper bound from the prompt specification.
    """
    result = run(generate_assessment_dimensions("DevOps"))
    assert len(result) <= 12


def test_generate_weights_sum_to_one() -> None:
    """
    All weights must sum to 1.0 (tolerance ±0.01 to cover float rounding).
    """
    result = run(generate_assessment_dimensions("Full Stack Development"))
    total = sum(float(d["weight"]) for d in result)
    assert abs(total - 1.0) <= 0.01, f"Weights sum to {total}, expected ~1.0"


def test_generate_each_dimension_has_required_keys() -> None:
    """
    Every dimension dict must contain exactly name, description, weight.
    """
    result = run(generate_assessment_dimensions("Machine Learning"))
    required = {"name", "description", "weight"}
    for dim in result:
        missing = required - dim.keys()
        assert not missing, f"Dimension missing keys: {missing}  →  {dim}"


def test_generate_name_is_non_empty_string() -> None:
    """
    name must be a non-empty string for every dimension.
    """
    result = run(generate_assessment_dimensions("Cybersecurity"))
    for dim in result:
        assert isinstance(dim["name"], str)
        assert len(dim["name"].strip()) > 0


def test_generate_description_is_non_empty_string() -> None:
    """
    description must be a non-empty string for every dimension.
    """
    result = run(generate_assessment_dimensions("Cloud Architecture"))
    for dim in result:
        assert isinstance(dim["description"], str)
        assert len(dim["description"].strip()) > 0


def test_generate_weight_is_numeric_between_zero_and_one() -> None:
    """
    Each individual weight must be in the range [0, 1].
    """
    result = run(generate_assessment_dimensions("Blockchain"))
    for dim in result:
        w = float(dim["weight"])
        assert 0.0 <= w <= 1.0, f"Weight {w} is out of range for dimension '{dim['name']}'"


# ---------------------------------------------------------------------------
# 3.  Different track names produce valid results
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "track_name",
    [
        "Full Stack Development",
        "Data Science",
        "DevOps Engineering",
        "Mobile Development",
        "Cybersecurity",
        "Machine Learning",
    ],
)
def test_generate_valid_for_various_tracks(track_name: str) -> None:
    """
    Mock must return a valid set of dimensions for any track name.
    """
    result = run(generate_assessment_dimensions(track_name))
    assert len(result) >= 8
    total = sum(float(d["weight"]) for d in result)
    assert abs(total - 1.0) <= 0.01


# ---------------------------------------------------------------------------
# 4.  Deep-copy safety
# ---------------------------------------------------------------------------


def test_mutating_result_does_not_affect_subsequent_calls() -> None:
    """
    The returned list must be a fresh copy — mutating it must not corrupt
    the internal _MOCK_DIMENSIONS constant.
    """
    first = run(generate_assessment_dimensions("Test Track"))
    first[0]["name"] = "MUTATED"
    first[0]["weight"] = 99.99

    second = run(generate_assessment_dimensions("Test Track"))
    assert second[0]["name"] != "MUTATED"
    assert second[0]["weight"] != 99.99


# ---------------------------------------------------------------------------
# 5.  _mock_dimensions  –  internal helper
# ---------------------------------------------------------------------------


def test_mock_dimensions_returns_list() -> None:
    assert isinstance(_mock_dimensions(), list)


def test_mock_dimensions_count_in_expected_range() -> None:
    result = _mock_dimensions()
    assert 8 <= len(result) <= 12


def test_mock_dimensions_weights_sum_to_one() -> None:
    result = _mock_dimensions()
    total = sum(float(d["weight"]) for d in result)
    assert abs(total - 1.0) <= 0.01


def test_mock_dimensions_all_required_keys_present() -> None:
    for dim in _mock_dimensions():
        assert "name" in dim
        assert "description" in dim
        assert "weight" in dim


def test_mock_dimensions_returns_deep_copy_each_time() -> None:
    a = _mock_dimensions()
    b = _mock_dimensions()
    a[0]["name"] = "CHANGED"
    assert b[0]["name"] != "CHANGED"
