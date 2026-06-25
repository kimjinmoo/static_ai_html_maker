import os
import sys
import json
import shutil
import threading
import urllib.request
import zipfile
import io
import platform
from flask import Flask, render_template, request, jsonify, Response, send_file
import markdown
from llama_cpp import Llama

app = Flask(__name__)

# 플랫폼 감지
IS_MAC = sys.platform == "darwin"
IS_APPLE_SILICON = platform.machine() == "arm64"
USE_MLX = IS_MAC and IS_APPLE_SILICON and os.environ.get("MLX_FORCE", "0") == "1"

# GGUF 모델 설정 (일반 PC)
GGUF_MODEL_REPO = "unsloth/gemma-4-E4B-it-GGUF"
GGUF_MODEL_FILE = "gemma-4-E4B-it-Q4_K_M.gguf"
GGUF_MODEL_URL = f"https://huggingface.co/{GGUF_MODEL_REPO}/resolve/main/{GGUF_MODEL_FILE}"

# MLX 모델 설정 (Apple Silicon 전용)
MLX_MODEL_REPO = "mlx-community/gemma-4-12b-it-4bit"
MLX_MODEL_FILE = "model.safetensors.index.json"

# 현재 플랫폼에 따른 모델 설정
if USE_MLX:
    DEFAULT_MODEL_REPO = MLX_MODEL_REPO
    DEFAULT_MODEL_FILE = MLX_MODEL_FILE
    DEFAULT_MODEL_URL = None  # MLX는 디렉토리 다운로드
    MODEL_BACKEND = "mlx"
else:
    DEFAULT_MODEL_REPO = GGUF_MODEL_REPO
    DEFAULT_MODEL_FILE = GGUF_MODEL_FILE
    DEFAULT_MODEL_URL = f"https://huggingface.co/{GGUF_MODEL_REPO}/resolve/main/{GGUF_MODEL_FILE}"
    MODEL_BACKEND = "llama_cpp"

# 환경 변수
MODEL_PATH = os.environ.get("MODEL_PATH", "")
GGML_CUDA = os.environ.get("GGML_CUDA", "1") == "1"
N_CTX = int(os.environ.get("N_CTX", "16384"))
N_THREADS = int(os.environ.get("N_THREADS", 0))

# 다운로드 상태 관리를 위한 전역 변수
download_status = {
    "downloading": False,
    "progress": 0,
    "downloaded_mb": 0,
    "total_mb": 0,
    "speed": ""
}
download_lock = threading.Lock()

SYSTEM_PROMPT = """당신은 홈페이지 생성 AI입니다. 사용자의 설명을 듣고 즉시 완전한 HTML 코드를 생성합니다.

## 핵심 규칙 (반드시 준수)
1. 사용자의 요청을 받으면 **즉시** 완전한 HTML 코드를 생성하세요.
2. 설명이나 대화는 최소화하고, 코드 생성에 집중하세요.
3. 코드는 반드시 ```html``` 코드 블록 안에 포함하세요.
4. 코드 블록 밖에는 짧은 한국어 설명만 작성하세요.

## 페이지 유형
- **회사 사이트 (company)**: 네비게이션 바 + 히어로 + 소개 + 서비스 + 팀 + 연락처 + 푸터. 브랜드 신뢰도를 높이는 구조.
- **랜딩 페이지 (landing)**: 강력한 히어로 + CTA + 기능 소개 + 고객 후기 + 가격표 + 마지막 CTA. 전환율 극대화.
- **프로모션 페이지 (promotion)**: 카운트다운 타이머 + 강력한 CTA + 한정감 강조. 시급성과 긴급감 표현.

## 디자인 템플릿
- **Minimal Clean**: Inter 폰트, 흰 배경(#ffffff), 플랫 컬러, 여백 중심.
- **Bold Modern**: Poppins 폰트, 어두운 배경(#0a0a0a), 그라데이션, 글로우 효과.
- **Elegant Warm**: Playfair Display + Source Sans 3, 오프화이트 배경(#faf9f6), 따뜻한 골드 액센트.
- **Custom (URL 기반)**: 제공된 디자인 토큰을 참고하여 적용.

## 프로젝트 폴더 구조 (반드시 준수)
 생성하는 홈페이지는 다음 폴더 구조를 따르세요:
 ```
 project/
 ├── index.html          # 메인 페이지 (첫 페이지)
 ├── assets/
 │   ├── css/
 │   │   └── style.css   # 스타일시트
 │   ├── js/
 │   │   └── main.js     # 자바스크립트
 │   ├── fonts/          # 커스텀 폰트 파일
 │   └── images/         # 이미지 파일
 └── pages/              # 추가 페이지 (sub-page.html 등)
 ```

 ## 신규 페이지 생성 규칙
 - 사용자의 요청으로 신규 페이지를 생성해야 할 경우, HTML 코드 블록 안에 다음 형식으로 페이지를 포함하세요:
 ```html
 <!-- page: pages/about.html -->
 <!DOCTYPE html>
 <html>
 ...
 </html>
 <!-- end-page -->
 ```
 - 각 페이지는 완전한 HTML 문서여야 합니다

## HTML 생성 규칙
- <!DOCTYPE html>로 시작, head/body 모두 포함
- CSS는 <style> 태그 안에, JS는 <script> 태그 안에 포함 (단일 파일 방식)
- 이미지 경로: assets/images/ 폴더를 참조하세요
- 폰트 경로: assets/fonts/ 폴더를 참조하세요
- 외부 라이브러리는 CDN 링크로만 사용 (Google Fonts, Font Awesome 등)
- 반응형 디자인 (mobile-first, media query)
- 한국어 placeholder 텍스트
- 의미 있는 HTML5 태그 (header, nav, main, section, footer 등)
- 섹션당 충분한 콘텐츠로 풍부한 페이지 구성 (최소 5개 섹션 이상)
- 선택한 디자인 템플릿의 컬러, 타이포그래피, 스페이싱을 정확히 적용"""

