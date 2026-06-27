# WebGen AI - 홈페이지 마법사

llama-cpp-python을 활용한 AI 홈페이지 생성 도구입니다. Flask 기반으로 위자드형 UI를 제공하며, 사용자의 요청에 따라 HTML/CSS/JS 코드를 생성합니다. 추론 모드(reasoning)를 지원하여 AI의 사고 과정을 확인할 수 있고, 모듈 기반 생성으로 안정적인 HTML 생성이 가능합니다.

## 기능

- **위자드형 UI**: 4단계로 홈페이지 생성
  1. 페이지 유형 선택 (회사 사이트 / 랜딩 페이지 / 프로모션 페이지)
  2. 디자인 템플릿 선택 (3가지 + URL 참조 커스텀)
  3. AI 프롬프트로 내용 입력
  4. 실시간 미리보기 및 수정
- **추론 모드**: AI의 사고 과정을 접이식 블록으로 표시 (기본 활성화, UI 토글 제어)
- **모듈 기반 생성**: 계획 → 모듈별 생성 → 조립 파이프라인으로 안정적인 HTML 출력
- **실시간 다운로드 진행률**: 바이트 단위 추적, MB/s 속도 표시
- **다중 페이지 생성**: 링크 클릭 시 새 페이지 생성, 메인 페이지 링크 자동 연결
- **요소 선택 및 수정**: 미리보기에서 요소 클릭 → 신규 페이지 생성 / 링크 만들기 / 수정
- **링크 네비게이션**: 링크 클릭 시 모달 표시 후 이동, `pages/`, `index.html`, `#` 섹션 지원
- **파일 트리**: 프로젝트 파일 구조 표시, 현재 뷰 파일 하이라이트
- **페이지 리뷰 시스템**: 스페이스, 오버랩, 정렬, 타이포그래피, 반응형, 접근성 자동 검사
- **자동 재시도**: 새 페이지 생성 시 HTML 추출 실패 시 최대 3회 자동 재시도
- **안정적 HTML 추출**: `===HTML_START===` / `===HTML_END===` 마커 기반 추출
- **스트리밍 채팅**: 실시간으로 AI 응답을 받습니다
- **실시간 미리보기**: 생성된 HTML을 우측 패널에서 즉시 확인
- **자동 모델 다운로드**: 앱 실행 후 첫 화면에서 모델 다운로드 지원
- **GGUF 모델 지원**: GGUF 형식 모델 사용 가능
- **다크 테마**: 모던한 다크 UI
- **단일 실행 파일**: PyInstaller로 EXE 빌드 (Windows/macOS/Linux)

## 기본 모델

| 항목 | 정보 |
|------|------|
| 모델 | Ornith-1.0-9B (Q4_K_M) |
| 크기 | ~5.7GB |
| 소스 | [deepreinforce-ai/Ornith-1.0-9B-GGUF](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B-GGUF) |
| 샘플링 | temperature=0.6, top_p=0.95, top_k=20, min_p=0 |

## 시작하기

### Windows

#### 1. 빠른 실행 (권장)

```powershell
run.bat
```
가상환경 생성, 의존성 설치, 앱 실행을 자동으로 진행합니다.

#### 2. 수동 실행

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

#### 3. 모델 다운로드
앱 실행 후 첫 화면에서 자동 다운로드가 가능합니다. 수동 다운로드:
```powershell
pip install huggingface-hub
python -c "from huggingface_hub import hf_hub_download; hf_hub_download('deepreinforce-ai/Ornith-1.0-9B-GGUF', filename='ornith-1.0-9b-Q4_K_M.gguf', local_dir='./models')"
```

#### 4. 옵션
```powershell
# 커스텀 모델 사용
$env:MODEL_PATH="models\ornith-1.0-9b-Q4_K_M.gguf"; python app.py

# 포트 변경
$env:PORT="8080"; python app.py

# GPU 가속
$env:N_GPU_LAYERS="-1"; python app.py
```
> **GPU 자동 감지**: NVIDIA/AMD GPU를 자동으로 감지하여 가속을 활성화합니다.

### macOS / Linux

#### 1. 빠른 실행 (권장)

```bash
./run.sh
```
가상환경 생성, 의존성 설치, 앱 실행을 자동으로 진행합니다.

#### 2. 수동 실행

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

#### 3. 모델 다운로드
```bash
./download_model.sh
```
앱 실행 후 첫 화면에서 자동 다운로드도 가능합니다.

#### 4. 옵션
```bash
# 커스텀 모델 사용
MODEL_PATH=/path/to/your/model.gguf python3 app.py

# GPU 가속
N_GPU_LAYERS=-1 python3 app.py
```
> **GPU 자동 감지**: NVIDIA/AMD GPU를 자동으로 감지하여 가속을 활성화합니다.

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
입력창 하단의 **🧠 추론 모드** 토글로 AI의 사고 과정을 표시할지 제어할 수 있습니다.

### 4단계: 결과 확인
좌측 대화 창과 우측 미리보기 패널에서 결과를 확인하고 수정할 수 있습니다.

### 다중 페이지 작업

- **링크 클릭**: 미리보기에서 링크 클릭 → 모달 표시 → "페이지 생성" 버튼으로 새 페이지 자동 생성
- **요소 선택**: 미리보기에서 요소 클릭 → 액션 모달 (신규 페이지 생성 / 링크 만들기 / 수정)
- **페이지 이동**: 생성된 페이지는 `pages/` 폴더에 저장, 파일 트리에서 클릭하여 이동
- **링크 연결**: 새 페이지 생성 시 메인 페이지의 해당 링크에 자동 연결

## 빌드

### Windows

```powershell
build.bat
```

- 가상환경 자동 생성, 의존성 자동 설치
- 빌드 결과: `dist\WebGenAI\WebGenAI.exe`
- 빌드 후 실행 여부 확인

### macOS / Linux

```bash
./build.sh
```

- 빌드 결과: `dist/WebGenAI/WebGenAI`
- 빌드 후 실행 여부 확인

> **중요**: `llama-cpp-python`은 네이티브 C++ 확장이므로 각 플랫폼에서 직접 빌드해야 합니다. 크로스 컴파일은 지원되지 않습니다.

## 프로젝트 구조

```
.
├── app.py                  # Flask 서버 (API + 라우팅)
├── run_desktop.py          # 데스크톱 앱 실행 (pywebview)
├── requirements.txt        # 의존성
├── download_model.sh       # 모델 다운로드 스크립트 (macOS/Linux)
├── run.sh                  # 실행 스크립트 (macOS/Linux)
├── run.bat                 # 실행 스크립트 (Windows)
├── build.sh                # 빌드 스크립트 (macOS/Linux)
├── build.bat               # 빌드 스크립트 (Windows)
├── WebGenAI.spec           # PyInstaller 설정
├── hooks/                  # PyInstaller hook
│   └── hook-llama_cpp.py
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
- pywebview (네이티브 데스크톱 창)
- PyInstaller >=6.15.0

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MODEL_PATH` | (자동) | GGUF 모델 파일 경로 (설정 안 할 시 models/ 자동 감지) |
| `N_CTX` | `32768` | 컨텍스트 길이 |
| `N_GPU_LAYERS` | `-1` | GPU 오프로딩 레이어 수 (-1: 전체) |
| `N_THREADS` | `16` | CPU 스레드 수 |
| `N_BATCH` | `2048` | 프롬프트 처리 배치 크기 |
| `N_UBATCH` | `512` | 유닛 배치 크기 |
| `PORT` | `5080` | Flask 포트 |

## License

MIT
