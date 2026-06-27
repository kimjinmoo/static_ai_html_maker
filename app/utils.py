import re


def strip_thinking(text):
    if not text:
        return text
    # Remove all think/reasoning tags and their content
    text = re.sub(r'<think[^>]*>[\s\S]*?</think>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<thinking[^>]*>[\s\S]*?</thinking>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<reasoning[^>]*>[\s\S]*?</reasoning>', '', text, flags=re.IGNORECASE)
    # Remove unclosed think/reasoning tags and everything after
    for tag in ['<think', '<thinking', '<reasoning', '</think>', '</thinking>', '</reasoning>']:
        while True:
            idx = text.find(tag)
            if idx == -1:
                break
            # Find the next newline or end of text to remove just this tag line
            line_end = text.find('\n', idx)
            if line_end == -1:
                text = text[:idx]
            else:
                text = text[:idx] + text[line_end + 1:]
    for marker in ["Thinking Process:", "생각 과정:", "Reasoning:", "reasoning:"]:
        idx = text.find(marker)
        while idx != -1:
            line_end = text.find('\n', idx)
            if line_end == -1:
                text = text[:idx]
            else:
                text = text[:idx] + text[line_end + 1:]
            idx = text.find(marker)
    # Remove lines that look like AI self-reasoning (Korean/English meta-text about what to generate)
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that are clearly AI reasoning meta-text
        if re.match(r'^(사용자가|사용자는|저는|우리는|이|그|위|해당|다음|그리고|하지만|따라서|또한|그러나|hero|nav|head|footer|script)\s*(모듈|요청|내용|설명|섹션|코드|태그|스타일|를|이|가|은|는)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^(이전|앞선|앞의)\s*(모듈|섹션|코드|생성)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^(페이지|문맥|컨텍스트|컨텍|요청|내용)\s*(설명|에서|는|이|에는)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^(스캐폴드|클래스|스타일|색상|배경)\s*(사용|규칙|적용|를|은|에)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^[\d]+\.\s+(head|nav|hero|footer|script|content|about|features|testimonials|pricing|faq|cta|offer|contact)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^(head|nav|hero|footer|script|content|about|features|testimonials|pricing|faq|cta|offer|contact|guarantee)\s*(모듈|섹션|생성|:)', stripped, re.IGNORECASE):
            continue
        if re.match(r'^-{3,}$', stripped):
            continue
        if '===PLAN_START===' in stripped or '===PLAN_END===' in stripped:
            continue
        if stripped.startswith('===') and stripped.endswith('==='):
            continue
        cleaned.append(line)
    text = '\n'.join(cleaned)
    text = _collapse_repeated_lines(text)
    return text.strip()


def _collapse_repeated_lines(text):
    """동일한 줄이 3회 이상 반복되는 generation loop를 한 줄로 축소한다.
    AI 무한 루프/토큰 소진 버그 방어."""
    if not text:
        return text
    lines = text.split('\n')
    if len(lines) < 6:
        return text
    out = []
    run_line = None
    run_count = 0
    for ln in lines:
        if ln == run_line:
            run_count += 1
            if run_count == 2:
                out.append(ln)
            elif run_count > 2:
                continue  # 3회째부터는 버린다
        else:
            if run_count >= 3:
                out.append(f"<!-- {run_count} repeated lines collapsed -->")
            run_line = ln
            run_count = 1
            out.append(ln)
    if run_count >= 3:
        out.append(f"<!-- {run_count} repeated lines collapsed -->")
    return '\n'.join(out)