# 전역 Llama 인스턴스
llama_instance = None
llama_lock = threading.Lock()
mlx_model_loaded = False
mlx_model_repo = None


def get_model_dir():
    """모델 저장 디렉토리 반환"""
    if getattr(app, 'in_bundle', False):
        return os.path.join(os.path.expanduser("~"), ".webgen_ai", "models")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def get_default_model_path():
    """기본 모델 경로 반환 (GGUF: 파일, MLX: 디렉토리)"""
    if USE_MLX:
        return os.path.join(get_model_dir(), MLX_MODEL_REPO.split("/")[-1])
    return os.path.join(get_model_dir(), DEFAULT_MODEL_FILE)


def resolve_model_path():
    """모델 경로 결정: 번들 → 환경 변수 → 기본 다운로드"""
    if USE_MLX:
        model_dir_path = os.path.join(get_model_dir(), MLX_MODEL_REPO.split("/")[-1])
        if os.path.isdir(model_dir_path) and os.path.exists(os.path.join(model_dir_path, MLX_MODEL_FILE)):
            return model_dir_path
        return None

    # 1. 번들 내 모델 확인
    bundle_model = os.path.join(os.path.dirname(os.path.abspath(__file__)), "default_model.gguf")
    if os.path.exists(bundle_model):
        app.in_bundle = True
        model_dir = get_model_dir()
        os.makedirs(model_dir, exist_ok=True)
        target = os.path.join(model_dir, DEFAULT_MODEL_FILE)
        if not os.path.exists(target):
            print(f"📦 번들 모델을 복사 중: {target}")
            shutil.copy2(bundle_model, target)
        return target

    # 2. 환경 변수
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        return MODEL_PATH

    # 3. 기본 모델
    default_path = get_default_model_path()
    if os.path.exists(default_path):
        return default_path

    return None


def download_model(model_path, url=None, progress_callback=None):
    """모델 다운로드"""
    url = url or DEFAULT_MODEL_URL
    model_dir = os.path.dirname(model_path)
    os.makedirs(model_dir, exist_ok=True)

    print(f"\n⬇️  모델 다운로드 중...")
    print(f"   원본: {DEFAULT_MODEL_REPO}")
    print(f"   파일: {DEFAULT_MODEL_FILE}")
    print(f"   크기: ~4.7GB")
    print(f"   저장: {model_path}\n")

    import time
    start_time = time.time()
    last_update_time = start_time

    def progress_hook(block_num, block_size, total_size):
        nonlocal last_update_time
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, (downloaded / total_size) * 100)
            downloaded_mb = downloaded / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)

            now = time.time()
            elapsed = now - start_time
            speed_mb = downloaded_mb / elapsed if elapsed > 0 else 0

            with download_lock:
                download_status["progress"] = percent
                download_status["downloaded_mb"] = downloaded_mb
                download_status["total_mb"] = total_mb
                download_status["speed"] = f"{speed_mb:.1f} MB/s"

            if progress_callback:
                progress_callback(percent, downloaded_mb, total_mb, speed_mb)

            if now - last_update_time >= 1:
                print(f"\r   진행률: {percent:.1f}% ({downloaded_mb:.1f}/{total_mb:.1f} MB) - {speed_mb:.1f} MB/s", end="", flush=True)
                last_update_time = now

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=60) as response:
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            block_size = 8192
            with open(model_path, 'wb') as out_file:
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = min(100, (downloaded / total_size) * 100)
                        downloaded_mb = downloaded / (1024 * 1024)
                        total_mb = total_size / (1024 * 1024)
                        now = time.time()
                        elapsed = now - start_time
                        speed_mb = downloaded_mb / elapsed if elapsed > 0 else 0
                        with download_lock:
                            download_status["progress"] = percent
                            download_status["downloaded_mb"] = downloaded_mb
                            download_status["total_mb"] = total_mb
                            download_status["speed"] = f"{speed_mb:.1f} MB/s"
                        if progress_callback:
                            progress_callback(percent, downloaded_mb, total_mb, speed_mb)
                        if now - last_update_time >= 1:
                            print(f"\r   진행률: {percent:.1f}% ({downloaded_mb:.1f}/{total_mb:.1f} MB) - {speed_mb:.1f} MB/s", end="", flush=True)
                            last_update_time = now
        print("\n\n✅ 다운로드 완료!")
        with download_lock:
            download_status["progress"] = 100
            download_status["downloading"] = False
        return True
    except Exception as e:
        print(f"\n\n❌ 다운로드 실패: {e}")
        with download_lock:
            download_status["downloading"] = False
        if os.path.exists(model_path):
            os.remove(model_path)
        return False


