# WebGen AI 재구성 설계 (2026-06-29)

## 배경

Flask + 로컬 LLM(llama-cpp / Gemini) 기반 정적 홈페이지 생성기. 위자드 Step1~3(용도 → 단일/멀티 템플릿 → 내용)으로 사이트를 생성하고, 채팅으로 생성/수정/삭제, 미리보기 + dev 토글로 요소 단위 수정한다.

## 해결할 문제

1. **디자인 오락가락 + 세션 드롭**: 홈페이지 요청마다 색/폰트/레이아웃이 바뀐다. 프로젝트 로드 시 디자인 맥락이 사라진다.
2. **멀티페이지 불통일**: 페이지마다 head/nav/footer/스타일이 제각각이다.
3. **작업 인식 실패 / 미리보기 깨짐**: 원하는 작업을 인식 못 하고, 미리보기가 안 뜨거나, 화면이 나오던 것이 AI 텍스트로 대체된다.

## 근본 원인 (현 코드 진단)

- **프롬프트 빌더가 3개로 분기**: `app/chat.py:19` `build_messages`, `app/routes/main.py:251` direct 경로, `app/modular.py:390` `generate_multi_page`. 각각 디자인 토큰 주입 방식이 다르다.
- **멀티페이지 direct 경로가 `design_content`를 주입하지 않음** (`app/modular.py:439`). 페이지마다 모델이 임의 스타일.
- **`custom`(URL) 템플릿은 scaffold CSS가 빈 문자열** (`app/utils.py:264`). 통일 기준이 없다.
- **수정 요청이 `current_html[:3000]`만 봄** (`app/chat.py:56`). 매번 잘린 조각에서 디자인을 재추측.
- **서버에 디자인 상태가 저장되지 않음**. 매 요청 처음부터 재구성. 로드된 프로젝트 JSON에 `design_content`가 없으면 조용히 `""`이 되어 디자인 소실.
- **SSE 포맷 2종 + 클라 파서 2개**: `createSSEReader`(`main.js:719`) vs 수기 파서(`main.js:1358`). 추출 실패 시 fall-through가 HTML을 채팅창에 덤프(`main.js:1448`). `updatePreview`는 10자 미만이면 조용히 리턴(`main.js:589`).

## 설계 결정 (확정)

- 범위: **근본 리팩터** (전체 재작성 아님, 기존 UI/위자드 유지).
- 백엔드: 기존 `local`(llama-cpp), `gemini`에 더해 **`ollama`(외부 Ollama HTTP API)** 추가. `LLM_BACKEND=ollama`로 전환. stdlib `urllib`만 사용(신규 의존성 없음). reasoning은 Ollama `message.thinking` 필드로 매핑.
- 대화: **명시적 모드 분리** (ASK/GENERATE/EDIT/DELETE).
- 통일성: **코드가 골격 고정 주입** (head/nav/footer/CSS는 코드 결정, AI는 body만).
- 페이지 구조: **결정적 기본구조 + 편집** (용도별 고정 메뉴 기본값, 채팅으로 추가/제거).
- 모드 UI: 자동 추천을 사용자가 드롭다운으로 덮어쓰기.
- 하위 호환: **불필요** (`design_system` 없는 옛 프로젝트 지원 안 함).

## 아키텍처

### 1. `DesignSystem` — 서버 단일 진실원

신규 모듈 `app/design_system.py`. 디자인 전부를 담는 직렬화 가능 객체:

- `tokens`: CSS 변수 — `primary`, `bg`, `surface`, `text`, `muted`, `accent`, `font_heading`, `font_body`, `radius`, `space`, `shadow`.
- `scaffold_css`: tokens에서 파생된 전체 공통 CSS 문자열. **절대 비어 있지 않음**.
- `shell`: 공통 `<head>`(meta/title/font link/`<style>`), `nav`, `footer`, 전역 `<script>`.

생성 시점:
- 템플릿 선택 → 해당 디자인 `.md` + 토큰 프리셋에서 `DesignSystem` 1회 생성.
- URL(`custom`) → `/api/generate_design_from_url` 분석 결과를 **토큰 풀세트로 매핑**(빈 CSS 금지).

저장/복원:
- 프로젝트 JSON에 `design_system` 키로 저장.
- 프로젝트 로드 시 복원 → 세션 드롭 제거.

**모든 프롬프트 경로가 이 객체 하나만 읽는다.**

### 2. 단일 프롬프트 빌더

`build_messages`(chat.py) + direct 경로(main.py) + `generate_multi_page`(modular.py)의 프롬프트 조립을 단일 함수로 통합:

```
build_generation_prompt(design_system, mode, page_meta, user_content, current_html=None)
```

