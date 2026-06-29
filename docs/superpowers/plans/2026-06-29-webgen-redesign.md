# WebGen AI 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자인 오락가락·세션 드롭·멀티페이지 불통일·미리보기 깨짐을 제거하기 위해, 단일 `DesignSystem`(서버 저장) + 단일 프롬프트 빌더 + 통일 SSE 프로토콜 + 명시적 모드 분리로 재구성한다.

**Architecture:** 프로젝트별 디자인 상태를 `DesignSystem` 객체로 서버 JSON에 저장하고, 모든 생성/수정 경로가 이 객체 하나만 읽는다. AI는 body 콘텐츠만 생성하고 골격(head/nav/footer/CSS)은 코드가 결정적으로 조립한다. 모든 SSE 스트림은 `{phase,type,payload}` 단일 스키마를 쓰고 클라는 단일 파서로 `type`별 라우팅(`html`→미리보기, `chat`→채팅창)한다.

**Tech Stack:** Python 3.9+, Flask 3.0, llama-cpp-python / Gemini, Vanilla JS (SSE), pytest(신규 dev 의존성).

---

## 사전 준비 (테스트 하네스)

이 저장소엔 테스트 프레임워크가 없다. 순수 로직 단위(토큰→CSS, SSE 직렬화, 프롬프트 빌더, 모드 분류)는 pytest로 TDD하고, 스트리밍·미리보기·UI는 실제 앱 실행으로 수동 검증한다.

### Task 0: pytest 도입

**Files:**
- Modify: `requirements.txt`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: requirements에 pytest 추가**

`requirements.txt` 끝에 추가:
```
pytest>=8.0.0
```

- [ ] **Step 2: 설치**

Run: `pip install pytest>=8.0.0`
Expected: `Successfully installed pytest-8.x`

- [ ] **Step 3: 테스트 패키지 생성**

`tests/__init__.py` (빈 파일).

`tests/conftest.py`:
```python
import os
import sys

# 프로젝트 루트를 import 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

- [ ] **Step 4: 동작 확인**

Run: `python -m pytest -q`
Expected: `no tests ran` (수집 0개, 에러 없음)

- [ ] **Step 5: Commit**

```bash
git add requirements.txt tests/__init__.py tests/conftest.py
git commit -m "test: add pytest harness"
```

---

## Phase 1 — DesignSystem (서버 단일 진실원)

새 모듈이 디자인 상태를 한 객체로 보유한다. 빈 CSS 금지(custom은 base scaffold로 폴백), 직렬화/역직렬화로 프로젝트 JSON에 저장.

기존 자산: `templates/scaffolds/{minimal_clean,bold_modern,elegant_warm}.css` 존재. `load_scaffold_css`(`app/utils.py:260`)는 custom일 때 `""` 반환 → 이 빈값이 통일성 붕괴의 핵심. DesignSystem이 이를 흡수한다.

### Task 1.1: DesignSystem 코어 (토큰·scaffold·직렬화)

**Files:**
- Create: `app/design_system.py`
- Test: `tests/test_design_system.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_design_system.py`:
```python
from app.design_system import DesignSystem


def test_builtin_template_has_nonempty_scaffold():
    ds = DesignSystem.create(template="minimal_clean", page_type="company",
                             design_content="primary=#111", brand="ACME")
    assert ds.scaffold_css.strip() != ""
    assert ds.template == "minimal_clean"


def test_custom_template_falls_back_to_base_scaffold():
    # custom(URL) 디자인은 scaffold가 비면 안 된다 — base로 폴백
    ds = DesignSystem.create(template="custom", page_type="landing",
                             design_content="primary=#ff0000", brand="X")
    assert ds.scaffold_css.strip() != ""


def test_roundtrip_serialization():
    ds = DesignSystem.create(template="bold_modern", page_type="landing",
                             design_content="tokens here", brand="Brand")
    data = ds.to_dict()
    restored = DesignSystem.from_dict(data)
    assert restored.template == ds.template
    assert restored.scaffold_css == ds.scaffold_css
    assert restored.design_content == ds.design_content
    assert restored.brand == ds.brand


def test_design_section_includes_tokens_and_class_reference():
    ds = DesignSystem.create(template="minimal_clean", page_type="company",
                             design_content="primary=#123456", brand="B")
    section = ds.design_prompt_section()
    assert "primary=#123456" in section
    assert ".container" in section  # SCAFFOLD_CLASS_REFERENCE 포함
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_design_system.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.design_system'`

- [ ] **Step 3: 구현**

`app/design_system.py`:
```python
"""DesignSystem: 프로젝트 디자인 상태의 단일 진실원.

모든 생성/수정 프롬프트 경로가 이 객체 하나만 읽는다. scaffold_css는 절대
비어 있지 않다(custom 템플릿은 base scaffold로 폴백). 직렬화하여 프로젝트
JSON의 design_system 키에 저장하고, 로드 시 복원한다."""

from dataclasses import dataclass, field

from app.utils import load_scaffold_css, SCAFFOLD_CLASS_REFERENCE

# custom(URL) 디자인이 골격 CSS를 못 주는 경우 사용할 기본 골격
BASE_SCAFFOLD_TEMPLATE = "minimal_clean"

TEMPLATE_NAMES = {
    "minimal_clean": "Minimal Clean (까끗한 미니멀)",
    "bold_modern": "Bold Modern (강렬한 다크)",
    "elegant_warm": "Elegant Warm (세련된 따뜻한)",
    "custom": "URL 기반 커스텀 디자인",
}

TYPE_NAMES = {
    "company": "회사 사이트 (정적 웹사이트)",
    "landing": "랜딩 페이지 (제품/서비스 소개)",
    "promotion": "프로모션 페이지 (이벤트/캠페인)",
}


@dataclass
class DesignSystem:
    template: str
    page_type: str
    design_content: str = ""
    scaffold_css: str = ""
    brand: str = "WebGen AI"
    menu_items: list = field(default_factory=list)

    @classmethod
    def create(cls, template, page_type, design_content="", brand="WebGen AI",
               menu_items=None):
        scaffold = load_scaffold_css(template)
        if not scaffold or not scaffold.strip():
            # custom 또는 미발견 → base 골격으로 폴백 (빈 CSS 금지)
            scaffold = load_scaffold_css(BASE_SCAFFOLD_TEMPLATE)
        return cls(
            template=template,
            page_type=page_type,
            design_content=design_content or "",
            scaffold_css=scaffold or "",
            brand=brand or "WebGen AI",
            menu_items=list(menu_items or []),
        )

    def scaffold_template_name(self):
        """build_scaffold_frame에 넘길 폰트/스타일 키. custom은 base를 쓴다."""
        if self.template in ("minimal_clean", "bold_modern", "elegant_warm"):
            return self.template
        return BASE_SCAFFOLD_TEMPLATE

    def design_prompt_section(self):
        """모든 생성 프롬프트에 동일하게 주입되는 디자인 지침 블록."""
        parts = [
            f"## 디자인 템플릿: {TEMPLATE_NAMES.get(self.template, self.template)}",
            f"## 페이지 유형: {TYPE_NAMES.get(self.page_type, self.page_type)}",
        ]
        if self.design_content.strip():
            parts.append(f"## 디자인 토큰 (반드시 준수)\n{self.design_content.strip()}")
        parts.append(SCAFFOLD_CLASS_REFERENCE)
        return "\n\n".join(parts)

    def to_dict(self):
        return {
            "template": self.template,
            "page_type": self.page_type,
            "design_content": self.design_content,
            "scaffold_css": self.scaffold_css,
            "brand": self.brand,
            "menu_items": self.menu_items,
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            template=data.get("template", ""),
            page_type=data.get("page_type", ""),
            design_content=data.get("design_content", ""),
            scaffold_css=data.get("scaffold_css", ""),
            brand=data.get("brand", "WebGen AI"),
            menu_items=list(data.get("menu_items", [])),
        )
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_design_system.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add app/design_system.py tests/test_design_system.py
git commit -m "feat: add DesignSystem single source of truth"
```

### Task 1.2: 결정적 프레임 빌더를 DesignSystem에 연결