def download_mlx_model(model_dir_path, progress_callback=None):
    """MLX 모델 다운로드 (huggingface-cli 또는 pip install 후 snapshot_download)"""
    import time
    import subprocess
    start_time = time.time()

    print(f"\n⬇️  MLX 모델 다운로드 중...")
    print(f"   원본: {MLX_MODEL_REPO}")
    print(f"   저장: {model_dir_path}\n")

    try:
        # huggingface_hub 없으면 설치
        try:
            import huggingface_hub
        except ImportError:
            print("   huggingface_hub 설치 중...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "huggingface_hub"])
            import huggingface_hub

        from huggingface_hub import snapshot_download
        os.makedirs(os.path.dirname(model_dir_path), exist_ok=True)

        downloaded_bytes = [0]

        def progress_hook(bytes_in_chunk, file_name, total):
            downloaded_bytes[0] += bytes_in_chunk
            downloaded_mb = downloaded_bytes[0] / (1024 * 1024)
            total_mb = total / (1024 * 1024) if total else 0
            now = time.time()
            elapsed = now - start_time
            speed_mb = downloaded_mb / elapsed if elapsed > 0 else 0
            percent = min(100, (downloaded_bytes[0] / total * 100)) if total else 0
            with download_lock:
                download_status["progress"] = percent
                download_status["downloaded_mb"] = downloaded_mb
                download_status["total_mb"] = total_mb
                download_status["speed"] = f"{speed_mb:.1f} MB/s"
            if progress_callback:
                progress_callback(percent, downloaded_mb, total_mb, speed_mb)
            print(f"\r   진행률: {percent:.1f}% ({downloaded_mb:.1f}/{total_mb:.1f} MB) - {speed_mb:.1f} MB/s", end="", flush=True)

        snapshot_download(
            MLX_MODEL_REPO,
            local_dir=model_dir_path,
            local_dir_use_symlinks=False,
            tqdm_class=None,
        )

        print("\n\n✅ MLX 모델 다운로드 완료!")
        with download_lock:
            download_status["progress"] = 100
            download_status["downloading"] = False
        return True
    except Exception as e:
        print(f"\n\n❌ MLX 다운로드 실패: {e}")
        with download_lock:
            download_status["downloading"] = False
        return False


def get_mlx_model():
    """MLX 모델 로드/생성 (model, tokenizer 튜플 반환)"""
    global mlx_model_loaded, mlx_model_repo
    if mlx_model_loaded and mlx_model_repo:
        return mlx_model_repo

    model_path = resolve_model_path()
    if not model_path:
        raise FileNotFoundError(
            f"MLX 모델 폴더를 찾을 수 없습니다\n"
            f"웹 UI에서 MLX 모델을 다운로드하세요."
        )

    print(f"\n📦 MLX 모델 로딩 중: {MLX_MODEL_REPO}")
    try:
        import mlx_lm
        model, tokenizer = mlx_lm.load(model_path)
        mlx_model_repo = (model, tokenizer)
        mlx_model_loaded = True
        print("✅ MLX 모델 로딩 완료!\n")
        return mlx_model_repo
    except Exception as e:
        mlx_model_loaded = False
        raise RuntimeError(f"MLX 모델 로딩 실패: {e}")


def ensure_model_exists():
    """모델 존재 확인"""
    model_path = resolve_model_path()

    if model_path:
        return model_path

    # 모델이 없는 경우 None 반환 (웹 UI에서 다운로드 유도)
    default_path = get_default_model_path()
    print(f"\n⚠️  기본 모델을 찾을 수 없습니다: {default_path}")
    print("   웹 UI에서 다운로드할 수 있습니다.\n")
    return None


def get_llama_instance():
    global llama_instance
    if llama_instance is not None:
        return llama_instance

    with llama_lock:
        if llama_instance is not None:
            return llama_instance

        resolved_path = ensure_model_exists()
        if not resolved_path or not os.path.exists(resolved_path):
            raise FileNotFoundError(
                f"GGUF 모델 파일을 찾을 수 없습니다\n"
                f"MODEL_PATH 환경 변수를 설정하거나, 기본 모델을 다운로드하세요.\n"
                f"다운로드 스크립트: ./download_model.sh"
            )

        print(f"\n📦 모델 로딩 중: {resolved_path}")
        import platform
        is_apple_silicon = platform.machine() == "arm64"
        n_gpu_layers = -1 if (GGML_CUDA or is_apple_silicon) else 0
        n_threads_batch = N_THREADS if N_THREADS > 0 else None
        print(f"   GPU 레이어: {n_gpu_layers} (Apple Silicon: {is_apple_silicon})")
        llama_instance = Llama(
            model_path=resolved_path,
            n_ctx=N_CTX,
            n_batch=N_CTX,
            n_ubatch=4096,
            n_threads=n_threads_batch,
            n_threads_batch=n_threads_batch,
            n_gpu_layers=n_gpu_layers,
            flash_attn=True,
            verbose=True,
        )
        print("✅ 모델 로딩 완료!\n")
        return llama_instance


@app.route("/")
def index():
    return render_template("index.html")


def build_messages(data):
    """채팅 메시지 빌드 (공용)"""
    user_message = data.get("message", "")
    history = data.get("history", [])
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    current_html = data.get("current_html", "")
    design_content = data.get("design_content", "")
    element_context = data.get("element_context", "")
    is_new_page = data.get("is_new_page", False)

    type_names = {
        "company": "회사 사이트 (정적 웹사이트)",
        "landing": "랜딩 페이지 (제품/서비스 소개)",
        "promotion": "프로모션 페이지 (이벤트/캠페인)"
    }
    template_names = {
        "minimal_clean": "Minimal Clean (깔끔한 미니멀)",
        "bold_modern": "Bold Modern (강렬한 다크)",
        "elegant_warm": "Elegant Warm (세련된 따뜻한)",
        "custom": "URL 기반 커스텀 디자인"
    }

    context = f"페이지 유형: {type_names.get(page_type, page_type)}\n디자인 템플릿: {template_names.get(template, template)}"

    if design_content:
        context += f"\n\n## 디자인 토큰\n{design_content}"

    if current_html:
        context += f"\n\n현재 메인 페이지 HTML (디자인 참고용):\n```html\n{current_html}\n```"
        if is_new_page:
            final_message = f"""{user_message}

## 중요: 새 페이지 생성 요청입니다.
- 현재 메인 페이지의 디자인, 색상, 폰트, 레이아웃 스타일을 **참고**하여 새로운 하위 페이지의 완전한 HTML을 생성하세요.
- 메인 페이지를 수정하거나 대체하는 것이 **아닙니다**. 완전히 독립적인 새 페이지입니다.
- `<!DOCTYPE html>`로 시작하고, `<head>`, `<body>`, CSS, JS를 모두 포함하세요.
- 네비게이션 바는 메인 페이지와 동일하게 유지하세요.
- 콘텐츠 영역만 새로 생성하세요.
- **중요**: HTML 코드는 반드시 ===HTML_START=== 와 ===HTML_END=== 사이에 출력하세요. 그 외 설명은 최소화하세요."""
        elif element_context:
            final_message = f"""{element_context}

위 요청에 따라 현재 HTML의 해당 요소만 수정하세요. 수정할 요소의 id, class, tag로 정확히 찾아서 수정하고, 나머지 HTML은 그대로 유지하세요. 수정된 완전한 HTML을 ```html``` 코드 블록 안에 출력하세요."""
        else:
            final_message = f"{user_message}\n\n위 내용을 반영하여 HTML을 수정하세요. ```html``` 코드 블록 안에 완전한 HTML 파일을 출력하세요."
    else:
        final_message = f"""다음 내용을 바탕으로 홈페이지를 생성하세요.

{user_message}

위 내용을 바탕으로 ```html``` 코드 블록 안에 완전한 HTML 파일을 생성하세요. <!DOCTYPE html>로 시작하고, head/body, CSS, JS를 모두 포함하세요. 설명은 최소화하고 코드에 집중하세요."""

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": f"{context}\n\n---\n\n{final_message}"})
    return messages


def mlx_chat(messages):
    """MLX로 채팅 응답 생성"""
    import mlx_lm
    model, tokenizer = get_mlx_model()
    prompt = tokenizer.apply_chat_template(messages, tokenize=False)
    result = mlx_lm.generate(
        model,
        tokenizer,
        prompt=prompt,
        max_tokens=N_CTX,
        temp=1.0,
        top_p=0.95,
        verbose=False,
    )
    return result


def mlx_chat_stream(messages):
    """MLX로 스트리밍 응답 생성"""
    import mlx_lm
    model, tokenizer = get_mlx_model()
    prompt = tokenizer.apply_chat_template(messages, tokenize=False)
    gen = mlx_lm.stream_generate(
        model,
        tokenizer,
        prompt=prompt,
        max_tokens=N_CTX,
        temp=1.0,
        top_p=0.95,
    )
    for chunk in gen:
        yield chunk


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    if not data.get("message", "").strip():
        return jsonify({"error": "메시지가 비어있습니다."}), 400

    messages = build_messages(data)

    try:
        import time
        start_time = time.time()

        if USE_MLX:
            assistant_message = mlx_chat(messages)
        else:
            llm = get_llama_instance()
            response = llm.create_chat_completion(
                messages=messages,
                temperature=1.0,
                top_p=0.95,
                top_k=64,
            )
            assistant_message = response["choices"][0]["message"]["content"]

        token_count = len(assistant_message) // 4
        elapsed = time.time() - start_time
        speed = token_count / elapsed if elapsed > 0 else 0
        print(f"  [Chat] {token_count} tokens, {elapsed:.1f}s, {speed:.1f} tok/s")
        return jsonify({
            "role": "assistant",
            "content": assistant_message
        })
    except Exception as e:
        return jsonify({"error": f"모델 응답 오류: {str(e)}"}), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    data = request.json
    if not data.get("message", "").strip():
        return jsonify({"error": "메시지가 비어있습니다."}), 400

    messages = build_messages(data)

    def generate():
        try:
            import time
            token_count = 0
            start_time = time.time()
            last_log_time = start_time

            if USE_MLX:
                for token in mlx_chat_stream(messages):
                    token_count += 1
                    now = time.time()
                    elapsed = now - start_time
                    speed = token_count / elapsed if elapsed > 0 else 0
                    if now - last_log_time >= 1.0:
                        print(f"  [Token] #{token_count} - {speed:.1f} tok/s")
                        last_log_time = now
                    yield f"data: {json.dumps({'content': token})}\n\n"
            else:
                llm = get_llama_instance()
                for chunk in llm.create_chat_completion(
                    messages=messages,
                    stream=True,
                    temperature=1.0,
                    top_p=0.95,
                    top_k=64,
                ):
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        token_count += 1
                        now = time.time()
                        elapsed = now - start_time
                        speed = token_count / elapsed if elapsed > 0 else 0
                        if now - last_log_time >= 1.0:
                            print(f"  [Token] #{token_count} - {speed:.1f} tok/s")
                            last_log_time = now
                        yield f"data: {json.dumps({'content': content})}\n\n"

            total_time = time.time() - start_time
            avg_speed = token_count / total_time if total_time > 0 else 0
            print(f"  [Done] Total: {token_count} tokens, {total_time:.1f}s, {avg_speed:.1f} tok/s\n")
            yield f"data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/models", methods=["GET"])
