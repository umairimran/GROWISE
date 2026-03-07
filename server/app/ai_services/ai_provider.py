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
    GEMINI_API_KEY=AIza...      # single key when AI_PROVIDER=gemini
    GEMINI_API_KEYS=key1,key2,key3,key4,key5  # OR multiple keys (round-robin, reduces 429)
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
        use_google_search: bool = False,
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
        use_google_search: bool = False,
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


def _parse_gemini_keys() -> List[str]:
    """
    Parse Gemini API keys from env.
    Supports:
      - GEMINI_API_KEYS=key1,key2,key3,...  (comma-separated, for rotation)
      - GEMINI_API_KEY=key                  (single key, fallback)
    """
    keys_str = os.getenv("GEMINI_API_KEYS", "").strip()
    if keys_str:
        keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        if keys:
            return keys
    single = os.getenv("GEMINI_API_KEY", "").strip()
    return [single] if single else []


class GeminiProvider(BaseAIProvider):
    """
    Calls the Google Gemini generateContent API.

    Supports multiple API keys via GEMINI_API_KEYS=key1,key2,... for round-robin
    rotation to reduce 429 rate-limit errors.

    Converts OpenAI-style messages to Gemini's `contents` format:
      - "system" role  → prepended to the first user turn as plain text
      - "user" role    → Gemini user part
      - "assistant"    → Gemini model part
    """

    def __init__(self) -> None:
        self._api_keys: List[str] = _parse_gemini_keys()
        self._key_index: int = 0
        self.model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    def _next_key(self) -> str:
        """Round-robin: return next key for load balancing across keys."""
        if not self._api_keys:
            return ""
        key = self._api_keys[self._key_index % len(self._api_keys)]
        self._key_index += 1
        return key

    def _base_url_for_key(self, api_key: str) -> str:
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={api_key}"
        )

    def is_configured(self) -> bool:
        return bool(self._api_keys)

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
        use_google_search: bool = False,
    ) -> str:
        if not self._api_keys:
            raise RuntimeError(
                "GEMINI_API_KEY or GEMINI_API_KEYS is not set. "
                "Add it to .env or set AI_PROVIDER=gemini and provide the key(s)."
            )

        contents = self._convert_messages(messages)
        payload: Dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            },
        }
        if use_google_search:
            payload["tools"] = [{"google_search": {}}]

        last_error: Optional[Exception] = None
        keys_to_try = len(self._api_keys)

        for _ in range(keys_to_try):
            api_key = self._next_key()
            url = self._base_url_for_key(api_key)

            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json=payload,
                    )
                    response.raise_for_status()

                data = response.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    prompt_fb = data.get("promptFeedback", {})
                    raise ValueError(
                        f"No candidates in Gemini response. promptFeedback={prompt_fb}"
                    )
                c0 = candidates[0]
                content = c0.get("content")
                if not content:
                    finish = c0.get("finishReason", "unknown")
                    raise ValueError(
                        f"No content in Gemini response (finishReason={finish})"
                    )
                parts = content.get("parts")
                if not parts:
                    raise ValueError("No parts in Gemini response")
                # Collect text from all parts (some may be functionCall, skip those)
                text_parts = []
                for p in parts:
                    if "text" in p and p["text"]:
                        text_parts.append(p["text"])
                text = "".join(text_parts).strip()
                if not text:
                    raise ValueError("No text in Gemini response parts")
                return text

            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code == 429:
                    continue
                raise
            except Exception as e:
                last_error = e
                raise

        if last_error:
            raise last_error
        raise RuntimeError("No Gemini API key succeeded.")

    async def chat_complete_with_google_search(
        self,
        messages: List[Dict],
        temperature: float = 0.5,
        timeout: float = 90.0,
    ) -> str:
        """Call Gemini with Google Search grounding for real-time web content."""
        return await self.chat_complete(
            messages=messages,
            temperature=temperature,
            timeout=timeout,
            use_google_search=True,
        )


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