`build_scaffold_frame`(`app/utils.py:397`)는 이미 결정적 프레임을 만든다. DesignSystem이 이를 감싸 `build_frame(title, current_file)`을 제공한다.

**Files:**
- Modify: `app/design_system.py`
- Test: `tests/test_design_system.py`

- [ ] **Step 1: 실패 테스트 추가**

`tests/test_design_system.py` 끝에 추가:
```python
def test_build_frame_contains_content_placeholder_and_scaffold():
    ds = DesignSystem.create(template="minimal_clean", page_type="company",
                             design_content="", brand="ACME",
                             menu_items=["홈", "소개"])
    frame = ds.build_frame(title="홈", current_file="index.html")
    assert "{CONTENT}" in frame
    assert "<!DOCTYPE html>" in frame
    assert "ACME" in frame          # brand가 nav에 들어감
    assert ds.scaffold_css[:40] in frame  # scaffold CSS가 <style>에 포함
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_design_system.py::test_build_frame_contains_content_placeholder_and_scaffold -q`
Expected: FAIL — `AttributeError: 'DesignSystem' object has no attribute 'build_frame'`

- [ ] **Step 3: 구현**

`app/design_system.py` 상단 import에 추가:
```python
from app.utils import load_scaffold_css, SCAFFOLD_CLASS_REFERENCE, build_scaffold_frame
```

`DesignSystem`에 메서드 추가:
```python
    def build_frame(self, title="Page", current_file="index.html"):
        """{CONTENT} 플레이스홀더를 가진 완전한 HTML 프레임을 결정적으로 생성.
        head/nav/footer/CSS는 전부 이 디자인시스템으로 통일된다."""
        return build_scaffold_frame(
            self.scaffold_css,
            template_name=self.scaffold_template_name(),
            title=title,
            menu_items=self.menu_items or None,
            current_file=current_file,
            brand=self.brand,
        )
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_design_system.py -q`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add app/design_system.py tests/test_design_system.py
git commit -m "feat: DesignSystem.build_frame deterministic page frame"
```

### Task 1.3: 프로젝트 저장/로드에 design_system 영속화

`init_project`(`project_routes.py:58`), `save_project`(`:138`), `load_project`(`:219`)에 `design_system` 키를 추가. 옛 프로젝트 호환 불필요(스펙 확정).

**Files:**
- Modify: `app/routes/project_routes.py:97-108` (init meta)
- Modify: `app/routes/project_routes.py:138-216` (save)
- Test: `tests/test_project_design_system.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_project_design_system.py`:
```python
import json
import os
import tempfile

import app.routes.project_routes as pr


