"""OpenAI 호환 백엔드. base_url만 바꾸면 OpenAI / DeepSeek / Groq / Together /
OpenRouter / 로컬 vLLM·LM Studio 등 OpenAI 호환 API를 모두 쓸 수 있다.
stdlib urllib만 사용(신규 의존성 없음). /chat/completions SSE 스트리밍."""

import json
import urllib.request

from app.backends.base import ModelBackend
from app.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, CHAT_SAMPLING


class OpenAICompatBackend(ModelBackend):
    def __init__(self, api_key=None, base_url=None, model=None):
        self._key = api_key or OPENAI_API_KEY
        self._base = (base_url or OPENAI_BASE_URL).rstrip("/")
        self._model = model or OPENAI_MODEL

    def _request(self, messages, stream):
        body = {
            "model": self._model,
            "messages": messages,
            "stream": stream,
            "temperature": CHAT_SAMPLING.get("temperature", 0.6),
            "top_p": CHAT_SAMPLING.get("top_p", 0.95),
            "max_tokens": CHAT_SAMPLING.get("max_tokens", 8192),
        }
        req = urllib.request.Request(
            self._base + "/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + (self._key or "")},
            method="POST",
        )
        return urllib.request.urlopen(req, timeout=600)

    def chat(self, messages):
        with self._request(messages, False) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (data.get("choices", [{}])[0].get("message", {}).get("content", "") or "")

    def _iter_sse(self, resp):
        with resp:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    yield json.loads(payload)
                except json.JSONDecodeError:
                    continue

    def chat_stream(self, messages):
        for obj in self._iter_sse(self._request(messages, True)):
            delta = (obj.get("choices") or [{}])[0].get("delta", {})
            content = delta.get("content", "") or ""
            if content:
                yield content

    def chat_stream_with_reasoning(self, messages):
        for obj in self._iter_sse(self._request(messages, True)):
            delta = (obj.get("choices") or [{}])[0].get("delta", {})
            reasoning = delta.get("reasoning_content") or delta.get("reasoning") or ""
            if reasoning:
                yield {"type": "reasoning", "text": reasoning}
            content = delta.get("content", "") or ""
            if content:
                yield {"type": "content", "text": content}
