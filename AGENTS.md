# AGENTS.md - WebGen AI

## 프로젝트 개요
llama-cpp-python을 활용한 AI 홈페이지 생성 도구입니다. Flask 기반으로 위자드형 UI를 제공하며, 사용자의 요청에 따라 HTML/CSS/JS 코드를 생성합니다. 추론 모드(reasoning)를 지원하여 AI의 사고 과정을 확인하고, 모듈 기반 생성으로 안정적인 HTML 생성이 가능합니다.

## 기술 스택
- **Backend**: Python 3.9+, Flask 3.0 (Python 3.14 권장 시 PyInstaller >=6.15.0 필요)
- **AI Engine**: llama-cpp-python (GGUF 모델 지원, 직접 추론) 또는 Google Gemini API (원격)
- **Backend Abstraction**: `app/backends/` — `ModelBackend` ABC, Local / Gemini 백엔드 전환 가능
- **Frontend**: Vanilla HTML/CSS/JS
- **빌드**: PyInstaller >=6.15.0 (Python 3.14 호환)

## 프로젝트 구조
```
make_web/
├── app.py                  # Flask 메인 서버 (API + 라우팅, 진입점)
├── app/
│   ├── __init__.py          # Flask app factory + 블루프린트
│   ├── config.py            # 환경변수 기반 설정
│   ├── model.py             # LLM 백엔드 프록시 (app.backends 위임)
│   ├── backends/            # AI 백엔드 추상화
│   │   ├── base.py          #   ModelBackend ABC
│   │   ├── local.py         #   LocalLlamaBackend (llama-cpp-python)
│   │   └── gemini.py        #   GeminiBackend (Google Gemini API)
│   ├── ... (chat, modular, routes 등)
├── requirements.txt        # Python 의존성
├── download_model.sh       # 모델 다운로드 스크립트
├── run.sh                  # 실행 스크립트
├── WebGenAI.spec           # PyInstaller 빌드 설정
├── build.sh / build.bat    # 빌드 스크립트 (macOS/Linux, Windows CPU)
├── build_nvidia.bat        # NVIDIA CUDA 빌드
├── build_amd.bat           # AMD Vulkan 빌드
├── models/                 # GGUF 모델 저장 디렉토리
├── templates/
│   ├── index.html          # 위자드 UI 템플릿
│   └── designs/            # 디자인 템플릿
│       ├── minimal_clean.md
│       ├── bold_modern.md
│       └── elegant_warm.md
└── static/
    ├── css/style.css       # 다크 테마 스타일
    └── js/main.js          # 클라이언트 로직 (위자드 플로우)
```

## 위자드 플로우
1. **페이지 유형 선택**: 회사 사이트 / 랜딩 페이지 / 프로모션 페이지
2. **디자인 템플릿 선택**: Minimal Clean / Bold Modern / Elegant Warm / URL 참조 커스텀
3. **내용 입력**: AI 프롬프트로 홈페이지 내용 설명
4. **결과 확인**: 좌측 대화 + 우측 미리보기

## 주요 기능
- **추론 모드**: AI의 사고 과정을 접이식 블록으로 표시 (기본 활성화, UI 토글로 제어)
- **모듈 기반 생성**: Phase 1(계획) → Phase 2(모듈별 생성) → Phase 3(조립) 파이프라인
- **실시간 다운로드 진행률**: HTTP 바이트 단위 추적, MB/s 속도 표시
- **다중 페이지 생성**: 링크 클릭 시 새 페이지 생성, 메인 페이지 링크 자동 연결
- **요소 선택 및 수정**: 미리보기에서 요소 클릭 → 수정 / 링크 / 새 페이지 생성
- **페이지 리뷰 시스템**: 스페이스, 오버랩, 정렬, 타이포그래피, 반응형, 접근성 자동 검사

## API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 메인 위자드 페이지 |
| POST | `/api/chat` | 일반 채팅 (완전 응답) |
| POST | `/api/chat/stream` | 스트리밍 채팅 (SSE, 추론 모드 지원) |
| POST | `/api/chat/stream/modular` | 모듈 기반 스트리밍 생성 |
| GET | `/api/models` | 로딩된 GGUF 모델 정보 |
| POST | `/api/download_default_model` | 기본 모델 다운로드 (HuggingFace, 진행률 SSE) |
| POST | `/api/generate_design_from_url` | URL 분석하여 디자인 생성 |
| GET | `/api/download_status` | 다운로드 상태 확인 |
| POST | `/api/generate_preview` | HTML 미리보기 |
| GET | `/api/design_template/<name>` | 디자인 템플릿 .md 파일 읽기 |
| GET | `/api/design_templates` | 사용 가능한 템플릿 목록 |
| POST | `/api/projects/init` | 새 프로젝트 초기화 |
| POST | `/api/projects` | 프로젝트 저장 |
| GET | `/api/projects` | 프로젝트 목록 |
| GET | `/api/projects/<id>` | 프로젝트 로드 |
| DELETE | `/api/projects/<id>` | 프로젝트 삭제 |
| GET | `/api/projects/<id>/tree` | 프로젝트 파일 트리 |
| POST | `/api/projects/<id>/save_file` | 개별 파일 저장 |
| GET | `/api/projects/<id>/read_file` | 개별 파일 읽기 |
| GET | `/api/projects/<id>/export` | 프로젝트 ZIP 내보내기 |

