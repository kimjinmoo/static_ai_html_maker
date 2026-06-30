import os

PORT = int(os.environ.get("PORT", "5080"))
MODEL_PATH = os.environ.get("MODEL_PATH", "")
N_CTX = int(os.environ.get("N_CTX", "12288"))
N_GPU_LAYERS = int(os.environ.get("N_GPU_LAYERS", "-1"))
N_THREADS = int(os.environ.get("N_THREADS", "16"))
N_BATCH = int(os.environ.get("N_BATCH", "2048"))
N_UBATCH = int(os.environ.get("N_UBATCH", "512"))

DEFAULT_MODEL = "ornith-1.0-9b-Q4_K_M.gguf"
DEFAULT_MODEL_REPO = "deepreinforce-ai/Ornith-1.0-9B-GGUF"

LLM_BACKEND = os.environ.get("LLM_BACKEND", "local").lower().strip()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5-coder:7b")

# OpenAI 호환 (OpenAI / DeepSeek / Groq / Together / OpenRouter / vLLM 등)
# 기본값은 무료 등급의 DeepSeek V4 Flash
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "deepseek-v4-flash")

LLAMA_KWARGS = {
    "n_ctx": N_CTX,
    "n_gpu_layers": N_GPU_LAYERS,
    "n_batch": N_BATCH,
    "n_ubatch": N_UBATCH,
    "n_threads": N_THREADS,
    "n_threads_batch": N_THREADS,
    "flash_attn": True,
    "verbose": False,
    "enable_thinking": True,
}

CHAT_SAMPLING = {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 20,
    "min_p": 0.0,
    "max_tokens": 8192,
}