def test_save_persists_design_system(monkeypatch, tmp_path):
    monkeypatch.setattr(pr, "get_projects_dir", lambda: str(tmp_path))

    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()

    ds = {"template": "bold_modern", "page_type": "landing",
          "design_content": "primary=#abc", "scaffold_css": ".x{}",
          "brand": "ACME", "menu_items": ["홈"]}
    resp = client.post("/api/projects", json={
        "id": "proj1", "title": "T", "page_type": "landing",
        "template": "bold_modern", "html": "<!DOCTYPE html><html><body><p>x</p></body></html>",
        "history": [], "design_content": "primary=#abc", "design_system": ds,
    })
    assert resp.status_code == 200

    with open(os.path.join(tmp_path, "proj1.json"), encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["design_system"]["template"] == "bold_modern"
    assert saved["design_system"]["scaffold_css"] == ".x{}"
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_project_design_system.py -q`
Expected: FAIL — `KeyError: 'design_system'`

- [ ] **Step 3: init_project에 design_system 기본값 추가**

`project_routes.py` `project_meta` 딕셔너리(`:97-108`)의 `"design_content": "",` 줄 다음에 추가:
```python
        "design_system": None,
```

- [ ] **Step 4: save_project에서 design_system 읽고 저장**

`save_project`의 `design_content = data.get("design_content", "")` 줄(`:147`) 다음에 추가:
```python
    design_system = data.get("design_system", None)
```

`project_data` 딕셔너리(`:196-210`)의 `"design_content": design_content,` 줄 다음에 추가:
```python
        "design_system": design_system if design_system is not None else existing_meta.get("design_system"),
```

- [ ] **Step 5: 통과 확인**

Run: `python -m pytest tests/test_project_design_system.py -q`
Expected: PASS (1 passed)

- [ ] **Step 6: load_project가 design_system을 그대로 반환하는지 확인**

`load_project`(`:219`)는 `project = json.load(f)` 후 project를 jsonify한다. design_system 키가 이미 JSON에 있으므로 자동 포함됨. 코드 변경 불필요 — 확인만.

Run: `python -m pytest tests/ -q`
Expected: PASS (전체)

- [ ] **Step 7: Commit**

```bash
git add app/routes/project_routes.py tests/test_project_design_system.py
git commit -m "feat: persist design_system in project save/load"
```

---

## Phase 2 — 단일 프롬프트 빌더

3개로 갈라진 프롬프트 조립(`chat.py:19`, `main.py:251-311`, `modular.py`)을 단일 함수로 통합한다. AI는 body 콘텐츠만 생성(`===CONTENT_START===`/`===CONTENT_END===`), 골격은 `DesignSystem.build_frame`이 결정적으로 조립.

### Task 2.1: build_generation_prompt 통합 함수

**Files:**
- Create: `app/generation.py`
- Test: `tests/test_generation_prompt.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_generation_prompt.py`:
```python
from app.design_system import DesignSystem
from app.generation import build_generation_prompt, Mode


def _ds():
    return DesignSystem.create(template="minimal_clean", page_type="company",
                              design_content="primary=#123456", brand="ACME")


def test_generate_mode_uses_content_only_and_injects_design():
    msgs = build_generation_prompt(_ds(), Mode.GENERATE, user_message="카페 홈페이지",
                                   history=[], current_html=None, element_context=None)
    sys = msgs[0]["content"]
    assert "===CONTENT_START===" in sys      # CONTENT_ONLY_PROMPT
    assert "primary=#123456" in sys          # 디자인 토큰 주입
    assert msgs[-1]["role"] == "user"
    assert "카페 홈페이지" in msgs[-1]["content"]


def test_edit_mode_includes_full_current_html_not_truncated():
    big = "<!DOCTYPE html><html><body>" + ("<p>x</p>" * 1000) + "</body></html>"
    msgs = build_generation_prompt(_ds(), Mode.EDIT, user_message="배경 빨강으로",
                                   history=[], current_html=big, element_context=None)
    joined = "\n".join(m["content"] for m in msgs)
    # 3000자 절단 없음 — 전체 포함
    assert big in joined


def test_history_capped_at_5():
    hist = [{"role": "user", "content": f"m{i}"} for i in range(10)]
    msgs = build_generation_prompt(_ds(), Mode.GENERATE, user_message="x",
                                   history=hist, current_html=None, element_context=None)
    # system + 최근 5턴 + user = 7
    assert len(msgs) == 7
    assert msgs[1]["content"] == "m5"


def test_element_edit_uses_element_id_target():
    msgs = build_generation_prompt(_ds(), Mode.EDIT, user_message="텍스트 바꿔",
                                   history=[], current_html="<div data-wgen-id='e3'>old</div>",
                                   element_context={"wgen_id": "e3", "tag": "div", "text": "old"})
    joined = "\n".join(m["content"] for m in msgs)
    assert "e3" in joined  # element id 타겟팅
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_generation_prompt.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.generation'`

- [ ] **Step 3: 구현**

`app/generation.py`:
```python
"""단일 생성/수정 프롬프트 빌더. 모든 경로가 이 함수를 통해 프롬프트를 만든다.
AI는 body 콘텐츠만 생성하고 골격은 DesignSystem.build_frame이 조립한다."""

from enum import Enum

from app.prompts import CONTENT_ONLY_PROMPT, SYSTEM_PROMPT

HISTORY_TURNS = 5


class Mode(str, Enum):
    ASK = "ask"
    GENERATE = "generate"
    EDIT = "edit"
    DELETE = "delete"


def _design_system_prompt(ds):
    return CONTENT_ONLY_PROMPT + "\n\n" + ds.design_prompt_section()


def build_generation_prompt(ds, mode, user_message, history=None,
                            current_html=None, element_context=None):
    """모드별 messages 리스트를 만든다.

    GENERATE: 새 페이지 콘텐츠 생성(body 섹션만).
    EDIT/DELETE: 현재 HTML 전체를 주고 수정/삭제. element_context가 있으면
                 data-wgen-id로 대상 요소를 명시 타겟팅.
    """
    history = history or []

    if mode in (Mode.EDIT, Mode.DELETE):
        system = SYSTEM_PROMPT + "\n\n" + ds.design_prompt_section()
        user = _build_edit_user_message(mode, user_message, current_html, element_context)
    else:  # GENERATE
        system = _design_system_prompt(ds)
        user = f"## 요청\n{user_message}"

    messages = [{"role": "system", "content": system}]
    for msg in history[-HISTORY_TURNS:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user})
    return messages


def _build_edit_user_message(mode, user_message, current_html, element_context):
    parts = []
    if element_context:
        wid = element_context.get("wgen_id", "")
        parts.append("## 수정 대상 요소 (이 요소만 변경)")
        parts.append(f"- data-wgen-id: {wid}")
        parts.append(f"- 태그: {element_context.get('tag','')}")
        if element_context.get("text"):
            parts.append(f"- 현재 텍스트: {element_context['text'][:300]}")
        parts.append("")
    if current_html:
        parts.append("## 현재 전체 HTML (수정 대상)")
        parts.append("```html")
        parts.append(current_html)   # 절단 없음 — 전체
        parts.append("```")
        parts.append("")
    action = "삭제" if mode == Mode.DELETE else "수정"
    parts.append(f"## 사용자 요청 ({action})")
    parts.append(user_message)
    parts.append("")
    parts.append("## 규칙 (반드시 준수)")
    if element_context:
        parts.append(f"1. data-wgen-id='{element_context.get('wgen_id','')}' 요소만 {action}하고 나머지는 그대로 유지.")
    else:
        parts.append(f"1. 요청에 해당하는 부분만 {action}하고 나머지 구조는 그대로 유지.")
    parts.append("2. 수정된 완전한 HTML 파일 전체를 출력.")
    parts.append("3. 반드시 ===HTML_START=== 로 시작하여 ===HTML_END=== 로 끝낼 것.")
    parts.append("4. 마크다운 코드블록(```)·설명·변경사항 리스트를 절대 출력하지 말 것.")
    return "\n".join(parts)
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_generation_prompt.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add app/generation.py tests/test_generation_prompt.py
git commit -m "feat: unified build_generation_prompt for all paths"
```

### Task 2.2: 모드 분류기 (decide_strategy → Mode)

`decide_strategy`(`strategies.py:89`)를 Mode로 매핑하는 얇은 어댑터. ASK 모드를 신규 도입(상담/질문 — 미리보기 안 건드림).

**Files:**
- Create: `app/mode.py`
- Test: `tests/test_mode.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_mode.py`:
```python
from app.mode import classify_mode
from app.generation import Mode


def test_element_selected_is_edit():
    assert classify_mode("색 바꿔", has_html=True, has_element=True) == Mode.EDIT


def test_question_without_html_is_generate_when_build_keyword():
    assert classify_mode("카페 홈페이지 만들어줘", has_html=False, has_element=False) == Mode.GENERATE


def test_pure_question_is_ask():
    assert classify_mode("어떤 색이 좋을까?", has_html=True, has_element=False) == Mode.ASK
    assert classify_mode("이거 어떻게 생각해?", has_html=True, has_element=False) == Mode.ASK


def test_delete_keyword_with_element_is_delete():
    assert classify_mode("이거 삭제해", has_html=True, has_element=True) == Mode.DELETE
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_mode.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.mode'`

- [ ] **Step 3: 구현**

`app/mode.py`:
```python
"""사용자 의도를 4개 모드로 분류. ASK는 미리보기를 건드리지 않는다."""

from app.generation import Mode

DELETE_KEYWORDS = ["삭제", "제거", "없애", "지워", "지우", "delete", "remove"]

# 순수 질문/상담 신호 — 생성/수정 동사가 없을 때만 ASK
ASK_KEYWORDS = ["어떻게 생각", "어떨까", "추천", "의견", "좋을까", "괜찮을까",
                "뭐가 나아", "어떤 게", "조언", "알려줘", "설명해"]

BUILD_KEYWORDS = ["만들", "생성", "추가", "바꿔", "변경", "수정", "고쳐", "넣어",
                  "디자인", "페이지", "홈페이지", "섹션"]


def classify_mode(message, has_html, has_element):
    msg = (message or "").lower()

    if has_element:
        if any(k in msg for k in DELETE_KEYWORDS):
            return Mode.DELETE
        return Mode.EDIT

    has_build = any(k in msg for k in BUILD_KEYWORDS)
    has_ask = any(k in msg for k in ASK_KEYWORDS)

    # 순수 질문(빌드 동사 없음) → ASK
    if has_ask and not has_build:
        return Mode.ASK

    if not has_html:
        return Mode.GENERATE

    if any(k in msg for k in DELETE_KEYWORDS):
        return Mode.DELETE
    if has_build:
        return Mode.EDIT

    # 기본: HTML 있고 빌드 신호 없음 → ASK(미리보기 보호)
    return Mode.ASK
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_mode.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add app/mode.py tests/test_mode.py
git commit -m "feat: classify_mode with ASK mode (preview-safe)"
```

---

## Phase 3 — 통일 SSE 프로토콜 + 단일 클라 파서

모든 스트림이 `{phase,type,payload}` 단일 스키마. `type`: `status`/`reasoning`/`chat`/`html`/`done`/`error`. 서버가 명시 라우팅, 클라는 단일 파서로 분기.

### Task 3.1: SSE 직렬화 헬퍼

**Files:**
- Create: `app/sse.py`
- Test: `tests/test_sse.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_sse.py`:
```python
import json
from app.sse import sse_event, EventType


def test_sse_event_shape():
    line = sse_event(EventType.CHAT, "안녕", phase="ask")
    assert line.startswith("data: ")
    assert line.endswith("\n\n")
    payload = json.loads(line[len("data: "):].strip())
    assert payload == {"phase": "ask", "type": "chat", "payload": "안녕"}


def test_sse_event_handles_surrogates():
    bad = "test\ud83d"  # lone surrogate
    line = sse_event(EventType.HTML, bad, phase="generate")
    # 인코딩 에러 없이 직렬화돼야 함
    line.encode("utf-8")


def test_done_event():
    line = sse_event(EventType.DONE, {"html": "<p>x</p>"}, phase="generate")
    payload = json.loads(line[len("data: "):].strip())
    assert payload["type"] == "done"
    assert payload["payload"]["html"] == "<p>x</p>"
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_sse.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.sse'`

- [ ] **Step 3: 구현**

`app/sse.py`:
```python
"""통일 SSE 이벤트 직렬화. 모든 스트림 엔드포인트가 이걸 쓴다.

이벤트 스키마: {"phase": <str>, "type": <EventType>, "payload": <any>}
클라는 type으로만 라우팅한다 (html→미리보기, chat→채팅창).
"""

import json
from enum import Enum

from app.utils import sanitize_surrogates


class EventType(str, Enum):
    STATUS = "status"        # 모달 진행상황
    REASONING = "reasoning"  # 추론 과정 (클라에서 숨김)
    CHAT = "chat"            # 채팅창에만 표시
    HTML = "html"            # 미리보기 iframe에만 반영 (스트리밍 조각)
    DONE = "done"            # 완료 (payload에 최종 html 포함 가능)
    ERROR = "error"


def _sanitize(value):
    if isinstance(value, str):
        return sanitize_surrogates(value)
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


def sse_event(event_type, payload, phase=""):
    et = event_type.value if isinstance(event_type, EventType) else str(event_type)
    obj = {"phase": phase, "type": et, "payload": _sanitize(payload)}
    try:
        body = json.dumps(obj, ensure_ascii=True)
    except Exception:
        obj["payload"] = repr(obj["payload"])
        body = json.dumps(obj, ensure_ascii=True)
    return f"data: {body}\n\n"
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_sse.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add app/sse.py tests/test_sse.py
git commit -m "feat: unified SSE event serializer"
```

### Task 3.2: 단일 스트림 엔드포인트 `/api/chat/stream/v2`

기존 3개 경로(`/api/chat/stream`, `/api/chat/stream/modular`)를 대체할 단일 엔드포인트. 모드를 분류하고, GENERATE/EDIT/DELETE는 결정적 프레임 + AI 콘텐츠로 조립해 `html`/`done` 이벤트, ASK는 `chat` 이벤트만 낸다. 멀티페이지는 페이지별 동일 DesignSystem으로 반복.

**Files:**
- Create: `app/routes/stream_routes.py`
- Modify: `app/__init__.py:53-56` (블루프린트 등록)
- Test: `tests/test_stream_v2.py`

- [ ] **Step 1: 실패 테스트 작성 (ASK는 미리보기 안 건드림)**

`tests/test_stream_v2.py`:
```python
import json

import app.routes.stream_routes as sr


def _events(resp):
    out = []
    for raw in resp.data.decode("utf-8").split("\n\n"):
        raw = raw.strip()
        if raw.startswith("data: "):
            out.append(json.loads(raw[len("data: "):]))
    return out


def test_ask_mode_emits_only_chat_no_html(monkeypatch):
    # LLM을 가짜로 대체
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter(["좋은", " 질문", "이네요"]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    resp = client.post("/api/chat/stream/v2", json={
        "message": "어떤 색이 좋을까?", "has_html": True, "has_element": False,
        "design_system": {"template": "minimal_clean", "page_type": "company",
                          "scaffold_css": ".x{}", "design_content": "", "brand": "B",
                          "menu_items": []},
        "current_html": "<!DOCTYPE html><html><body></body></html>",
        "history": [],
    })
    evts = _events(resp)
    types = {e["type"] for e in evts}
    assert "chat" in types
    assert "html" not in types  # ASK는 미리보기 절대 안 건드림
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_stream_v2.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routes.stream_routes'`

- [ ] **Step 3: 구현**

`app/routes/stream_routes.py`:
```python
"""통일 스트림 엔드포인트. 모드 분류 → DesignSystem 기반 결정적 조립 →
통일 SSE 이벤트. ASK는 chat만, 생성/수정은 html+done."""

import re
import time

from flask import Blueprint, request, jsonify, Response

from app.model import llama_chat_stream
from app.design_system import DesignSystem
from app.generation import build_generation_prompt, Mode
from app.mode import classify_mode
from app.sse import sse_event, EventType
from app.thinking import filter_thinking_stream
from app.utils import (sanitize_surrogates, ensure_complete_html,
                       strip_thinking, _remove_truncated_lines)

stream_bp = Blueprint("stream", __name__)

ASK_SYSTEM = ("당신은 홈페이지 제작을 도와주는 AI 컨설턴트입니다. 사용자의 질문에 "
              "친절하고 구체적으로 답하고, 필요하면 디자인/구성 의견을 제안하세요. "
              "HTML 코드는 생성하지 말고 한국어 텍스트로만 답하세요.")


def _extract_content_sections(raw):
    """AI 응답에서 body 콘텐츠 섹션만 추출 (===CONTENT_START/END=== 또는 body)."""
    if not raw:
        return ""
    si = raw.find("===CONTENT_START===")
    ei = raw.find("===CONTENT_END===", si + 1) if si != -1 else -1
    if si != -1 and ei != -1:
        content = raw[si + 18:ei].strip()
    elif si != -1:
        content = raw[si + 18:].strip()
    else:
        body_m = re.search(r'<body[^>]*>([\s\S]*)</body>', raw, re.IGNORECASE)
        content = body_m.group(1).strip() if body_m else raw.strip()
    content = strip_thinking(content)
    content = content.replace('```html', '').replace('```', '')
    content = re.sub(r'<head[^>]*>[\s\S]*?</head>', '', content, flags=re.IGNORECASE)
    content = re.sub(r'^\s*<(meta|link|title|style)[^>]*>[\s\S]*?(?:</\1>)?\s*', '',
                     content, flags=re.IGNORECASE | re.MULTILINE)
    if not re.search(r'<(section|div|header|main|article|footer|nav|p|h[1-6]|ul|ol|table|form|aside)\b',
                     content, re.IGNORECASE):
        return ""
    return content.strip()


def _extract_full_html(raw):
    """EDIT/DELETE 응답에서 ===HTML_START/END=== 또는 <!DOCTYPE> 전체 HTML 추출."""
    si = raw.find("===HTML_START===")
    ei = raw.find("===HTML_END===")
    if si != -1 and ei != -1:
        html = raw[si + 16:ei].strip()
    elif "<!DOCTYPE" in raw:
        html = raw[raw.find("<!DOCTYPE"):].strip()
        if "===HTML_END===" in html:
            html = html[:html.find("===HTML_END===")].strip()
    else:
        return ""
    html = strip_thinking(html)
    html = html.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return ensure_complete_html(html)


@stream_bp.route("/api/chat/stream/v2", methods=["POST"])
def chat_stream_v2():
    data = request.json or {}
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "메시지가 비어있습니다."}), 400

    has_html = bool(data.get("current_html"))
    has_element = bool(data.get("element_context"))
    override = data.get("mode")  # UI 드롭다운 수동 지정 (선택)

    if override in (m.value for m in Mode):
        mode = Mode(override)
    else:
        mode = classify_mode(message, has_html, has_element)

    ds_data = data.get("design_system")
    ds = DesignSystem.from_dict(ds_data) if ds_data else DesignSystem.create(
        template=data.get("template", ""), page_type=data.get("page_type", ""),
        design_content=data.get("design_content", ""))

    history = data.get("history", [])
    current_html = data.get("current_html", "")
    element_context = data.get("element_context") or None
    phase = mode.value

    if mode == Mode.ASK:
        def gen_ask():
            try:
                yield sse_event(EventType.STATUS, "상담 중...", phase=phase)
                messages = [{"role": "system", "content": ASK_SYSTEM}]
                messages.extend(history[-5:])
                messages.append({"role": "user", "content": message})
                for tok in llama_chat_stream(messages):
                    tok = filter_thinking_stream(sanitize_surrogates(tok))
                    if tok:
                        yield sse_event(EventType.CHAT, tok, phase=phase)
                yield sse_event(EventType.DONE, {}, phase=phase)
            except Exception as e:
                yield sse_event(EventType.ERROR, str(e), phase=phase)
        return Response(gen_ask(), mimetype="text/event-stream")

    # GENERATE / EDIT / DELETE
    messages = build_generation_prompt(ds, mode, message, history=history,
                                       current_html=current_html or None,
                                       element_context=element_context)

    def gen_build():
        try:
            yield sse_event(EventType.STATUS, "생성 중..." if mode == Mode.GENERATE else "수정 중...",
                            phase=phase)
            full = ""
            for tok in llama_chat_stream(messages):
                tok = sanitize_surrogates(tok)
                full += tok
                yield sse_event(EventType.STATUS, tok, phase=phase)  # 모달 토큰 진행

            if mode == Mode.GENERATE:
                content = _remove_truncated_lines(_extract_content_sections(full))
                if not content.strip():
                    content = ('<section class="hero"><div class="container">'
                               '<div class="hero-content"><h1 class="hero-title">'
                               f'{message[:50]}</h1></div></div></section>')
                html = ds.build_frame(title=message[:50] or "Page").replace("{CONTENT}", content)
                html = ensure_complete_html(html)
            else:  # EDIT / DELETE
                html = _extract_full_html(full)
                if not html:
                    # 추출 실패 → 기존 HTML 보존, 에러 통지 (채팅창에 덤프하지 않음)
                    yield sse_event(EventType.ERROR, "수정 결과를 해석하지 못했습니다. 다시 시도해 주세요.",
                                    phase=phase)
                    yield sse_event(EventType.DONE, {"html": current_html}, phase=phase)
                    return

            yield sse_event(EventType.HTML, html, phase=phase)
            yield sse_event(EventType.DONE, {"html": html}, phase=phase)
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield sse_event(EventType.ERROR, str(e), phase=phase)

    return Response(gen_build(), mimetype="text/event-stream")
```

- [ ] **Step 4: 블루프린트 등록**

`app/__init__.py`의 블루프린트 등록부(`:53-56`)를 확인하고 추가. 먼저 현재 코드를 읽을 것:

Run: `python -c "print(open('app/__init__.py',encoding='utf-8').read())"`

기존 `app.register_blueprint(...)` 줄들 옆에 추가:
```python
    from app.routes.stream_routes import stream_bp
    app.register_blueprint(stream_bp)
```

- [ ] **Step 5: 통과 확인**

Run: `python -m pytest tests/test_stream_v2.py -q`
Expected: PASS (1 passed)

- [ ] **Step 6: 전체 테스트**

Run: `python -m pytest tests/ -q`
Expected: PASS (전체)

- [ ] **Step 7: Commit**

```bash
git add app/routes/stream_routes.py app/__init__.py tests/test_stream_v2.py
git commit -m "feat: unified /api/chat/stream/v2 with mode routing"
```

### Task 3.3: 멀티페이지를 동일 DesignSystem으로 생성

멀티페이지 각 페이지를 같은 `ds.build_frame()` + AI 콘텐츠로 조립 → 전 페이지 head/nav/footer/색 100% 동일. 기본 메뉴/페이지 구조는 기존 `_default_multi_page_plan`(`main.py:206-225`)을 모듈로 이전.

**Files:**
- Create: `app/multipage.py` (plan 함수 이전 + DesignSystem 기반 생성)
- Test: `tests/test_multipage.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_multipage.py`:
```python
from app.multipage import default_plan, generate_pages
from app.design_system import DesignSystem


def test_default_plan_company():
    menu, pages = default_plan("company")
    assert "홈" in menu
    assert any(p["file"] == "index.html" for p in pages)


def test_generate_pages_share_same_frame(monkeypatch):
    import app.multipage as mp
    # 콘텐츠 생성을 고정 더미로
    monkeypatch.setattr(mp, "_stream_content",
                        lambda ds, page, msg, hist: '<section class="hero"><h1>X</h1></section>')
    ds = DesignSystem.create(template="minimal_clean", page_type="company",
                             design_content="", brand="ACME",
                             menu_items=["홈", "소개"])
    menu, pages = default_plan("company")
    ds.menu_items = menu
    results = list(generate_pages(ds, pages, "회사 소개", []))
    htmls = [r["html"] for r in results]
    # 모든 페이지가 동일 nav(브랜드/메뉴)·동일 scaffold CSS 포함
    for h in htmls:
        assert "ACME" in h
        assert ds.scaffold_css[:40] in h
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_multipage.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.multipage'`

- [ ] **Step 3: 구현**

`app/multipage.py`:
```python
"""멀티페이지 생성. 모든 페이지가 동일 DesignSystem으로 골격을 공유한다."""

import re

from app.model import llama_chat_stream
from app.generation import build_generation_prompt, Mode
from app.utils import sanitize_surrogates, ensure_complete_html, _remove_truncated_lines


def default_plan(page_type):
    """용도별 결정적 기본 메뉴/페이지 구조. (main.py:206-225에서 이전)"""
    base = {"menu_items": ["홈"],
            "pages": [{"name": "index", "file": "index.html", "title": "홈", "sections": ["hero"]}]}
    if page_type == "company":
        base = {"menu_items": ["홈", "소개", "서비스", "연락처"], "pages": [
            {"name": "index", "file": "index.html", "title": "홈", "sections": ["hero", "about", "services", "contact"]},
            {"name": "about", "file": "pages/about.html", "title": "소개", "sections": ["hero", "intro", "team"]},
            {"name": "services", "file": "pages/services.html", "title": "서비스", "sections": ["hero", "service_cards"]},
            {"name": "contact", "file": "pages/contact.html", "title": "연락처", "sections": ["hero", "form"]}]}
    elif page_type == "landing":
        base = {"menu_items": ["홈", "기능", "후기", "문의"], "pages": [
            {"name": "index", "file": "index.html", "title": "홈", "sections": ["hero", "features", "testimonials", "cta"]},
            {"name": "features", "file": "pages/features.html", "title": "기능", "sections": ["hero", "features"]},
            {"name": "testimonials", "file": "pages/testimonials.html", "title": "후기", "sections": ["hero", "testimonials"]},
            {"name": "contact", "file": "pages/contact.html", "title": "문의", "sections": ["hero", "form"]}]}
    elif page_type == "promotion":
        base = {"menu_items": ["홈", "혜택", "CTA"], "pages": [
            {"name": "index", "file": "index.html", "title": "홈", "sections": ["hero", "offer", "features"]},
            {"name": "offer", "file": "pages/offer.html", "title": "혜택", "sections": ["hero", "offer"]},
            {"name": "cta", "file": "pages/cta.html", "title": "CTA", "sections": ["hero", "cta"]}]}
    return base["menu_items"], base["pages"]


def _stream_content(ds, page, user_message, history):
    """한 페이지의 body 콘텐츠를 AI로 생성 (섹션만)."""
    page_msg = (f"{user_message}\n\n## 이 페이지: {page['title']} ({page['file']})\n"
                f"## 포함 섹션: {', '.join(page.get('sections', []))}")
    messages = build_generation_prompt(ds, Mode.GENERATE, page_msg, history=history,
                                       current_html=None, element_context=None)
    full = ""
    for tok in llama_chat_stream(messages):
        full += sanitize_surrogates(tok)
    from app.routes.stream_routes import _extract_content_sections
    return _remove_truncated_lines(_extract_content_sections(full))


def generate_pages(ds, pages, user_message, history):
    """각 페이지를 동일 ds.build_frame으로 조립. 제너레이터로 페이지별 결과 yield."""
    for page in pages:
        content = _stream_content(ds, page, user_message, history)
        if not content.strip():
            content = f'<section class="hero"><div class="container"><h1 class="hero-title">{page["title"]}</h1></div></section>'
        frame = ds.build_frame(title=page["title"], current_file=page["file"])
        html = ensure_complete_html(frame.replace("{CONTENT}", content))
        yield {"file": page["file"], "title": page["title"], "html": html}
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_multipage.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: stream_routes에 멀티페이지 분기 추가**

`app/routes/stream_routes.py`의 `chat_stream_v2`에서, `mode == Mode.GENERATE`이고 `data.get("multi_page")`가 True면 멀티페이지 경로로. `gen_build` 정의 전에 분기 추가:
```python
    if mode == Mode.GENERATE and data.get("multi_page"):
        from app.multipage import default_plan, generate_pages
        menu, pages = default_plan(ds.page_type)
        ds.menu_items = menu

        def gen_multi():
            try:
                yield sse_event(EventType.STATUS,
                                {"menu_items": menu, "pages": [p["file"] for p in pages]},
                                phase="generate")
                for result in generate_pages(ds, pages, message, history):
                    yield sse_event(EventType.STATUS, f"{result['title']} 완료", phase="generate")
                    yield sse_event(EventType.HTML,
                                    {"file": result["file"], "html": result["html"]},
                                    phase="generate")
                yield sse_event(EventType.DONE, {"multi": True, "menu_items": menu},
                                phase="generate")
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield sse_event(EventType.ERROR, str(e), phase="generate")
        return Response(gen_multi(), mimetype="text/event-stream")
```

참고: 멀티페이지에서 `html` payload는 `{"file","html"}` 객체, 단일페이지는 문자열. 클라는 payload 타입으로 구분(Task 4.3).

- [ ] **Step 6: 통과 확인**

Run: `python -m pytest tests/ -q`
Expected: PASS (전체)

- [ ] **Step 7: Commit**

```bash
git add app/multipage.py app/routes/stream_routes.py tests/test_multipage.py
git commit -m "feat: multi-page generation sharing one DesignSystem"
```

---

## Phase 4 — 클라이언트: 단일 파서 + 모드 UI + 미리보기 견고화

`static/js/main.js`(2236줄)를 통일 프로토콜에 맞춘다. **실행자는 편집 전 반드시 해당 함수의 현재 코드를 Read 할 것.**

### Task 4.1: 단일 SSE 파서 + type 라우팅

**Files:**
- Modify: `static/js/main.js` (`createSSEReader` ~`:719`, 신규 `consumeStreamV2`)

- [ ] **Step 1: 현재 SSE 리더 읽기**

Run: `python -c "import re;s=open('static/js/main.js',encoding='utf-8').read();i=s.find('function createSSEReader');print(s[i:i+1400])"`

목적: 기존 `createSSEReader`의 시그니처/사용처 파악.

- [ ] **Step 2: 통일 스트림 소비 함수 추가**

`main.js`에서 `createSSEReader` 정의 근처에 신규 함수 추가. 이 함수가 `/api/chat/stream/v2`의 단일 진실 파서다:
```javascript
// 통일 SSE 소비기. {phase,type,payload} 이벤트를 type별 콜백으로 라우팅한다.
// 콘텐츠 추측·fall-through 덤프 없음 — 서버가 명시한 type만 신뢰.
async function consumeStreamV2(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") { handlers.done && handlers.done({}); continue; }
      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }
      const { type, payload, phase } = evt;
      if (type === "status")      handlers.status && handlers.status(payload, phase);
      else if (type === "reasoning") { /* 숨김 */ }
      else if (type === "chat")   handlers.chat && handlers.chat(payload, phase);
      else if (type === "html")   handlers.html && handlers.html(payload, phase);
      else if (type === "done")   handlers.done && handlers.done(payload, phase);
      else if (type === "error")  handlers.error && handlers.error(payload, phase);
    }
  }
}
```

- [ ] **Step 3: 수동 검증 표식**

이 단계는 단위 테스트 불가(브라우저 의존). Task 4.4 통합 검증에서 실제 동작 확인.

- [ ] **Step 4: Commit**

```bash
git add static/js/main.js
git commit -m "feat: single consumeStreamV2 parser, type-routed"
```

### Task 4.2: 모드 UI (자동추천 + 드롭다운 덮어쓰기)

**Files:**
- Modify: `templates/index.html` (입력 영역 근처에 모드 셀렉터)
- Modify: `static/js/main.js` (모드 상태 + 요청에 포함)
- Modify: `static/css/style.css` (셀렉터 스타일)

- [ ] **Step 1: 입력창 근처 현재 마크업 읽기**

Run: `python -c "s=open('templates/index.html',encoding='utf-8').read();i=s.find('chat-input');print(s[i-400:i+400])"`

- [ ] **Step 2: 모드 셀렉터 추가**

채팅 입력 영역(전송 버튼 근처)에 추가. 정확한 위치는 Step 1 출력 기준으로 삽입:
```html
<select id="mode-select" class="mode-select" title="작업 모드">
  <option value="auto">자동 감지</option>
  <option value="ask">상담/질문</option>
  <option value="generate">생성</option>
  <option value="edit">수정</option>
  <option value="delete">삭제</option>