## 환경 변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_BACKEND` | `local` | AI 백엔드 (`local`: llama-cpp-python, `gemini`: Google Gemini API, `ollama`: 외부 Ollama HTTP API) |
| `MODEL_PATH` | (자동) | GGUF 모델 파일 경로 (설정 안 할 시 models/ 자동 감지) |
| `N_CTX` | `32768` | 컨텍스트 길이 |
| `N_GPU_LAYERS` | `-1` | GPU 오프로딩 레이어 수 (-1: 전체) |
| `N_THREADS` | `16` | CPU 스레드 수 |
| `N_BATCH` | `2048` | 프롬프트 처리 배치 크기 |
| `N_UBATCH` | `512` | 유닛 배치 크기 |
| `PORT` | `5080` | Flask 포트 |
| `GEMINI_API_KEY` | (없음) | Gemini 백엔드 사용 시 API 키 (`LLM_BACKEND=gemini` 필요) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini 모델명 |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 서버 주소 (`LLM_BACKEND=ollama`) |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Ollama 모델명 |

## 모델 설정
- 기본 모델: `ornith-1.0-9b-Q4_K_M.gguf` (~5.7GB)
- 모델 소스: [deepreinforce-ai/Ornith-1.0-9B-GGUF](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B-GGUF)
- GGUF 형식 모델 파일 필요
- 샘플링 (추론 모드): `temperature=0.6`, `top_p=0.95`, `top_k=20`, `min_p=0`
- 생각하기 모드: `enable_thinking=True` (기본 활성화, 추론 과정 표시)
- 대화 히스토리: 최근 5턴 유지

## 하드웨어 가속 설치

### NVIDIA GPU (CUDA)
```bash
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
```

### AMD GPU (Vulkan)
```bash
CMAKE_ARGS="-DGGML_VULKAN=on" pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
```

### Apple Silicon (Metal)
```bash
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
```

### CPU only
```bash
pip install llama-cpp-python
```

## 실행 방법
```bash
# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate.bat

# 의존성 설치
pip install -r requirements.txt

# 기본 모델 다운로드
./download_model.sh

# 개발 모드
python run_desktop.py          # 데스크톱 앱
python app.py                  # 웹 서버 모드

# 커스텀 모델 사용
MODEL_PATH=./models/ornith-1.0-9b-Q4_K_M.gguf python app.py

# Gemini 백엔드 사용
LLM_BACKEND=gemini GEMINI_API_KEY=your-key-here python app.py

# Ollama 외부 백엔드 사용 (별도 Ollama 서버 필요)
LLM_BACKEND=ollama OLLAMA_MODEL=qwen2.5-coder:7b python app.py

# GPU 가속 (환경 변수)
N_GPU_LAYERS=-1 python app.py  # 전체 레이어 GPU 오프로딩
N_CTX=8192 python app.py       # 컨텍스트 길이 축소 (VRAM 절약)

# PyInstaller 빌드
./build.sh         # macOS/Linux
build.bat          # Windows (CPU)
build_cuda.bat     # Windows (NVIDIA CUDA)
build_amd.bat      # Windows (AMD Vulkan)
```

## 최적화 가이드
1. **하드웨어 가속**: GPU 사용 시 `CMAKE_ARGS="-DGGML_CUDA=on"`로 설치, `N_GPU_LAYERS=-1`로 전체 오프로딩
2. **양자화 모델**: Q4_K_M 또는 Q5_K_M 권장 (속도/품질 균형)
3. **n_batch**: 512~2048로 설정하여 프롬프트 처리 속도 향상
4. **n_ctx**: 필요 이상으로 크게 설정하지 않음 (VRAM/RAM 절약)
5. **추론 모드**: `enable_thinking=True`로 활성화, HTML 품질 향상 (속도 약간 느려짐)

## 수정 가이드
- **모델 변경**: `MODEL_PATH` 환경 변수로 GGUF 파일 경로 설정
- **포트 변경**: `PORT` 환경 변수 설정
- **백엔드 전환**: `LLM_BACKEND=gemini` + `GEMINI_API_KEY` 설정 (또는 `LLM_BACKEND=local`)
- **스타일 수정**: `static/css/style.css` (CSS 커스텀 프로퍼티 기반)
- **UI 수정**: `templates/index.html` + `static/js/main.js`
- **디자인 템플릿 추가**: `templates/designs/`에 .md 파일 추가
- **빌드 설정**: `WebGenAI.spec` 수정 후 `pyinstaller WebGenAI.spec`

## Git 정책
- 작업 완료 후 반드시 `git add -A && git commit -m "메시지" && git push` 순서로 푸시할 것
- 커밋 메시지는 변경 내용을 간결하고 명확하게 영어로 작성
- 작업이 완료되기 전에는 절대 커밋/푸시하지 않음

## 주의사항
- 첫 실행 시 models/ 폴더에 GGUF 파일 필요 (웹 UI에서 다운로드 가능)
- PyInstaller 빌드 시 `templates/`와 `static/` 폴더가 번들됨
- GPU 가속은 설치 시 CMAKE_ARGS로 빌드해야 함 (사후 설정 불가)
- 추론 모드 사용 시 최대 토큰이 증가하므로 `N_CTX`를 충분히 설정
- Gemini 백엔드 사용 시 `GEMINI_API_KEY` 환경 변수 필수, `google-genai` 패키지 설치 필요
