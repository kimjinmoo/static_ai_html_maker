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