def _find_first_html_tag(text):
    """Find the first real HTML tag in text, ignoring thinking/reasoning content."""
    # Look for DOCTYPE or known HTML opening tags
    patterns = [
        r'<!DOCTYPE\s+html',
        r'<html[\s>]',
        r'<head[\s>]',
        r'<body[\s>]',
        r'<header[\s>]',
        r'<section[\s>]',
        r'<div[\s>]',
        r'<footer[\s>]',
        r'<nav[\s>]',
        r'<main[\s>]',
        r'<article[\s>]',
        r'<aside[\s>]',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.start()
    return -1


def _find_last_html_close(text):
    """Find the last meaningful HTML closing tag."""
    patterns = [
        r'</html\s*>',
        r'</body\s*>',
        r'</footer\s*>',
    ]
    best = -1
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            best = max(best, m.end())
    return best


def extract_module_html(module_content):
    if not module_content:
        return None

    # Strategy 1: Try to extract from ===MODULE_START=== ===MODULE_END=== markers
    ms = module_content.find("===MODULE_START===")
    me = module_content.find("===MODULE_END===")
    if ms != -1:
        start_offset = ms + 19
        raw = module_content[start_offset:]
        if me != -1 and me > ms:
            raw = raw[:me - start_offset].strip()
        raw = raw.strip()
        # Strip markdown code fences
        if raw.startswith("```"):
            lines = raw.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines).strip()
        if raw:
            mod_html = strip_thinking(raw)
            # Remove any text before the first HTML tag
            idx = _find_first_html_tag(mod_html)
            if idx > 0:
                mod_html = mod_html[idx:]
            return mod_html

    # Strategy 2: No markers - try to find first real HTML tag
    content = strip_thinking(module_content)
    first_tag = _find_first_html_tag(content)
    last_close = _find_last_html_close(content)

    if first_tag != -1:
        if last_close != -1 and last_close > first_tag:
            mod_html = content[first_tag:last_close]
        else:
            mod_html = content[first_tag:]
        mod_html = mod_html.strip()
        if mod_html:
            return mod_html

    # Strategy 3: HTML 태그가 전혀 없는 경우 → reasoning 텍스트이므로 None 반환.
    # 이전에는 순수 추론 텍스트를 그대로 반환해 footer 자리에 한글 설명이 들어가는
    # 치명적 버그가 있었다. None을 반환하면 _assemble_modules에서 폴백이 작동한다.
    return None


_SCAFFOLD_CACHE = {}


def load_scaffold_css(template_name):
    """템플릿 이름(minimal_clean/bold_modern/elegant_warm)에 해당하는
    CSS 스캐폴드를 읽어 반환한다. 없으면 빈 문자열."""
    import os
    if not template_name or template_name == "custom":
        return ""
    if template_name in _SCAFFOLD_CACHE:
        return _SCAFFOLD_CACHE[template_name]
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, "templates", "scaffolds", f"{template_name}.css")
    css = ""
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                css = f.read()
        except Exception as e:
            print(f"  [Scaffold] load failed for {template_name}: {e}")
    _SCAFFOLD_CACHE[template_name] = css
    return css


SCAFFOLD_CLASS_REFERENCE = """## 사용 가능한 스캐폴드 클래스 (재정의 금지, 그대로 사용)
### 레이아웃
- `.container` (max-width 래퍼), `.container.narrow`, `.container.wide`
- `.section` (위아래 패딩 80~120px), `.section-sm`, `.section-tinted`
- `.grid` + `.grid-2` / `.grid-3` / `.grid-4` (반응형 자동)
- `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-center`, `.gap-sm/md/lg`

### 타이포그래피
- `h1`/`.h1`, `h2`/`.h2`, `h3`/`.h3`, `h4`/`.h4`, `h5`/`.h5` (스타일 자동 적용)
- `.lead` (큰 본문), `.text-secondary`, `.text-center`
- `.section-label` (작은 대문자 라벨), `.section-title`, `.section-subtitle`
- `.section-header` (중앙 정렬 제목 블록), `.section-header.left`

### 버튼
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-cta`, `.btn-ghost`, `.btn-accent`(elegant만)
- 변형: `.btn-pill`, `.btn-block`, `.btn-lg`, `.btn-sm`

### 카드
- `.card`, `.card-tinted`, `.card-icon`, `.card-title`, `.card-text`, `.card-divider`(elegant만)

### 섹션 컴포넌트 (위 클래스와 조합)
- `.hero` + `.hero-content`, `.hero-title`, `.hero-subtitle`, `.hero-actions`, `.hero-image`
- `.nav` + `.nav-inner`, `.nav-logo`, `.nav-menu`, `.nav-link`(+`.active`), `.nav-toggle`
- `.footer` + `.footer-grid`, `.footer-brand`, `.footer-tagline`, `.footer-col-title`, `.footer-link`, `.footer-bottom`, `.footer-copy`, `.footer-social`
- `.stat` (통계), `.stat-number`, `.stat-label`
- `.testimonial` + `.testimonial-text`, `.testimonial-author`, `.testimonial-avatar`, `.testimonial-name`, `.testimonial-role`, `.stars`
- `.pricing-card`(+`.featured`) + `.pricing-label`, `.pricing-price`, `.pricing-period`, `.pricing-features`
- `.faq-item`(+JS `.open`) + `.faq-question`, `.faq-answer`, `.faq-icon`
- `.cta` + `.cta-title`, `.cta-subtitle`
- `.badge`, `.tag`
- `.form-group` + `.form-label`, `.form-input`, `.form-textarea`, `.form-select`

### 애니메이션
- `[data-animate]` 요소 → JS IntersectionObserver로 `.visible` 부착 시 fade-in/slide-up
- `.hidden` (display:none)

## ⚠️ 스캐폴드 규칙
- 위 클래스는 스캐폴드에 정의되어 있다. **재정의하지 말 것** (색/폰트/패딩 등).
- 페이지별 고유 스타일이 꼭 필요할 때만 새 클래스를 추가하고 최소한으로 작성.
- 인라인 `style=""` 금지. 항상 클래스 사용.
- 색상은 하드코딩하지 말고 `var(--color-...)` 사용.
- `* { margin:0; ... }`, `:root { ... }`, body 리셋 금지 (스캐폴드에 이미 있음).
"""


