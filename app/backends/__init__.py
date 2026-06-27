import os
import threading
from typing import Iterator

from app.config import LLM_BACKEND

_backend = None
_backend_lock = threading.Lock()


def get_backend():
    global _backend
    if _backend is not None:
        return _backend
    with _backend_lock:
        if _backend is not None:
            return _backend

        if LLM_BACKEND == "gemini":
            try:
                from app.backends.gemini import GeminiBackend
                _backend = GeminiBackend()
                print(f"  [Backend] Gemini ({GeminiBackend._model_name})")
            except Exception as e:
                raise RuntimeError(
                    f"Gemini 백엔드 초기화 실패: {e}\n"
                    "pip install google-genai\n"
                    "GEMINI_API_KEY 환경 변수 설정 필요"
                )
        else:
            from app.backends.local import LocalLlamaBackend
            _backend = LocalLlamaBackend()
            print(f"  [Backend] Local llama-cpp-python")

        return _backend


def chat(messages: list) -> str:
    return get_backend().chat(messages)


def chat_stream(messages: list) -> Iterator[str]:
    yield from get_backend().chat_stream(messages)


def chat_stream_with_reasoning(messages: list) -> Iterator[dict]:
    yield from get_backend().chat_stream_with_reasoning(messages)