</select>
```

- [ ] **Step 3: 셀렉터 스타일**

`static/css/style.css` 끝에 추가:
```css
.mode-select {
  background: var(--surface, #1a1a1a);
  color: var(--text, #e8e8e8);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
}
```

- [ ] **Step 4: 요청에 모드 포함**

`main.js`의 메인 전송 함수에서 v2 요청 본문에 추가 (Task 4.3에서 본문 작성). 셀렉터 값 읽기:
```javascript
function getSelectedMode() {
  const el = document.getElementById("mode-select");
  const v = el ? el.value : "auto";
  return v === "auto" ? undefined : v;  // auto면 서버 자동 분류
}
```

- [ ] **Step 5: 수동 검증 표식**

UI 표시·드롭다운 동작은 Task 4.4에서 확인.

- [ ] **Step 6: Commit**

```bash
git add templates/index.html static/js/main.js static/css/style.css
git commit -m "feat: mode selector UI (auto + manual override)"
```

### Task 4.3: 전송 경로를 v2로 통일 + 미리보기 견고화

기존 분기(`sendMessageDirect` ~`:820`, modular 핸들러, edit 수기파서 ~`:1358`)를 단일 `sendMessageV2`로 대체. `updatePreview`(~`:585`)의 "10자 미만 조용한 리턴" 제거.

**Files:**
- Modify: `static/js/main.js`

- [ ] **Step 1: 현재 전송/미리보기 함수 읽기**

Run: `python -c "s=open('static/js/main.js',encoding='utf-8').read();i=s.find('function updatePreview');print(s[i:i+900])"`
Run: `python -c "s=open('static/js/main.js',encoding='utf-8').read();i=s.find('function sendMessage');print(s[i:i+200])"`

목적: `updatePreview` 시그니처, 미리보기 갱신 호출 규약, 전송 함수 진입점 파악.

- [ ] **Step 2: updatePreview의 silent-return 제거**

`updatePreview` 내부의 다음 패턴을 찾는다(대략 `:589`):
```javascript
if (processed.length < 10) return;
```
이를 교체:
```javascript
if (!processed || processed.length < 10) {
  showPreviewError("미리보기 내용이 비어 있습니다.");
  return;
}
```
그리고 `showPreviewError` 헬퍼를 `updatePreview` 위에 추가(이미 있으면 생략):
```javascript
function showPreviewError(msg) {
  const frame = document.getElementById("preview-frame");
  if (!frame) return;
  frame.srcdoc = `<body style="font-family:system-ui;padding:24px;color:#c33">
    <h3>⚠️ 미리보기 오류</h3><p>${msg}</p></body>`;
}
```

- [ ] **Step 3: 통일 전송 함수 추가**

`main.js`에 신규 `sendMessageV2` 추가. 단일/멀티 모두 처리:
```javascript
// 통일 전송. /api/chat/stream/v2 호출 후 consumeStreamV2로 type별 라우팅.
// html→미리보기, chat→채팅창, status→모달. 추측·덤프 없음.
async function sendMessageV2(message) {
  const assistantDiv = appendChatMessage("assistant", "");  // 빈 말풍선 준비
  let chatText = "";
  let finalHtml = "";
  const multiPages = {};

  try {
    const resp = await fetch("/api/chat/stream/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mode: getSelectedMode(),
        design_system: state.designSystem || null,
        history: state.chatHistory.slice(-5),
        current_html: state.generatedHtml || "",
        element_context: state.selectedElement || null,
        multi_page: state.multiPage || false,
        page_type: state.pageType,
        template: state.selectedTemplate,
      }),
    });

    await consumeStreamV2(resp, {
      status: (p) => { showModalProgress(p); },
      chat: (p) => { chatText += p; assistantDiv.innerHTML = formatContent(chatText); scrollChat(); },
      html: (p) => {
        if (typeof p === "string") { finalHtml = p; updatePreview(p, false); }
        else if (p && p.file) {                 // 멀티페이지 조각
          multiPages[p.file] = p.html;
          if (p.file === "index.html") { finalHtml = p.html; updatePreview(p.html, false); }
        }
      },
      done: (p) => {
        if (p && p.html) { finalHtml = p.html; updatePreview(p.html, false); }
        hideModalProgress();
      },
      error: (p) => {
        hideModalProgress();
        appendChatMessage("assistant", "⚠️ " + p);
      },
    });

    // 상태 반영 + 저장 (생성/수정일 때만)
    if (finalHtml) {
      state.generatedHtml = finalHtml;
      if (Object.keys(multiPages).length) state.multiPageFiles = multiPages;
      pushHistory("user", message);
      pushHistory("assistant", chatText || "(생성됨)");
      await saveProject();
    } else if (chatText) {
      pushHistory("user", message);
      pushHistory("assistant", chatText);
    }
  } catch (e) {
    hideModalProgress();
    appendChatMessage("assistant", "⚠️ 통신 오류: " + e.message);
  } finally {
    state.selectedElement = null;  // 편집 후 선택 해제
  }
}
```

참고: `showModalProgress`/`hideModalProgress`/`appendChatMessage`/`formatContent`/`scrollChat`/`pushHistory`/`saveProject`는 기존 함수. Step 1 탐색에서 실제 이름 확인 후 매핑(이름이 다르면 맞출 것). 없으면 기존 동등 함수로 치환.

- [ ] **Step 4: 메인 전송 핸들러를 sendMessageV2로 교체**

기존 전송 진입점(전송 버튼 click / Enter 핸들러)이 호출하는 함수를 `sendMessageV2(message)`로 바꾼다. 기존 `decideStrategy` fetch → 분기 호출 체인을 제거(서버가 모드 분류).

- [ ] **Step 5: DesignSystem 클라 상태 연결**

`selectTemplate`(~`:431`)과 `generateDesignFromUrl`(~`:445`), `loadProject`(~`:1873`)에서 `state.designSystem`을 세팅. 템플릿 선택 시:
```javascript
state.designSystem = {
  template: state.selectedTemplate,
  page_type: state.pageType,
  design_content: state.selectedDesignContent || "",
  scaffold_css: "",     // 서버가 create로 채움; 저장본엔 채워짐
  brand: state.projectTitle || "WebGen AI",
  menu_items: [],
};
```
프로젝트 로드 시 `state.designSystem = project.design_system || null`.

참고: 클라가 보내는 design_system에 scaffold_css가 비어도, 서버 `DesignSystem.from_dict`가 받지만 비면 곤란. 안전을 위해 Step 6에서 서버가 보정한다.

- [ ] **Step 6: 서버 보정 — 빈 scaffold_css 방어**

`app/routes/stream_routes.py`의 `ds = DesignSystem.from_dict(...)` 직후 추가:
```python
    if not ds.scaffold_css or not ds.scaffold_css.strip():
        ds = DesignSystem.create(template=ds.template, page_type=ds.page_type,
                                 design_content=ds.design_content, brand=ds.brand,
                                 menu_items=ds.menu_items)
