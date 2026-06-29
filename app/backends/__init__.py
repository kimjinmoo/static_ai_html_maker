import threading
from typing import Iterator

_backend = None
_backend_lock = threading.Lock()


def get_backend():
    global _backend
    if _backend is not None:
        return _backend
    with _backend_lock:
        if _backend is not None:
            return _backend

        from app.settings import get_effective_config
        cfg = get_effective_config()
        backend = cfg.get("llm_backend", "local")

        if backend == "ollama":
            from app.backends.ollama import OllamaBackend
            _backend = OllamaBackend(host=cfg.get("ollama_host"), model=cfg.get("ollama_model"))
            print(f"  [Backend] Ollama ({cfg.get('ollama_model')} @ {cfg.get('ollama_host')})")
        elif backend == "gemini":
            try:
                from app.backends.gemini import GeminiBackend
                _backend = GeminiBackend(api_key=cfg.get("gemini_api_key"), model=cfg.get("gemini_model"))
                print(f"  [Backend] Gemini ({cfg.get('gemini_model')})")
            except Exception as e:
                raise RuntimeError(
                    f"Gemini 백엔드 초기화 실패: {e}\n"
                    "pip install google-genai\n"
                    "GEMINI_API_KEY 설정 필요 (env 또는 웹 설정)"
                )
        else:
            from app.backends.local import LocalLlamaBackend
            _backend = LocalLlamaBackend(model_path=cfg.get("model_path"))
            print(f"  [Backend] Local llama-cpp-python")

        return _backend


def reset_backend():
    """싱글톤 + 로컬 모델 캐시를 해제한다. 웹 설정 저장 후 호출하면
    재시작 없이 다음 호출에서 새 설정으로 백엔드를 다시 만든다."""
    global _backend
    with _backend_lock:
        _backend = None
        try:
            import app.backends.local as _local
            _local._llama = None
        except Exception:
            pass


def chat(messages: list) -> str:
    return get_backend().chat(messages)


def chat_stream(messages: list) -> Iterator[str]:
    yield from get_backend().chat_stream(messages)


def chat_stream_with_reasoning(messages: list) -> Iterator[dict]:
    yield from get_backend().chat_stream_with_reasoning(messages)
