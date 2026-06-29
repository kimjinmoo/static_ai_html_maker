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
