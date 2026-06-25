# AGENTS.md - WebGen AI

## 프로젝트 개요
llama-cpp-python을 활용한 AI 홈페이지 생성 도구입니다. Flask 기반으로 위자드형 UI를 제공하며, 사용자의 요청에 따라 HTML/CSS/JS 코드를 생성합니다.

## 기술 스택
- **Backend**: Python 3.9+, Flask 3.0 (Python 3.14 권장 시 PyInstaller >=6.15.0 필요)
- **AI Engine**: llama-cpp-python (GGUF 모델 지원)
- **Frontend**: Vanilla HTML/CSS/JS
- **빌드**: PyInstaller >=6.15.0 (Python 3.14 호환)

## 프로젝트 구조
```
make_web/
├── app.py                  # Flask 메인 서버 (API + 라우팅)
├── requirements.txt        # Python 의존성
├── download_model.sh       # 모델 다운로드 스크립트
├── run.sh                  # 실행 스크립트
├── WebGenAI.spec           # PyInstaller 빌드 설정
├── build.sh / build.bat    # 빌드 스크립트 (macOS/Linux, Windows)
├── models/                 # 모델 저장 디렉토리
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

## API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 메인 위자드 페이지 |
| POST | `/api/chat` | 일반 채팅 (완전 응답) |
| POST | `/api/chat/stream` | 스트리밍 채팅 (SSE) |
| GET | `/api/models` | 로딩된 GGUF 모델 정보 |
| POST | `/api/download_default_model` | 기본 모델 다운로드 |
| POST | `/api/generate_design_from_url` | URL 분석하여 디자인 생성 |
| GET | `/api/download_status` | 다운로드 상태 확인 |
| POST | `/api/generate_preview` | HTML 미리보기 |

## 환경 변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MODEL_PATH` | (자동) | GGUF 모델 파일 경로 (설정 안 할 시 자동 다운로드) |
| `GGML_CUDA` | `1` | CUDA 가속 사용 (0: 비활성화) |
| `N_CTX` | `4096` | 컨텍스트 길이 |
| `N_THREADS` | `0` | CPU 스레드 수 (0: 자동) |
| `PORT` | `5080` | Flask 포트 |
| `SKIP_MODEL_CHECK` | (비활성) | 모델 체크 스킵 |

## 모델 설정
- 기본 모델: `gemma-4-12B-it-Q4_K_M.gguf` (7.7GB)
- GGUF 형식 모델 파일 필요
- 샘플링: `temperature=1.0`, `top_p=0.95`, `top_k=64`
- 대화 히스토리: 최근 10턴 유지

## 실행 방법
```bash
# 가상환경 생성 및 활성화 (PEP 668 필수)
python3 -m venv .venv
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt

# 기본 모델 다운로드
./download_model.sh

# 개발 모드 (자동 모델 확인)
./run.sh

# 커스텀 모델 사용
MODEL_PATH=/path/to/model.gguf python3 app.py

# CUDA 가속 사용
GGML_CUDA=1 python3 app.py

# PyInstaller 빌드
./build.sh        # macOS/Linux
build.bat         # Windows

# 가상환경 비활성화
deactivate
```

## 수정 가이드
- **모델 변경**: `MODEL_PATH` 환경 변수로 GGUF 파일 경로 설정
- **포트 변경**: `PORT` 환경 변수 설정
- **스타일 수정**: `static/css/style.css` (CSS 커스텀 프로퍼티 기반)
- **UI 수정**: `templates/index.html` + `static/js/main.js`
- **디자인 템플릿 추가**: `templates/designs/`에 .md 파일 추가
- **빌드 설정**: `WebGenAI.spec` 수정 후 `pyinstaller WebGenAI.spec`

## 주의사항
- 첫 실행 시 기본 모델 자동 다운로드 프롬프트 (웹 UI에서 가능)
- PyInstaller 빌드 시 `templates/`와 `static/` 폴더가 번들됨