def list_models():
    try:
        resolved_path = resolve_model_path()
        if resolved_path:
            model_name = MLX_MODEL_REPO if USE_MLX else os.path.basename(resolved_path)
            return jsonify({
                "models": [model_name],
                "model_path": resolved_path,
                "status": "ready",
                "backend": "mlx" if USE_MLX else "llama_cpp",
            })
        return jsonify({
            "models": [],
            "status": "no_model",
            "default_model": MLX_MODEL_REPO if USE_MLX else DEFAULT_MODEL_FILE,
            "default_model_size": "~7.5GB" if USE_MLX else "4.7GB",
            "backend": "mlx" if USE_MLX else "llama_cpp",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat/test", methods=["POST"])
def chat_test():
    """빠른 테스트용 엔드포인트"""
    try:
        messages = [{"role": "user", "content": "안녕"}]
        if USE_MLX:
            result = mlx_chat(messages)
            return jsonify({"role": "assistant", "content": result[:200]})
        else:
            return jsonify({"error": "GGUF 모드"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/download_default_model", methods=["POST", "GET"])
def download_default_model():
    """기본 모델 다운로드 API (스트리밍 진행률)"""
    try:
        model_dir = get_model_dir()

        if USE_MLX:
            model_path = os.path.join(model_dir, MLX_MODEL_REPO.split("/")[-1])
            if os.path.isdir(model_path) and os.path.exists(os.path.join(model_path, MLX_MODEL_FILE)):
                return jsonify({"status": "exists", "path": model_path})

            def generate():
                import time
                try:
                    with download_lock:
                        download_status["downloading"] = True
                        download_status["progress"] = 0

                    def run_download():
                        download_mlx_model(model_path)

                    thread = threading.Thread(target=run_download, daemon=True)
                    thread.start()

                    last_progress = -1
                    while True:
                        with download_lock:
                            current_progress = download_status["progress"]
                            speed = download_status["speed"]
                            downloading = download_status["downloading"]

                        if current_progress != last_progress:
                            yield f"data: {json.dumps({'progress': current_progress, 'speed': speed})}\n\n"
                            last_progress = current_progress

                        if current_progress == 100 or (not downloading and current_progress > 0):
                            if os.path.isdir(model_path):
                                yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'path': model_path})}\n\n"
                            else:
                                yield f"data: {json.dumps({'status': 'error', 'error': '다운로드 실패'})}\n\n"
                            break

                        if not downloading and current_progress == 0:
                            yield f"data: {json.dumps({'status': 'error', 'error': '다운로드 중단'})}\n\n"
                            break

                        time.sleep(0.5)

                except Exception as e:
                    with download_lock:
                        download_status["downloading"] = False
                    yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

            return Response(generate(), mimetype="text/event-stream")
        else:
            model_path = os.path.join(model_dir, DEFAULT_MODEL_FILE)
            if os.path.exists(model_path):
                return jsonify({"status": "exists", "path": model_path})

            def generate():
                import time
                try:
                    with download_lock:
                        download_status["downloading"] = True
                        download_status["progress"] = 0

                    def run_download():
                        download_model(model_path)

                    thread = threading.Thread(target=run_download, daemon=True)
                    thread.start()

                    last_progress = -1
                    while True:
                        with download_lock:
                            current_progress = download_status["progress"]
                            speed = download_status["speed"]
                            downloading = download_status["downloading"]

                        if current_progress != last_progress:
                            yield f"data: {json.dumps({'progress': current_progress, 'speed': speed})}\n\n"
                            last_progress = current_progress

                        if current_progress == 100 or (not downloading and current_progress > 0):
                            if os.path.exists(model_path):
                                yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'path': model_path})}\n\n"
                            else:
                                yield f"data: {json.dumps({'status': 'error', 'error': '다운로드 실패'})}\n\n"
                            break

                        if not downloading and current_progress == 0:
                            yield f"data: {json.dumps({'status': 'error', 'error': '다운로드 중단'})}\n\n"
                            break

                        time.sleep(0.5)

                except Exception as e:
                    with download_lock:
                        download_status["downloading"] = False
                    yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

            return Response(generate(), mimetype="text/event-stream")
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 500


