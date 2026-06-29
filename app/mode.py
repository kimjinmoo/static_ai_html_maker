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