```

- [ ] **Step 7: 통과 확인 (서버 단위)**

Run: `python -m pytest tests/ -q`
Expected: PASS (전체)

- [ ] **Step 8: Commit**

```bash
git add static/js/main.js app/routes/stream_routes.py
git commit -m "feat: unified sendMessageV2 path + robust updatePreview"
```

### Task 4.4: dev 모드 요소 선택 → data-wgen-id 타겟팅

미리보기 주입 스크립트가 클릭된 요소에 안정적 `data-wgen-id`를 부여하고, 그 id를 element_context로 보낸다. 서버 EDIT 프롬프트가 id로 대상 타겟팅(Task 2.1에서 이미 지원).

**Files:**
- Modify: `static/js/main.js` (`buildInteractionScript` ~`:572`, 메시지 핸들러 ~`:1721`)

- [ ] **Step 1: 현재 주입 스크립트 읽기**

Run: `python -c "s=open('static/js/main.js',encoding='utf-8').read();i=s.find('buildInteractionScript');print(s[i:i+1200])"`

- [ ] **Step 2: 주입 스크립트에 id 부여 로직 추가**

`buildInteractionScript`가 만드는 클릭 핸들러에서, 선택 시 요소에 id 부여 후 전송하도록 수정. 클릭 핸들러 본문에 추가:
```javascript
// 안정적 식별자 부여 (없으면 생성)
if (!el.hasAttribute('data-wgen-id')) {
  el.setAttribute('data-wgen-id', 'w' + Math.random().toString(36).slice(2, 8));
}
var wid = el.getAttribute('data-wgen-id');
parent.postMessage({ type: 'element-selected', wgen_id: wid, tag: el.tagName.toLowerCase(),
  id: el.id, classes: el.className, text: (el.innerText||'').slice(0,200),
  html: el.outerHTML.slice(0,500) }, '*');
