"""
Quick quality check for dimension + question generation.
Run from server folder: python scripts/test_generators.py

Set USE_MOCK_AI=false and OPENAI_API_KEY (or GEMINI_API_KEY) in .env for real AI.
"""
import asyncio
import os
import sys

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


async def main():
    track_name = os.getenv("TEST_TRACK", "Full Stack Development")
    use_mock = os.getenv("USE_MOCK_AI", "true").lower() == "true"

    print("=" * 60)
    print(f"Track: {track_name}")
    print(f"Mode: {'MOCK' if use_mock else 'REAL AI'}")
    print("=" * 60)

    # Step 1: Generate dimensions
    from app.ai_services.assessment_dimensions_generator import (
        generate_assessment_dimensions,
        _make_code,
    )

    print("\n--- DIMENSIONS ---\n")
    dimensions = await generate_assessment_dimensions(track_name)

    # Ensure code exists (AI path may not include it)
    for d in dimensions:
        if not d.get("code"):
            d["code"] = _make_code(d["name"])

    for i, d in enumerate(dimensions, 1):
        print(f"{i}. {d.get('name', '?')} (weight: {d.get('weight', 0):.3f})")
        desc = d.get("description", "")
        print(f"   {desc[:90]}{'...' if len(desc) > 90 else ''}")
    print(f"\nTotal: {len(dimensions)} | Weights sum: {sum(d.get('weight', 0) for d in dimensions):.3f}")

    # Step 2: Generate questions
    from app.ai_services.assessment_question_generator import generate_assessment_questions

    print("\n--- QUESTIONS ---\n")
    questions = await generate_assessment_questions(track_name, dimensions, count=10)

    for i, q in enumerate(questions, 1):
        qtype = q.get("question_type", "?")
        dim_code = q.get("dimension_code", "?")
        diff = q.get("difficulty", "?")
        text = q.get("question_text", "")
        preview = text[:150] + "..." if len(text) > 150 else text
        print(f"{i}. [{qtype}] {dim_code} ({diff})")
        print(f"   {preview}")
        print()
    print(f"Total: {len(questions)} questions")


if __name__ == "__main__":
    asyncio.run(main())
