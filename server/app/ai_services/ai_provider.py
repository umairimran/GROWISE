"""
AI Provider Abstraction
-----------------------
Single place that handles all communication with external AI APIs.
Every AI service in this package calls `get_provider().chat_complete()`
instead of making raw HTTP requests.

Configuration (in .env):
    AI_PROVIDER=openai          # "openai" (default) or "gemini"
    OPENAI_API_KEY=sk-...       # required when AI_PROVIDER=openai
    OPENAI_MODEL=gpt-4o-mini    # optional, default gpt-4o-mini
    GEMINI_API_KEY=AIza...      # required when AI_PROVIDER=gemini
    GEMINI_MODEL=gemini-1.5-flash  # optional, default gemini-1.5-flash

Usage:
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    text = await provider.chat_complete(
        messages=[
            {"role": "system", "content": "Reply with JSON only."},
            {"role": "user",   "content": "Your prompt here ..."},
        ],
        temperature=0.3,
        timeout=45.0,
    )
    data = json.loads(text)

The messages list always uses the OpenAI role convention
(system / user / assistant).  The Gemini backend converts it internally.
"""

import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------


class BaseAIProvider(ABC):
    """Abstract provider — one method to call, one contract to satisfy."""

    @abstractmethod
    async def chat_complete(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        timeout: float = 45.0,
    ) -> str:
        """
        Send a list of chat messages to the AI and return the plain-text reply.

        Parameters
        ----------
        messages    : OpenAI-style list of {"role": ..., "content": ...} dicts.
        temperature : Sampling temperature (0 = deterministic, 1 = creative).
        timeout     : Request timeout in seconds.

        Returns
        -------
        str — the raw text content of the AI reply.

        Raises
        ------
        RuntimeError — if no API key is configured for the chosen provider.
        httpx.HTTPStatusError — on non-2xx responses (caller should catch).
        """


# ---------------------------------------------------------------------------
# OpenAI implementation
# ---------------------------------------------------------------------------


class OpenAIProvider(BaseAIProvider):
    """Calls the OpenAI Chat Completions API (gpt-4o-mini by default)."""

    def __init__(self) -> None:
        self.api_key: str = os.getenv("OPENAI_API_KEY", "")
        self.model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.base_url: str = "https://api.openai.com/v1/chat/completions"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def chat_complete(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        timeout: float = 45.0,
    ) -> str:
        if not self.api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. "
                "Add it to .env or set AI_PROVIDER=openai and provide the key."
            )

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()

        return response.json()["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# Gemini implementation
# ---------------------------------------------------------------------------


class GeminiProvider(BaseAIProvider):
    """
    Calls the Google Gemini generateContent API.

    Converts OpenAI-style messages to Gemini's `contents` format:
      - "system" role  → prepended to the first user turn as plain text
      - "user" role    → Gemini user part
      - "assistant"    → Gemini model part
    """

    def __init__(self) -> None:
        self.api_key: str = os.getenv("GEMINI_API_KEY", "")
        self.model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    @property
    def base_url(self) -> str:
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _convert_messages(self, messages: List[Dict]) -> List[Dict]:
        """
        Convert OpenAI message list → Gemini contents list.

        System messages are extracted and prepended to the first user message
        because Gemini's basic generateContent endpoint does not have a
        separate system role (it is handled via systemInstruction in newer
        versions, but this approach is universally compatible).
        """
        system_parts: List[str] = []
        contents: List[Dict] = []

        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("content", "")

            if role == "system":
                system_parts.append(text)
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": text}]})
            else:  # user
                if system_parts:
                    # Merge system instructions into the first user turn
                    combined = "\n\n".join(system_parts) + "\n\n" + text
                    system_parts = []
                    contents.append({"role": "user", "parts": [{"text": combined}]})
                else:
                    contents.append({"role": "user", "parts": [{"text": text}]})

        # Flush any remaining system messages (edge-case: only system, no user)
        if system_parts:
            contents.append({"role": "user", "parts": [{"text": "\n\n".join(system_parts)}]})

        return contents

    async def chat_complete(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        timeout: float = 45.0,
    ) -> str:
        if not self.api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. "
                "Add it to .env or set AI_PROVIDER=gemini and provide the key."
            )

        contents = self._convert_messages(messages)
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            },
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                self.base_url,
                headers={"Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()

        data = response.json()
        # Gemini response: data["candidates"][0]["content"]["parts"][0]["text"]
        return data["candidates"][0]["content"]["parts"][0]["text"]


# ---------------------------------------------------------------------------
# Factory / singleton
# ---------------------------------------------------------------------------

_provider_instance: Optional[BaseAIProvider] = None


def get_provider() -> BaseAIProvider:
    """
    Return the configured AI provider (singleton, created on first call).

    Reads AI_PROVIDER from environment:
        "openai"  → OpenAIProvider  (default)
        "gemini"  → GeminiProvider
    """
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = _build_provider()
    return _provider_instance


def _build_provider() -> BaseAIProvider:
    name = os.getenv("AI_PROVIDER", "openai").strip().lower()
    if name == "gemini":
        return GeminiProvider()
    return OpenAIProvider()


def reset_provider() -> None:
    """
    Force the singleton to be rebuilt on the next call to get_provider().
    Useful in tests when you need to swap providers mid-run.
    """
    global _provider_instance
    _provider_instance = None