```

참고: 주입 스크립트가 부여한 `data-wgen-id`가 저장 HTML에 남도록, 미리보기 iframe의 현재 DOM이 아니라 `state.generatedHtml`에도 반영돼야 한다. 단순화를 위해: 선택 시 부모로 보낸 `wgen_id`를 서버에 넘기고, 서버는 `current_html`(state.generatedHtml)에서 해당 id가 없으면 element_context의 tag/text로 보조 매칭. EDIT 프롬프트는 둘 다 활용(이미 tag/text 포함).

- [ ] **Step 3: 부모 메시지 핸들러에서 wgen_id 저장**

메시지 핸들러(~`:1721`)의 `state.selectedElement = d;`가 `wgen_id`를 포함하도록 확인(payload 그대로 저장하면 됨). 변경 없을 수 있음 — 확인만.

- [ ] **Step 4: 수동 검증 표식**

Task 4.5 통합 검증에서 dev 모드 요소 수정 확인.

- [ ] **Step 5: Commit**

```bash
git add static/js/main.js
git commit -m "feat: dev-mode element selection uses data-wgen-id targeting"
```

### Task 4.5: 통합 수동 검증

**Files:** 없음 (실행 검증)

- [ ] **Step 1: 앱 실행**

Run: `python app.py`
Expected: `Running on http://...:5080` (모델 없으면 다운로드 UI; 검증용으로 Gemini 백엔드 권장: `LLM_BACKEND=gemini GEMINI_API_KEY=... python app.py`)