@app.route("/api/download_status", methods=["GET"])
def get_download_status():
    """다운로드 상태 확인 API"""
    with download_lock:
        return jsonify({
            "downloading": download_status["downloading"],
            "progress": download_status["progress"],
            "downloaded_mb": download_status["downloaded_mb"],
            "total_mb": download_status["total_mb"],
            "speed": download_status["speed"]
        })


@app.route("/api/generate_design_from_url", methods=["POST"])
def generate_design_from_url():
    """URL의 디자인을 분석하여 design.md 생성"""
    data = request.json
    url = data.get("url", "")

    if not url:
        return jsonify({"status": "error", "error": "URL을 입력해주세요."}), 400

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        })
        with urllib.request.urlopen(req, timeout=15) as response:
            html_content = response.read().decode('utf-8', errors='ignore')

        import re

        # 추출: 컬러
        colors = re.findall(r'#[0-9a-fA-F]{6}\b', html_content)
        # 추출: 폰트
        fonts = re.findall(r"font-family:\s*'([^']+)'", html_content)
        fonts += re.findall(r'font-family:\s"([^"]+)"', html_content)
        # 추출: CSS 변수
        css_vars = re.findall(r'--[\w-]+:\s*([^;]+);', html_content)

        unique_colors = list(dict.fromkeys(colors))[:8]
        unique_fonts = list(dict.fromkeys([f.strip() for f in fonts]))[:4]
        unique_vars = list(dict.fromkeys(css_vars))[:10]

        # 배경/텍스트 컬러 추정
        bg_match = re.search(r'background(?:-color)?:\s*(#[0-9a-fA-F]{6}|white|#[fF]{6})', html_content)
        text_match = re.search(r'color:\s*(#[0-9a-fA-F]{6}|black|#[0-9a-fA-F]{3})', html_content)

        design_content = "# Design Token - URL 기반 분석\n\n"
        design_content += f"## Source URL\n- {url}\n\n"

        design_content += "## Color Palette\n"
        for i, c in enumerate(unique_colors[:6]):
            labels = ['Primary', 'Secondary', 'Accent', 'Background', 'Surface', 'Text']
            label = labels[i] if i < len(labels) else f'Color {i+1}'
            design_content += f"- {label}: `{c}`\n"

        if bg_match:
            design_content += f"- Background (detected): `{bg_match.group(1)}`\n"
        if text_match:
            design_content += f"- Text (detected): `{text_match.group(1)}`\n"

        design_content += "\n## Typography\n"
        if unique_fonts:
            design_content += f"- Heading Font: `{unique_fonts[0]}`\n"
            if len(unique_fonts) > 1:
                design_content += f"- Body Font: `{unique_fonts[1]}`\n"
        else:
            design_content += "- Font Family: system-ui, sans-serif\n"
        design_content += "- H1: 48px / 700 / 1.1\n"
        design_content += "- Body: 16px / 400 / 1.6\n"

        design_content += "\n## Style Notes\n"
        design_content += "- 위 URL의 디자인을 참고하여 페이지를 생성하세요.\n"
        design_content += "- 감지된 컬러와 폰트를 활용하여 일관된 디자인을 적용하세요.\n"

        design_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "custom_designs")
        os.makedirs(design_dir, exist_ok=True)
        print(f"\n[Design] URL 분석: {url}")
        print(f"  [Dir]  {design_dir}/")
        design_path = os.path.join(design_dir, "custom_design.md")
        with open(design_path, 'w', encoding='utf-8') as f:
            f.write(design_content)
        print(f"  [File] {design_path}")

        return jsonify({
            "status": "success",
            "design": design_content,
            "path": design_path
        })
    except Exception as e:
        return jsonify({"status": "error", "error": f"URL 분석 실패: {str(e)}"}), 500


