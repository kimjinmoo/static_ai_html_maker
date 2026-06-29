"""멀티페이지 생성. 모든 페이지가 동일 DesignSystem으로 골격을 공유한다."""

from app.model import llama_chat_stream
from app.generation import build_generation_prompt, Mode
from app.utils import sanitize_surrogates, ensure_complete_html, _remove_truncated_lines


def default_plan(page_type):
    """용도별 결정적 기본 메뉴/페이지 구조."""
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
