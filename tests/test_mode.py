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