- 시스템 프롬프트 = 고정 베이스 + `design_system.tokens`(명시 값) + scaffold 클래스 레퍼런스.
- **AI는 body 콘텐츠만 생성** (`===CONTENT_START===`/`===CONTENT_END===` 사이).
- 골격(head/nav/footer/CSS)은 코드가 `design_system.shell` + `build_scaffold_frame`로 결정적 조립.
- 멀티페이지: 전 페이지가 동일 `design_system`을 사용 → head/nav/footer/색 100% 동일.

### 3. 명시적 모드 분리

작업 의도를 4종으로 분류:

| 모드 | 동작 | 미리보기 |
|------|------|----------|
| ASK | 상담/질문/제안 | **안 건드림** |
| GENERATE | 새 페이지/사이트 생성 | 갱신 |
| EDIT | 수정/요소 수정 | 갱신 |
| DELETE | 페이지/요소 삭제 | 갱신 |

- `decide_strategy`(strategies.py)는 자동 추천만 담당.
- UI에 현재 모드 표시 + 드롭다운으로 사용자가 덮어쓰기.
- **ASK는 절대 미리보기를 건드리지 않는다** (문제3의 '인식 실패' 직접 해결).

### 4. 통일된 SSE 프로토콜 + 단일 파서

모든 스트리밍 엔드포인트가 단일 이벤트 스키마 사용:

```json
{ "phase": "<단계명>", "type": "<라우팅키>", "payload": <데이터> }
```

`type` 값과 클라 라우팅:
- `status` → 모달 진행상황 표시
- `reasoning` → 숨김(추론 과정)
- `chat` → 채팅창에만 추가
- `html` → 미리보기 iframe에만 반영
- `done` → 완료(최종 HTML 포함 가능)
- `error` → 에러 표시

- **서버가 `type`으로 명시 라우팅**. 클라는 단일 파서(`createSSEReader`)로 `type` 분기만 수행.
- 콘텐츠 기반 추측, 마커 의존 추출, fall-through 덤프 전부 제거.
- 수기 파서(`main.js:1358`) 삭제.

### 5. HTML 조립·렌더 견고화

- 서버가 `shell` + AI body를 **결정적 조립 + 검증**(`ensure_complete_html`) 후 `html`/`done` 이벤트로 전송.
- 클라는 마커 추출을 하지 않는다 — 받은 HTML을 그대로 렌더.
- `updatePreview`:
  - 10자 미만 조용한 리턴 제거 → 빈 결과면 에러 표시.
  - `<script>` 제거는 유지(보안), 단 상호작용 스크립트는 주입.

### 6. 편집 정확도

- EDIT는 `current_html[:3000]` 대신 **저장 파일의 전체 현재 HTML**을 서버가 직접 읽어 사용.
- dev 모드 요소 수정은 char-truncation 대신 **element-id 타겟팅**: 클릭된 요소에 안정적 id를 부여하고, 그 id 범위만 모델에게 수정 요청.

## 컴포넌트 경계

| 단위 | 책임 | 의존 |
|------|------|------|
| `app/design_system.py` | DesignSystem 생성/직렬화/토큰→CSS | config, 디자인 `.md` |
| `app/prompts.py` | 고정 프롬프트 상수 | — |
| `build_generation_prompt` (신규, chat.py) | 단일 프롬프트 조립 | design_system, prompts |
| `app/modular.py` | 멀티페이지 오케스트레이션(프롬프트는 빌더 위임) | build_generation_prompt |
| `app/sse.py` (신규) | 통일 SSE 이벤트 직렬화 헬퍼 | — |
| `app/routes/main.py` | 엔드포인트 → 모드 라우팅 → SSE | strategies, builder, sse |
| `static/js/main.js` | 단일 SSE 파서 + type 라우팅 + updatePreview | — |

## 구현 순서

1. `design_system.py` + 프로젝트 저장/복원.
2. 프롬프트 빌더 통합(`build_generation_prompt`), 3경로 위임 전환.
3. SSE 프로토콜 통일(`app/sse.py`) — 서버 이벤트 + 클라 단일 파서.
4. 모드 분리 UI(드롭다운 + ASK 미리보기 보호).
5. 편집 경로 개선(전체 HTML + element-id 타겟팅).
6. 통합 검증.

각 단계 끝에 실제 앱 실행으로 동작 확인.

## 검증 기준

- 동일 프로젝트에서 연속 수정 시 색/폰트/레이아웃 불변.
- 멀티페이지 전 페이지 head/nav/footer/색 동일.
- ASK 요청 시 미리보기 불변, 응답은 채팅창에만.
- GENERATE/EDIT 시 미리보기 갱신, 채팅창에 HTML 덤프 없음.
- 프로젝트 로드 후 생성/수정해도 디자인 유지(세션 드롭 없음).
- dev 모드 요소 수정이 char 3000 이후 요소도 정확히 반영.

## 범위 밖 (YAGNI)

- 전체 UI 재설계.
- 옛 프로젝트(`design_system` 없는) 마이그레이션.
- LLM 기반 멀티페이지 자동 플래너(결정적 기본구조 사용).
