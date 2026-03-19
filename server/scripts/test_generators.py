"""
Quick quality check for question generation.
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

    from app.ai_services.assessment_question_generator import generate_assessment_questions

    print("\n--- QUESTIONS ---\n")
    questions = await generate_assessment_questions(track_name, count=10)

    for i, q in enumerate(questions, 1):
        qtype = q.get("question_type", "?")
        diff = q.get("difficulty", "?")
        text = q.get("question_text", "")
        preview = text[:150] + "..." if len(text) > 150 else text
        print(f"{i}. [{qtype}] ({diff})")
        print(f"   {preview}")
        print()
    print(f"Total: {len(questions)} questions")


if __name__ == "__main__":
    asyncio.run(main())
