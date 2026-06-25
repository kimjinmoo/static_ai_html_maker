# WebGen AI - 홈페이지 마법사

llama-cpp-python을 활용한 AI 홈페이지 생성 도구입니다. 위자드형 UI로 단계별로 홈페이지를 생성합니다.

## 기능

- **위자드형 UI**: 4단계로 홈페이지 생성
  1. 페이지 유형 선택 (회사 사이트 / 랜딩 페이지 / 프로모션 페이지)
  2. 디자인 템플릿 선택 (3가지 + URL 참조 커스텀)
  3. AI 프롬프트로 내용 입력
  4. 실시간 미리보기 및 수정
- **다중 페이지 생성**: 링크 클릭 시 새 페이지 생성, 메인 페이지 링크 자동 연결
- **요소 선택 및 수정**: 미리보기에서 요소 클릭 → 신규 페이지 생성 / 링크 만들기 / 수정
- **링크 네비게이션**: 링크 클릭 시 모달 표시 후 이동, `pages/`, `index.html`, `#` 섹션 지원
- **파일 트리**: 프로젝트 파일 구조 표시, 현재 뷰 파일 하이라이트
- **자동 재시도**: 새 페이지 생성 시 HTML 추출 실패 시 최대 3회 자동 재시도
- **안정적 HTML 추출**: `===HTML_START===` / `===HTML_END===` 마커 기반 추출
- **스트리밍 채팅**: 실시간으로 AI 응답을 받습니다
- **실시간 미리보기**: 생성된 HTML을 우측 패널에서 즉시 확인
- **자동 모델 다운로드**: 웹 UI에서 모델 다운로드 지원
- **GGUF 모델 지원**:任意 GGUF 형식 모델 사용 가능
- **다크 테마**: 모던한 다크 UI
- **EXE 빌드**: PyInstaller로 단일 실행 파일 생성 (Windows/macOS/Linux)

## 기본 모델

| 항목 | 정보 |
|------|------|
| 모델 | Gemma4-E4B-it (Q4_K_M) |
| 크기 | 7.7GB |
| 소스 | [unsloth/gemma-4-E4B-it-GGUF](https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF) |

## 시작하기

### 1. 가상환경 생성 및 의존성 설치

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 모델 다운로드

```bash
# 자동 다운로드 (초기 실행 시 웹 UI에서 프롬프트)
./run.sh

# 또는 수동 다운로드
./download_model.sh
```

### 3. 앱 실행

```bash
# 자동 모델 확인 후 실행
./run.sh

# 또는 직접 실행
python3 app.py

# 커스텀 모델 사용
MODEL_PATH=/path/to/your/model.gguf python3 app.py
```

브라우저에서 `http://localhost:5080` 에 접속합니다.

## 사용 방법

### 1단계: 페이지 유형 선택
- **회사 사이트**: 회사 소개, 서비스, 팀, 연락처 등 여러 섹션의 정적 웹사이트
- **랜딩 페이지**: 제품/서비스 소개와 전환을 위한 단일 페이지
- **프로모션 페이지**: 이벤트, 세일, 캠페인을 위한 단기 페이지

### 2단계: 디자인 템플릿 선택
- **Minimal Clean**: 깔끔하고 여백 많은 미니멀 디자인
- **Bold Modern**: 강렬한 그라데이션과 대담한 타이포그래피
- **Elegant Warm**: 세련된 세리프 폰트와 따뜻한 컬러
- **URL 참조**: 참고할 웹사이트 URL 입력으로 커스텀 디자인 생성

### 3단계: 내용 입력
선택한 유형과 템플릿에 맞춰 홈페이지 내용을 AI 프롬프트로 입력합니다.

### 4단계: 결과 확인
좌측 대화 창과 우측 미리보기 패널에서 결과를 확인하고 수정할 수 있습니다.

### 다중 페이지 작업

- **링크 클릭**: 미리보기에서 링크 클릭 → 모달 표시 → "페이지 생성" 버튼으로 새 페이지 자동 생성
- **요소 선택**: 미리보기에서 요소 클릭 → 액션 모달 (신규 페이지 생성 / 링크 만들기 / 수정)
- **페이지 이동**: 생성된 페이지는 `pages/` 폴더에 저장, 파일 트리에서 클릭하여 이동
- **링크 연결**: 새 페이지 생성 시 메인 페이지의 해당 링크에 자동 연결

## 빌드

### Windows (EXE)

```bat
build.bat
```

- Windows 10/11에서 실행
- 가상환경 자동 생성, 의존성 자동 설치
- 빌드 결과: `dist\WebGenAI\WebGenAI.exe`

### macOS / Linux

```bash
./build.sh
```

- 빌드 결과: `dist/WebGenAI/WebGenAI`

> **중요**: `llama-cpp-python`은 네이티브 C++ 확장이므로 각 플랫폼에서 직접 빌드해야 합니다. 크로스 컴파일은 지원되지 않습니다.

## 프로젝트 구조

```
make_web/
├── app.py                  # Flask 서버 (API + 라우팅)
├── requirements.txt        # 의존성
├── download_model.sh       # 모델 다운로드 스크립트
├── run.sh                  # 실행 스크립트
├── build.sh                # macOS/Linux 빌드 스크립트
├── build.bat               # Windows 빌드 스크립트
├── WebGenAI.spec           # PyInstaller 설정
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

## 기술 스택

- Python 3.9+
- Flask 3.0
- llama-cpp-python (GGUF 모델 지원)
- PyInstaller >=6.15.0

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MODEL_PATH` | (자동) | GGUF 모델 파일 경로 (설정 안 할 시 자동 다운로드) |
| `GGML_CUDA` | `1` | CUDA 가속 사용 (0: 비활성화) |
| `N_CTX` | `16384` | 컨텍스트 길이 |
| `N_THREADS` | `0` | CPU 스레드 수 (0: 자동) |
| `PORT` | `5080` | Flask 포트 |
| `SKIP_MODEL_CHECK` | (비활성) | 모델 체크 슂 |

## License

MIT