def find_model_file():
    from app.config import MODEL_PATH, DEFAULT_MODEL
    import os, sys

    if MODEL_PATH and os.path.exists(MODEL_PATH):
        return MODEL_PATH

    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(os.path.abspath(sys.executable))
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_dir = os.path.join(base_dir, "models")

    if os.path.exists(model_dir):
        gguf_files = [f for f in os.listdir(model_dir) if f.endswith('.gguf')]
        if gguf_files:
            if DEFAULT_MODEL in gguf_files:
                path = os.path.join(model_dir, DEFAULT_MODEL)
                print(f"  [Auto] \xeb\xaa\xa8\xeb\x8d\xb8 \xec\x9e\x90\xeb\x8f\x99 \xea\xb0\x90\xec\xa7\x80: {DEFAULT_MODEL}")
                return path
            gguf_files.sort(reverse=True)
            path = os.path.join(model_dir, gguf_files[0])
            print(f"  [Auto] \xeb\xaa\xa8\xeb\x8d\xb8 \xec\x9e\x90\xeb\x8f\x99 \xea\xb0\x90\xec\xa7\x80: {gguf_files[0]}")
            return path

    return None


def get_projects_dir():
    import os
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "projects")


def _remove_truncated_lines(html):
    """Remove lines from the end that appear to be truncated mid-tag."""
    lines = html.split('\n')
    # Work backwards from the end
    while lines:
        last = lines[-1].strip()
        if not last:
            lines.pop()
            continue
        # If the last line contains a '<' but no '>' at the end, it's truncated
        if '<' in last and not last.endswith('>'):
            lines.pop()
            continue
        # If it has no '<' at all (plain text), keep it
        break
    return '\n'.join(lines)


def strip_module_wrapper(html):
    """content 모듈에서 DOCTYPE/<html>/<head>/<body> 같은 전체 문서 래퍼를 제거하고
    본문(inner)만 남긴다. head 모듈은 그대로 둔다."""
    if not html:
        return html
    # <body>~</body> 내용이 있으면 추출
    m = re.search(r'<body[^>]*>([\s\S]*?)</body>', html, re.IGNORECASE)
    if m:
        html = m.group(1)
    # 여전히 head가 남아 있으면 head 블록 제거
    html = re.sub(r'<!DOCTYPE[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<html[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</html>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<head[\s>][\s\S]*?</head>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<head[^>]*/>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<body[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</body>', '', html, flags=re.IGNORECASE)
    return html.strip()


def merge_style_blocks(html):
    """HTML 내 여러 <style> 블록을 하나로 병합하고, 본문 밖의 설명 텍스트/마커도 정리한다."""
    if not html:
        return html
    styles = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html, flags=re.IGNORECASE)
    # 스캐폴드 주석(첫 style)이 있으면 보존 순서 유지: 합친다
    if styles:
        merged = "\n".join(s.strip() for s in styles)
        # 첫 <style>...</style>는 남기고 나머지는 제거
        first = re.search(r'<style[^>]*>[\s\S]*?</style>', html, flags=re.IGNORECASE)
        if first:
            placeholder = "\x00WGEN_STYLE\x00"
            html = html[:first.start()] + placeholder + html[first.end():]
            html = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', html, flags=re.IGNORECASE)
            html = html.replace(placeholder, f'<style>\n{merged}\n</style>')
    return html


