import os
import sys
import threading

from app.backends.base import ModelBackend
from app.config import LLAMA_KWARGS, N_GPU_LAYERS, N_CTX, N_BATCH, N_UBATCH, N_THREADS, CHAT_SAMPLING
from app.utils import find_model_file


_llama = None
_llama_lock = threading.Lock()


def _setup_windows_cuda_path():
    if sys.platform != "win32":
        return
    extra = []
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        meipass = sys._MEIPASS
        extra.append(meipass)
        lib_dir = os.path.join(meipass, 'llama_cpp', 'lib')
        if os.path.isdir(lib_dir):
            extra.append(lib_dir)
            os.environ["CUDA_PATH"] = lib_dir
    else:
        nvidia_base = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".venv-nvidia", "Lib", "site-packages", "nvidia")
        if os.path.isdir(nvidia_base):
            for root, dirs, files in os.walk(nvidia_base):
                for f in files:
                    if f.endswith(".dll"):
                        d = os.path.dirname(os.path.join(root, f))
                        if d not in extra:
                            extra.append(d)
    if not extra:
        return
    sep = ";" if ";" in os.environ.get("PATH", "") else os.pathsep
    os.environ["PATH"] = sep.join(extra) + sep + os.environ.get("PATH", "")


class LocalLlamaBackend(ModelBackend):
    def __init__(self):
        self._llm = None

    def _get_llm(self):
        global _llama
        if _llama is not None:
            return _llama
        with _llama_lock:
            if _llama is not None:
                return _llama
            _llama = self._load_model()
            return _llama

    def _load_model(self):
        model_path = find_model_file()
        if not model_path:
            raise FileNotFoundError(
                "GGUF \xeb\xaa\xa8\xeb\x8d\xb8 \xed\x8c\x8c\xec\x9d\xbc\xec\x9d\x84 \xec\xb0\xbe\xec\x9d\x84 \xec\x88\x98 \xec\x97\x86\xec\x8a\xb5\xeb\x8b\x88\xeb\x8b\xa4.\n"
                "1. models/ \xed\x8f\xb4\xeb\x8d\x94\xec\x97\x90 .gguf \xed\x8c\x8c\xec\x9d\xbc\xec\x9d\x84 \xeb\xb0\xb0\xec\xb9\x98\xed\x95\x98\xea\xb1\xb0\xeb\x82\x98\n"
                "2. MODEL_PATH \xed\x99\x98\xea\xb2\xbd \xeb\xb3\x80\xec\x88\x98\xeb\xa1\x9c \xeb\xaa\xa8\xeb\x8d\xb8 \xed\x8c\x8c\xec\x9d\xbc \xea\xb2\xbd\xeb\xa1\x9c\xeb\xa5\xbc \xec\x84\xa4\xec\xa0\x95\xed\x95\x98\xec\x84\xb8\xec\x9a\x94.\n"
                "\xec\x98\x88: MODEL_PATH=./models/ornith-1.0-9b-Q4_K_M.gguf python app.py"
            )

        print(f"\n\u23f3 \xeb\xaa\xa8\xeb\x8d\xb8 \xeb\xa1\x9c\xeb\x94\xa9 \xec\x8b\x9c\xec\x9e\x91: {os.path.basename(model_path)}")
        print(f"   n_ctx={N_CTX}, n_gpu_layers={N_GPU_LAYERS}, n_batch={N_BATCH}, n_ubatch={N_UBATCH}, n_threads={N_THREADS}")

        _setup_windows_cuda_path()
        from llama_cpp import Llama

        try:
            from llama_cpp import llama_supports_gpu_offload
            has_gpu = llama_supports_gpu_offload()
            print(f"   [Backend] GPU offload support: {has_gpu}")
            if not has_gpu:
                print(f"   \u26a0\ufe0f  GPU \xea\xb0\x80\xec\x86\x8d \xec\xa7\x80\xec\x9b\x90 \xec\x97\x86\xec\x9d\x8c! CPU-only\xeb\xa1\x9c \xec\x8b\xa4\xed\x96\x89\xeb\x90\xa9\xeb\x8b\x88\xeb\x8b\xa4.")
                print(f"   GPU \xec\x84\xa4\xec\xb9\x98\xeb\xa5\xbc \xec\x9b\x90\xed\x95\x98\xeb\xa9\xb4:")
                print(f"     NVIDIA: CMAKE_ARGS='-DGGML_CUDA=on' pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir")
                print(f"     AMD: CMAKE_ARGS='-DGGML_VULKAN=on' pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir")
        except Exception:
            pass

        kwargs = {"model_path": model_path, **LLAMA_KWARGS}
        llm = Llama(**kwargs)

        try:
            model = llm._model
            actual_gpu_layers = model.n_gpu_layers if hasattr(model, 'n_gpu_layers') else 0
            if N_GPU_LAYERS > 0 and actual_gpu_layers == 0:
                print(f"   \u26a0\ufe0f  GPU \xec\x98\xa4\xed\x94\x84\xeb\xa1\x9c\xeb\x94\xa9 \xec\x8b\xa4\xed\x8c\xa8! \xec\x9a\x94\xec\xb2\xad={N_GPU_LAYERS}\xec\xb8\xb5, \xec\x8b\xa4\xec\xa0\x9c=0\xec\xb8\xb5 (CPU\xeb\xa1\x9c \xec\x8b\xa4\xed\x96\x89)")
            elif actual_gpu_layers > 0:
                print(f"   \u2705 GPU \xec\x98\xa4\xed\x94\x84\xeb\xa1\x9c\xeb\x94\xa9: {actual_gpu_layers}\xec\xb8\xb5")
        except Exception:
            pass

        print(f"\u2705 \xeb\xaa\xa8\xeb\x8d\xb8 \xeb\xa1\x9c\xeb\x94\xa9 \xec\x99\x84\xeb\xa3\x8c: {os.path.basename(model_path)}")
        return llm

    def chat(self, messages):
        llm = self._get_llm()
        response = llm.create_chat_completion(messages=messages, **CHAT_SAMPLING)
        msg = response["choices"][0]["message"]
        return msg.get("content", "")

    def chat_stream(self, messages):
        llm = self._get_llm()
        for chunk in llm.create_chat_completion(messages=messages, **CHAT_SAMPLING, stream=True):
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content", "")
            if content:
                yield content

    def chat_stream_with_reasoning(self, messages):
        llm = self._get_llm()
        for chunk in llm.create_chat_completion(messages=messages, **CHAT_SAMPLING, stream=True):
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content", "")
            reasoning = delta.get("reasoning_content", "")
            if content:
                yield {"type": "content", "text": content}
            if reasoning:
                yield {"type": "reasoning", "text": reasoning}
