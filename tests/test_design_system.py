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


def test_build_frame_contains_content_placeholder_and_scaffold():
    ds = DesignSystem.create(template="minimal_clean", page_type="company",
                             design_content="", brand="ACME",
                             menu_items=["홈", "소개"])
    frame = ds.build_frame(title="홈", current_file="index.html")
    assert "{CONTENT}" in frame
    assert "<!DOCTYPE html>" in frame
    assert "ACME" in frame          # brand가 nav에 들어감
    assert ds.scaffold_css[:40] in frame  # scaffold CSS가 <style>에 포함
