from app.routes.project_routes import _clean_for_deploy


def test_nav_links_become_real_hrefs():
    src = '<a href="javascript:void(0)" data-nav="pages/about.html" class="nav-link">소개</a>'
    out = _clean_for_deploy(src)
    assert 'href="pages/about.html"' in out
    assert "data-nav" not in out
    assert "javascript:void(0)" not in out


def test_nav_without_href_gets_one():
    out = _clean_for_deploy('<a data-nav="index.html">홈</a>')
    assert 'href="index.html"' in out


def test_placeholder_button_kept():
    out = _clean_for_deploy('<a href="javascript:void(0)" class="btn">버튼</a>')
    assert 'href="javascript:void(0)"' in out


def test_editor_artifacts_removed():
    out = _clean_for_deploy('<div data-wgen-id="w1" class="card wgen-selected wgen-hover">x</div>')
    assert "data-wgen-id" not in out
    assert "wgen-selected" not in out and "wgen-hover" not in out
    assert "card" in out


def test_reveal_script_injected_once_and_idempotent():
    src = '<html><body><div data-animate="fade-in">x</div></body></html>'
    out = _clean_for_deploy(src)
    assert out.count("data-deploy-reveal") == 1
    assert _clean_for_deploy(out).count("data-deploy-reveal") == 1


def test_no_animate_no_script():
    out = _clean_for_deploy("<html><body><p>hi</p></body></html>")
    assert "data-deploy-reveal" not in out