def ensure_complete_html(html):
    """Validate and auto-fix incomplete HTML.

    Ensures essential structural tags (DOCTYPE, html, head, body) are present.
    Removes truncated content at end of file.
    Fixes missing closing tags.
    """
    if not html:
        return html

    html = html.strip()
    if not html:
        return html

    # --- Step 1: Strip interaction artifact classes from generated HTML ---
    html = re.sub(r'\bwgen-(?:selected|hover)\b', '', html)
    # Clean up empty class attributes
    html = re.sub(r'\s+class\s*=\s*["\']\s*["\']', '', html)

    # --- Step 2: Remove non-HTML text before first HTML tag ---
    first_tag = _find_first_html_tag(html)
    if first_tag > 0:
        html = html[first_tag:]

    # --- Step 3: Merge duplicate <style> blocks into one ---
    html = merge_style_blocks(html)

    # --- Step 4: Remove truncated lines at the end ---
    html = _remove_truncated_lines(html)

    # --- Step 5: Basic structural cleanup ---
    has_doctype = bool(re.search(r'<!DOCTYPE\s+html', html, re.IGNORECASE))
    has_html_open = bool(re.search(r'<html[\s>]', html, re.IGNORECASE))
    has_html_close = bool(re.search(r'</html\s*>', html, re.IGNORECASE))
    has_head_open = bool(re.search(r'<head[\s>]', html, re.IGNORECASE))
    has_head_close = bool(re.search(r'</head\s*>', html, re.IGNORECASE))
    has_body_open = bool(re.search(r'<body[\s>]', html, re.IGNORECASE))
    has_body_close = bool(re.search(r'</body\s*>', html, re.IGNORECASE))

    # Normalize DOCTYPE to lowercase form for consistency
    if has_doctype and '<!DOCTYPE html>' not in html:
        html = re.sub(r'<!DOCTYPE[^>]*>', '<!DOCTYPE html>', html, flags=re.IGNORECASE, count=1)
    elif not has_doctype:
        html = '<!DOCTYPE html>\n' + html

    # Ensure <html> after DOCTYPE
    if not has_html_open:
        html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<html lang="ko">', 1)

    # Ensure <head> block exists (even minimal)
    if not has_head_open:
        html = re.sub(r'(<html[^>]*>)', r'\1\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Page</title>\n</head>', html, count=1, flags=re.IGNORECASE)
    elif not has_head_close:
        # head open but no close — add </head>
        html = re.sub(r'(<head[^>]*>)', r'\1\n</head>', html, count=1, flags=re.IGNORECASE)

    # Ensure <body> after </head>
    if not has_body_open:
        if has_head_close:
            html = re.sub(r'(</head\s*>)', r'\1\n<body>', html, count=1, flags=re.IGNORECASE)
        else:
            html += '\n<body>'

    # Ensure </body>
    if not has_body_close:
        html += '\n</body>'

    # Ensure </html>
    if not has_html_close:
        html += '\n</html>'

    return html


def parse_multi_page_plan(plan_content):
    import re
    menu_items = []
    pages = []

    plan_content = strip_thinking(plan_content)
    plan_content = re.sub(r'^```[\w]*\s*\n?', '', plan_content, flags=re.MULTILINE)
    plan_content = re.sub(r'\n?```\s*$', '', plan_content, flags=re.MULTILINE)
    plan_content = plan_content.strip()

    plan_upper = plan_content.upper()
    plan_start = plan_upper.find("===PLAN_START===")
    plan_end = plan_upper.find("===PLAN_END===")

    if plan_start != -1:
        plan_text = plan_content[plan_start + 16:]
        if plan_end != -1 and plan_end > plan_start:
            plan_text = plan_text[:plan_end - plan_start - 16].strip()
    else:
        print(f"\n[ParsePlan] WARN: No PLAN_START markers, trying fallback parse on:\n{plan_content[:500]}\n")
        plan_text = plan_content

    current_page = None
    for line in plan_text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.upper().startswith("==="):
            continue

        m = re.match(r'menu_items:\s*\[(.*?)\]', stripped, re.IGNORECASE)
        if m:
            menu_items = [item.strip().strip('"\'') for item in m.group(1).split(",") if item.strip()]
            continue

        if re.match(r'^pages\s*:', stripped, re.IGNORECASE):
            continue

        m = re.match(r'^-\s*name:\s*(\S+)', stripped)
        if m:
            if current_page:
                pages.append(current_page)
            current_page = {"name": m.group(1), "file": "", "title": "", "sections": []}
            continue

        if current_page:
            m = re.match(r'^\s*file:\s*(\S+)', stripped)
            if m:
                current_page["file"] = m.group(1)
                continue

            m = re.match(r'^\s*title:\s*(.*)', stripped)
            if m:
                current_page["title"] = m.group(1).strip().strip('"\'')
                continue

            m = re.match(r'^\s*sections:\s*\[(.*?)\]', stripped, re.IGNORECASE)
            if m:
                current_page["sections"] = [s.strip().strip('"\'') for s in m.group(1).split(",") if s.strip()]
                continue

    if current_page:
        pages.append(current_page)

    for p in pages:
        if not p["file"]:
            if p["name"] == "index":
                p["file"] = "index.html"
            else:
                p["file"] = f"pages/{p['name']}.html"
        if not p["title"]:
            p["title"] = p["name"].capitalize()

    return menu_items, pages
