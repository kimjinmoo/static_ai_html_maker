"""외부 Ollama HTTP API 백엔드. stdlib urllib만 사용(신규 의존성 없음).

Ollama /api/chat 는 NDJSON 스트림을 반환한다. 각 줄:
  {"message": {"role":"assistant", "content":"...", "thinking":"..."}, "done": bool}
reasoning 모델은 message.thinking 으로 사고 과정을 분리해 준다."""

import json
import urllib.request

from app.backends.base import ModelBackend
from app.config import OLLAMA_HOST, OLLAMA_MODEL, CHAT_SAMPLING


class OllamaBackend(ModelBackend):
    def __init__(self):
        self._host = OLLAMA_HOST.rstrip("/")
        self._model = OLLAMA_MODEL

    def _request(self, messages, think=False):
        body = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "think": think,
            "options": {
                "temperature": CHAT_SAMPLING.get("temperature", 0.6),
                "top_p": CHAT_SAMPLING.get("top_p", 0.95),
                "top_k": CHAT_SAMPLING.get("top_k", 20),
                "num_predict": CHAT_SAMPLING.get("max_tokens", 8192),
            },
        }
        req = urllib.request.Request(
            f"{self._host}/api/chat",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return urllib.request.urlopen(req, timeout=600)

    def _iter_lines(self, resp):
        with resp:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    def chat(self, messages):
        out = []
        for obj in self._iter_lines(self._request(messages)):
            out.append(obj.get("message", {}).get("content", "") or "")
        return "".join(out)

    def chat_stream(self, messages):
        for obj in self._iter_lines(self._request(messages)):
            content = obj.get("message", {}).get("content", "") or ""
            if content:
                yield content

    def chat_stream_with_reasoning(self, messages):
        for obj in self._iter_lines(self._request(messages, think=True)):
            msg = obj.get("message", {})
            thinking = msg.get("thinking") or ""
            if thinking:
                yield {"type": "reasoning", "text": thinking}
            content = msg.get("content", "") or ""
            if content:
                yield {"type": "content", "text": content}