@app.route("/api/generate_preview", methods=["POST"])
def generate_preview():
    data = request.json
    code = data.get("code", "")
    return jsonify({"html": code})


@app.route("/api/design_template/<template_name>", methods=["GET"])
def get_design_template(template_name):
    """디자인 템플릿 콘텐츠 반환"""
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "designs")
    template_path = os.path.join(template_dir, f"{template_name}.md")

    if not os.path.exists(template_path):
        return jsonify({"error": f"템플릿을 찾을 수 없습니다: {template_name}"}), 404

    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()

    return jsonify({
        "name": template_name,
        "content": content
    })


@app.route("/api/design_templates", methods=["GET"])
def list_design_templates():
    """사용 가능한 디자인 템플릿 목록 반환"""
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "designs")
    templates = []

    if os.path.exists(template_dir):
        for filename in os.listdir(template_dir):
            if filename.endswith('.md'):
                name = filename[:-3]
                filepath = os.path.join(template_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                title = content.split('\n')[0].replace('# ', '') if content else name
                templates.append({
                    "name": name,
                    "title": title,
                    "preview": content[:200] + "..." if len(content) > 200 else content
                })

    return jsonify({"templates": templates})


def get_projects_dir():
    """프로젝트 저장 디렉토리 반환"""
    if getattr(app, 'in_bundle', False):
        return os.path.join(os.path.expanduser("~"), ".webgen_ai", "projects")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects")


@app.route("/api/projects", methods=["GET"])
def list_projects():
    """저장된 프로젝트 목록 반환"""
    projects_dir = get_projects_dir()
    if not os.path.exists(projects_dir):
        return jsonify({"projects": []})

    projects = []
    for filename in os.listdir(projects_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(projects_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    project = json.load(f)
                projects.append(project)
            except (json.JSONDecodeError, IOError):
                continue

    projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return jsonify({"projects": projects})


@app.route("/api/projects", methods=["POST"])
def save_project():
    """프로젝트 저장"""
    data = request.json
    project_id = data.get("id", "")
    title = data.get("title", "제목 없음")
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    html = data.get("html", "")
    history = data.get("history", [])
    design_content = data.get("design_content", "")

    if not project_id:
        import uuid
        project_id = str(uuid.uuid4())[:8]

    projects_dir = get_projects_dir()
    os.makedirs(projects_dir, exist_ok=True)
    print(f"\n[Save] 프로젝트 저장: {project_id} ({title})")

    # HTML 파일 저장 (단일 파일)
    html_path = os.path.join(projects_dir, f"{project_id}.html")
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  [File] {html_path}")

    # 프로젝트 폴더 구조로 저장
    project_dir = os.path.join(projects_dir, project_id)
    print(f"  [Dir]  {project_dir}/")
    for subdir in ["assets/css", "assets/js", "assets/fonts", "assets/images", "pages"]:
        dir_path = os.path.join(project_dir, subdir)
        os.makedirs(dir_path, exist_ok=True)
        gitkeep = os.path.join(dir_path, ".gitkeep")
        if not os.path.exists(gitkeep):
            with open(gitkeep, 'w') as f:
                pass
            print(f"  [File] {gitkeep}")

    # HTML에서 <style>과 <script> 추출하여 별도 파일로 저장
    import re
    style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html, re.IGNORECASE)
    script_blocks = re.findall(r'<script[^>]*>([\s\S]*?)</script>', html, re.IGNORECASE)

    if style_blocks:
        css_content = "\n".join(style_blocks)
        css_path = os.path.join(project_dir, "assets", "css", "style.css")
        with open(css_path, 'w', encoding='utf-8') as f:
            f.write(css_content)
        print(f"  [File] {css_path}")

    if script_blocks:
        js_content = "\n".join(script_blocks)
        js_path = os.path.join(project_dir, "assets", "js", "main.js")
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        print(f"  [File] {js_path}")

    index_path = os.path.join(project_dir, "index.html")
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  [File] {index_path}")

    # HTML에서 pages/ 폴더에 저장할 별도 페이지 추출
    # AI가 생성한 HTML에서 pages/ 폴더에 저장할 별도 페이지 추출
    import re
    # <template id="page-xxx"> 또는 <!-- page: xxx.html --> 패턴 확인
    page_matches = re.findall(r'<!--\s*page:\s*(\S+)\s*-->([\s\S]*?)<!--\s*end-page\s*-->', html)
    for page_name, page_html in page_matches:
        if page_name.endswith('.html'):
            page_path = os.path.join(project_dir, "pages", page_name)
            with open(page_path, 'w', encoding='utf-8') as f:
                f.write(page_html.strip())
            print(f"  [File] {page_path}")

    # 메타데이터 저장
    import time
    project_data = {
        "id": project_id,
        "title": title,
        "page_type": page_type,
        "template": template,
        "history": history,
        "design_content": design_content,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
        "updated_at": time.strftime("%Y-%m-%d %H:%M"),
        "html_path": html_path
    }
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(project_data, f, ensure_ascii=False, indent=2)
    print(f"  [File] {json_path}")

    return jsonify({"status": "success", "id": project_id})


@app.route("/api/projects/<project_id>", methods=["GET"])
def load_project(project_id):
    """프로젝트 불러오기"""
    projects_dir = get_projects_dir()
    json_path = os.path.join(projects_dir, f"{project_id}.json")

    if not os.path.exists(json_path):
        return jsonify({"error": "프로젝트를 찾을 수 없습니다."}), 404

    with open(json_path, 'r', encoding='utf-8') as f:
        project = json.load(f)

    # HTML 파일 읽기
    html_path = os.path.join(projects_dir, f"{project_id}.html")
    if os.path.exists(html_path):
        with open(html_path, 'r', encoding='utf-8') as f:
            project["html"] = f.read()

    return jsonify(project)


@app.route("/api/projects/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    """프로젝트 삭제"""
    projects_dir = get_projects_dir()
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    html_path = os.path.join(projects_dir, f"{project_id}.html")

    deleted = False
    for path in [json_path, html_path]:
        if os.path.exists(path):
            print(f"  [Del]  {path}")
            os.remove(path)
            deleted = True

    # 프로젝트 폴더도 삭제
    project_dir = os.path.join(projects_dir, project_id)
    if os.path.exists(project_dir):
        print(f"  [Del]  {project_dir}/")
        shutil.rmtree(project_dir)
        deleted = True

    if not deleted:
        return jsonify({"error": "프로젝트를 찾을 수 없습니다."}), 404

    return jsonify({"status": "success"})


@app.route("/api/projects/<project_id>/tree", methods=["GET"])
def project_tree(project_id):
    """프로젝트 파일 구조 반환"""
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)

    tree = []

    # 프로젝트 폴더가 있으면 실제 파일 구조 스캔
    if os.path.exists(project_dir):
        for root, dirs, files in os.walk(project_dir):
            rel_root = os.path.relpath(root, project_dir)
            for d in sorted(dirs):
                rel_path = os.path.join(rel_root, d) if rel_root != "." else d
                tree.append({
                    "name": d,
                    "path": rel_path,
                    "type": "folder",
                    "depth": rel_path.count(os.sep)
                })
            for f in sorted(files):
                if f.startswith(".") and f.endswith(".gitkeep"):
                    continue
                rel_path = os.path.join(rel_root, f) if rel_root != "." else f
                ext = os.path.splitext(f)[1].lower()
                tree.append({
                    "name": f,
                    "path": rel_path,
                    "type": "file",
                    "ext": ext,
                    "depth": rel_path.count(os.sep)
                })
    else:
        # 폴더 구조가 없으면 HTML 파일에서 구조 파싱
        html_path = os.path.join(projects_dir, f"{project_id}.html")
        if os.path.exists(html_path):
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()

            # 이미지 참조 추출
            import re
            images = re.findall(r'src=["\']([^"\']+)["\']', html_content)
            images = [img for img in images if not img.startswith("http") and not img.startswith("data:")]

            # 섹션 추출
            sections = re.findall(r'<section[^>]*id=["\']?([^"\'>]*)["\']?[^>]*>', html_content)
            sections += re.findall(r'<section[^>]*class=["\']([^"\'>]*)["\']?[^>]*>', html_content)

            tree.append({
                "name": "index.html",
                "path": "index.html",
                "type": "file",
                "ext": ".html",
                "depth": 0
            })
            tree.append({
                "name": "assets",
                "path": "assets",
                "type": "folder",
                "depth": 0
            })
            tree.append({
                "name": "css",
                "path": "assets/css",
                "type": "folder",
                "depth": 1
            })
            tree.append({
                "name": "js",
                "path": "assets/js",
                "type": "folder",
                "depth": 1
            })
            tree.append({
                "name": "images",
                "path": "assets/images",
                "type": "folder",
                "depth": 1
            })
            tree.append({
                "name": "pages",
                "path": "pages",
                "type": "folder",
                "depth": 0
            })

            for img in list(dict.fromkeys(images))[:10]:
                img_name = os.path.basename(img)
                tree.append({
                    "name": img_name,
                    "path": f"assets/images/{img_name}",
                    "type": "file",
                    "ext": os.path.splitext(img_name)[1].lower(),
                    "depth": 2,
                    "referenced": True
                })

            if sections:
                for sec in list(dict.fromkeys(sections))[:5]:
                    if sec:
                        tree.append({
                            "name": f"{sec}.html",
                            "path": f"pages/{sec}.html",
                            "type": "file",
                            "ext": ".html",
                            "depth": 1,
                            "pending": True
                        })

    return jsonify({"tree": tree})


@app.route("/api/projects/<project_id>/save_file", methods=["POST"])
def save_project_file(project_id):
    """프로젝트 파일 개별 저장"""
    data = request.json
    filepath = data.get("path", "")
    content = data.get("content", "")

    if not filepath:
        return jsonify({"error": "파일 경로가 필요합니다"}), 400

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    full_path = os.path.join(project_dir, filepath)
    abs_full = os.path.abspath(full_path)
    abs_proj = os.path.abspath(project_dir)

    # 프로젝트 폴더 밖 저장 방지
    if not abs_full.startswith(abs_proj):
        return jsonify({"error": "허용되지 않은 파일 경로입니다"}), 403

    os.makedirs(os.path.dirname(abs_full), exist_ok=True)
    with open(abs_full, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  [File] {abs_full}")
    return jsonify({"status": "ok", "path": filepath})


@app.route("/api/projects/<project_id>/read_file", methods=["GET"])
def read_project_file(project_id):
    """프로젝트 파일 읽기"""
    filepath = request.args.get("path", "")
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    full_path = os.path.join(project_dir, filepath)

    if not os.path.abspath(full_path).startswith(os.path.abspath(project_dir)):
        return jsonify({"error": "잘못된 경로입니다."}), 400

    if not os.path.exists(full_path):
        return jsonify({"error": "파일을 찾을 수 없습니다."}), 404

    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return jsonify({"path": filepath, "content": content})


@app.route("/api/projects/<project_id>/export", methods=["GET"])
def export_project(project_id):
    """프로젝트를 ZIP으로 다운로드"""
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)

    if not os.path.exists(project_dir):
        # 폴더 구조가 없으면 HTML 파일에서 생성
        html_path = os.path.join(projects_dir, f"{project_id}.html")
        if not os.path.exists(html_path):
            return jsonify({"error": "프로젝트를 찾을 수 없습니다."}), 404

        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # 메모리에 ZIP 생성
        print(f"\n[Export] 프로젝트 내보내기: {project_id}.zip")
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("index.html", html_content)
            print(f"  [Zip]  index.html")
            zf.writestr("assets/css/.gitkeep", "")
            zf.writestr("assets/js/.gitkeep", "")
            zf.writestr("assets/fonts/.gitkeep", "")
            zf.writestr("assets/images/.gitkeep", "")
            zf.writestr("pages/.gitkeep", "")

        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"{project_id}.zip"
        )

    # 프로젝트 폴더가 있으면 ZIP으로 압축
    print(f"\n[Export] 프로젝트 내보내기: {project_id}.zip")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(project_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, project_dir)
                zf.write(file_path, arcname)
                print(f"  [Zip]  {arcname}")

    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"{project_id}.zip"
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5080))
    app.run(host="0.0.0.0", port=port, debug=True)