- [ ] **Step 2: 단일 생성 검증**

브라우저에서 Step1~3 진행 → "카페 홈페이지 만들어줘" 생성. 확인:
- 모달에 진행상황 표시.
- 완성 후 미리보기에 화면 정상 표시(채팅창에 HTML 덤프 없음).

- [ ] **Step 3: 디자인 일관성 검증**

같은 프로젝트에서 연속 수정 3회("배경 톤 바꿔", "버튼 키워", "푸터 문구 수정"). 확인:
- 색/폰트/레이아웃이 매 수정마다 유지됨(오락가락 없음).

- [ ] **Step 4: 멀티페이지 통일성 검증**

멀티페이지로 회사 사이트 생성. 메뉴 네비로 각 페이지 이동. 확인:
- 전 페이지 head/nav/footer/색 동일.

- [ ] **Step 5: ASK 모드 검증**

"이 색 조합 어떻게 생각해?" 입력. 확인:
- 응답이 채팅창에만 표시, 미리보기 화면 불변.

- [ ] **Step 6: 세션 드롭 검증**

프로젝트 저장 → 목록에서 재로드 → 수정 요청. 확인:
- 디자인 유지(로드 후에도 통일성 유지).

- [ ] **Step 7: dev 모드 요소 수정 검증**

dev 토글 ON → 페이지 하단(char 3000 이후) 요소 클릭 → "이 텍스트 바꿔". 확인:
- 정확히 그 요소만 수정, 나머지 보존.

- [ ] **Step 8: 검증 결과 기록 + Commit**

검증 통과 항목을 커밋 메시지에 요약:
```bash
git commit --allow-empty -m "test: manual verification of redesign (single/multi/ask/edit/session)"
```

---

## Phase A — Ollama 외부 API 백엔드 (독립 — 먼저 해도 됨)

기존 `app/backends/` ABC 패턴(`base.py:5` `ModelBackend`)에 Ollama HTTP 백엔드 추가. `LLM_BACKEND=ollama`로 전환. stdlib `urllib`만 사용(신규 의존성 0). Ollama `/api/chat` NDJSON 스트리밍, reasoning은 `message.thinking` 필드로 매핑.

### Task A.1: config에 Ollama 설정 추가

**Files:**
- Modify: `app/config.py:16-17` (Gemini 설정 아래)

- [ ] **Step 1: 설정 추가**

`app/config.py`의 `GEMINI_MODEL = ...` 줄(`:17`) 다음에 추가:
```python

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5-coder:7b")
```

- [ ] **Step 2: 확인**

Run: `python -c "from app.config import OLLAMA_HOST, OLLAMA_MODEL; print(OLLAMA_HOST, OLLAMA_MODEL)"`
Expected: `http://localhost:11434 qwen2.5-coder:7b`

- [ ] **Step 3: Commit**

```bash
git add app/config.py
git commit -m "feat: add Ollama config (host, model)"
```

### Task A.2: OllamaBackend 구현

**Files:**
- Create: `app/backends/ollama.py`
- Test: `tests/test_ollama_backend.py`

- [ ] **Step 1: 실패 테스트 작성 (HTTP를 가짜로 대체)**

