from app.utils import balance_tags


def test_unclosed_div_dangling_closed():
    out = balance_tags('<section><div class="x"><p>hi</p>')
    assert out.endswith("</div></section>")


def test_balanced_unchanged():
    s = '<section><div><p>hi</p></div></section>'
    assert balance_tags(s) == s


def test_void_ignored():
    s = '<div><img src="a.png"><br><input></div>'
    assert balance_tags(s) == s


def test_multiple_unclosed():
    out = balance_tags('<section><div><span>x')
    assert out.endswith("</span></div></section>")


def test_script_skipped():
    s = '<div><script>if(a<b){}</script></div>'
    assert balance_tags(s) == s


def test_misnest_section_absorbs_div():
    # </section> implicitly closes the dangling div -> nothing to append
    assert balance_tags('<section><div><p>hi</p></section>') == '<section><div><p>hi</p></section>'
