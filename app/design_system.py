"""DesignSystem: 프로젝트 디자인 상태의 단일 진실원.

모든 생성/수정 프롬프트 경로가 이 객체 하나만 읽는다. scaffold_css는 절대
비어 있지 않다(custom 템플릿은 base scaffold로 폴백). 직렬화하여 프로젝트
JSON의 design_system 키에 저장하고, 로드 시 복원한다."""

from dataclasses import dataclass, field

from app.utils import load_scaffold_css, SCAFFOLD_CLASS_REFERENCE

# custom(URL) 디자인이 골격 CSS를 못 주는 경우 사용할 기본 골격
BASE_SCAFFOLD_TEMPLATE = "minimal_clean"

TEMPLATE_NAMES = {
    "minimal_clean": "Minimal Clean (깔끔한 미니멀)",
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