`tests/test_ollama_backend.py`:
```python
import io
import json

import app.backends.ollama as ob


class _FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _ndjson(lines):
    return _FakeResp(("\n".join(json.dumps(x) for x in lines)).encode("utf-8"))


def test_chat_concatenates_message_content(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _ndjson([
            {"message": {"content": "안녕"}, "done": False},
            {"message": {"content": "하세요"}, "done": True},
        ])

    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    out = backend.chat([{"role": "user", "content": "hi"}])
    assert out == "안녕하세요"
    assert captured["url"].endswith("/api/chat")
    assert captured["body"]["stream"] is True


def test_chat_stream_yields_tokens(monkeypatch):
    def fake_urlopen(req, timeout=None):
        return _ndjson([
            {"message": {"content": "A"}, "done": False},
            {"message": {"content": "B"}, "done": True},
        ])
    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    assert list(backend.chat_stream([{"role": "user", "content": "x"}])) == ["A", "B"]


def test_reasoning_maps_thinking_field(monkeypatch):
    def fake_urlopen(req, timeout=None):
        return _ndjson([
            {"message": {"thinking": "생각", "content": ""}, "done": False},
            {"message": {"content": "답"}, "done": True},
        ])
    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    events = list(backend.chat_stream_with_reasoning([{"role": "user", "content": "x"}]))
    assert {"type": "reasoning", "text": "생각"} in events
    assert {"type": "content", "text": "답"} in events
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_ollama_backend.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.backends.ollama'`

- [ ] **Step 3: 구현**

`app/backends/ollama.py`:
```python
"""외부 Ollama HTTP API 백엔드. stdlib urllib만 사용(신규 의존성 없음).

Ollama /api/chat 는 NDJSON 스트림을 반환한다. 각 줄:
  {"message": {"role":"assistant", "content":"...", "thinking":"..."}, "done": bool}
reasoning 모델은 message.thinking 으로 사고 과정을 분리해 준다."""

import json
import urllib.request

from app.backends.base import ModelBackend
from app.config import OLLAMA_HOST, OLLAMA_MODEL, CHAT_SAMPLING


class OllamaBackend(ModelBackend):
    def __init__(self):
        self._host = OLLAMA_HOST.rstrip("/")
        self._model = OLLAMA_MODEL

    def _request(self, messages, think=False):
        body = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "think": think,
            "options": {
                "temperature": CHAT_SAMPLING.get("temperature", 0.6),
                "top_p": CHAT_SAMPLING.get("top_p", 0.95),
                "top_k": CHAT_SAMPLING.get("top_k", 20),
                "num_predict": CHAT_SAMPLING.get("max_tokens", 8192),
            },
        }
        req = urllib.request.Request(
            f"{self._host}/api/chat",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return urllib.request.urlopen(req, timeout=600)

    def _iter_lines(self, resp):
        with resp:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    def chat(self, messages):
        out = []
        for obj in self._iter_lines(self._request(messages)):
            out.append(obj.get("message", {}).get("content", "") or "")
        return "".join(out)

    def chat_stream(self, messages):
        for obj in self._iter_lines(self._request(messages)):
            content = obj.get("message", {}).get("content", "") or ""
            if content:
                yield content

    def chat_stream_with_reasoning(self, messages):
        for obj in self._iter_lines(self._request(messages, think=True)):
            msg = obj.get("message", {})
            thinking = msg.get("thinking") or ""
            if thinking:
                yield {"type": "reasoning", "text": thinking}
            content = msg.get("content", "") or ""
            if content:
                yield {"type": "content", "text": content}
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_ollama_backend.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add app/backends/ollama.py tests/test_ollama_backend.py
git commit -m "feat: add Ollama HTTP backend (urllib, NDJSON streaming)"
```

### Task A.3: 백엔드 셀렉터에 ollama 등록

**Files:**
- Modify: `app/backends/__init__.py:19-33`

- [ ] **Step 1: get_backend에 ollama 분기 추가**

`app/backends/__init__.py`의 `if LLM_BACKEND == "gemini":` 블록(`:19`) 앞에 추가:
```python
        if LLM_BACKEND == "ollama":
            from app.backends.ollama import OllamaBackend
            _backend = OllamaBackend()
            from app.config import OLLAMA_HOST, OLLAMA_MODEL
            print(f"  [Backend] Ollama ({OLLAMA_MODEL} @ {OLLAMA_HOST})")
            return _backend
```

- [ ] **Step 2: 확인 (분기 선택)**

Run: `LLM_BACKEND=ollama python -c "from app.backends import get_backend; print(type(get_backend()).__name__)"`
Expected: `OllamaBackend` (Ollama 서버 미실행이어도 객체 생성은 성공)

- [ ] **Step 3: 전체 테스트**

Run: `python -m pytest tests/ -q`
Expected: PASS (전체)

- [ ] **Step 4: Commit**

```bash
git add app/backends/__init__.py
git commit -m "feat: register ollama in backend selector"
```

### Task A.4: 문서 + 환경변수 반영

**Files:**
- Modify: `AGENTS.md` (환경 변수 표 + 백엔드 설명)

- [ ] **Step 1: AGENTS.md 환경변수 표에 추가**

`AGENTS.md`의 환경 변수 표(`| \`LLM_BACKEND\` |` 행)에서 `LLM_BACKEND` 설명을 `local/gemini/ollama`로 갱신하고, 표에 행 추가:
```
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 서버 주소 (`LLM_BACKEND=ollama`) |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Ollama 모델명 |
```

- [ ] **Step 2: 실행 예시 추가**

`AGENTS.md` 실행 방법 섹션에 추가:
```bash
# Ollama 외부 백엔드 사용
LLM_BACKEND=ollama OLLAMA_MODEL=qwen2.5-coder:7b python app.py
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document Ollama backend env vars"
```

---

## Phase 5 — 레거시 정리

신 경로 검증 후 구 경로/사용 안 하는 코드 제거.

### Task 5.1: 구 스트림 경로 제거

**Files:**
- Modify: `app/routes/main.py` (구 `/api/chat/stream`, `/api/chat/stream/modular` 제거 또는 v2 위임)
- Modify: `static/js/main.js` (구 `sendMessageDirect`, 수기 edit 파서, modular 핸들러 제거)
- Modify: `app/prompts.py` (사용 안 하는 `MULTI_PAGE_SUB_PAGE_PROMPT` 등 정리)

- [ ] **Step 1: 사용처 확인**

Run: `python -c "s=open('static/js/main.js',encoding='utf-8').read();print('stream/modular' in s, 'sendMessageDirect' in s)"`
Grep으로 구 함수 참조 0 확인 후에만 삭제.

- [ ] **Step 2: 구 경로 제거**

`main.py`의 `chat_stream`(`:46`), `chat_stream_modular`(`:163`) 함수 삭제. import 정리.
`main.js`의 `sendMessageDirect`, 수기 edit 파서(`:1358` 영역), modular 완료 핸들러 삭제.

- [ ] **Step 3: 전체 테스트 + 앱 기동 확인**

Run: `python -m pytest tests/ -q && python -c "import app; app.create_app(); print('app ok')"`
Expected: PASS + `app ok`

- [ ] **Step 4: 회귀 수동 검증**

Task 4.5 Step 2~7 재실행으로 회귀 없음 확인.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy stream paths and dead prompts"
```

---

## Self-Review 결과 (작성자 체크)

- **스펙 커버리지:** DesignSystem(§1)=Phase1, 단일 빌더(§2)=Phase2, 모드분리(§3)=Task2.2/3.2, SSE통일(§4)=Phase3+4.1, 조립견고화(§5)=Task3.2/4.3, 편집정확도(§6)=Task2.1(전체HTML)+4.4(id타겟). 검증기준 6항=Task4.5. 전 항목 매핑됨.
- **플레이스홀더:** 신규 백엔드 모듈은 완전한 코드. JS 태스크는 2236줄 기존 파일 의존이라 "현재 코드 Read 후 편집" 단계를 명시(추측 금지). 함수명 매핑은 탐색 Step에서 확정.
- **타입 일관성:** `DesignSystem`/`Mode`/`EventType`/`build_generation_prompt`/`build_frame`/`sse_event`/`consumeStreamV2` 명칭이 전 태스크에서 동일.
- **알려진 리스크:** (1) 기존 JS 함수명(`appendChatMessage` 등)이 실제와 다를 수 있음 → 각 JS 태스크 첫 Step에서 Read로 확정. (2) custom 토큰 추출은 간소화(스캐폴드 폴백). 추후 URL 디자인 토큰 구조화는 범위 밖.
