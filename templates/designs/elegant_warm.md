# Design Token - Elegant Warm

## Overview
세련된 세리프 폰트와 따뜻한 컬러 팔레트로 품격을 주는 디자인입니다. 로슈텔, 갤러리, 고급 레스토랑, 포트폴리오, 개인 브랜드, 라이프스타일에 적합합니다.

## Color Palette
- Primary: `#2d3436` (Charcoal) - 본문 텍스트, 헤더, 네비게이션
- Primary Light: `#636e72` (Warm Gray) - 설명 텍스트
- Secondary: `#d4a574` (Warm Gold) - 액센트, CTA, 구분선
- Secondary Dark: `#c9956b` (Deep Gold) - hover 상태
- Secondary Light: `#e8d5bf` (Light Gold) - 배경 액센트
- Background: `#faf9f6` (Off White) - 페이지 배경
- Background Warm: `#f5f0eb` (Warm Gray) - 섹션 배경
- Surface: `#ffffff` (Pure White) - 카드, 섹션 배경
- Surface Alt: `#f8f6f3` - 어두운 카드 배경
- Text Primary: `#2d3436` - 본문 텍스트
- Text Secondary: `#636e72` - 설명 텍스트, 캡션
- Text Muted: `#b2bec3` - 비활성화, placeholder
- Border: `#dfe6e9` - 구분선, 카드 테두리
- Border Warm: `#e8e0d8` - 따뜻한 구분선
- Success: `#63a56c` - 성공 상태
- Warning: `#d4a574` - 경고 상태 (Gold)
- Error: `#c44536` - 오류 상태

### CSS Variables
```css
:root {
  --color-primary: #2d3436;
  --color-secondary: #d4a574;
  --color-secondary-dark: #c9956b;
  --color-secondary-light: #e8d5bf;
  --color-bg: #faf9f6;
  --color-surface: #ffffff;
  --color-text: #2d3436;
  --color-text-secondary: #636e72;
  --color-border: #dfe6e9;
}
```

## Typography
- Heading Font: `'Playfair Display', Georgia, 'Times New Roman', serif`
- Body Font: `'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap`

### Heading Scale (Serif)
- H1: 56px / 700 / line-height 1.15 / tracking -0.01em (desktop), 38px / 700 (mobile)
- H2: 42px / 600 / line-height 1.2 / tracking -0.01em (desktop), 30px / 600 (mobile)
- H3: 30px / 600 / line-height 1.25
- H4: 22px / 500 / line-height 1.35
- H5: 18px / 500 / line-height 1.4
- H6: 14px / 600 / line-height 1.4 / uppercase / tracking 0.08em

### Body Scale (Sans-serif)
- Body Large: 20px / 300 / line-height 1.9
- Body: 17px / 400 / line-height 1.85
- Body Small: 15px / 400 / line-height 1.7
- Caption: 12px / 500 / line-height 1.5 / tracking 0.08em / uppercase

### Usage Guidelines
- H1, H2는 serif 폰트로 품격 강조
- 본문은 sans-serif로 가독성 확보
- 인용문은 serif italic, 22px, Secondary 컬러 좌측 border 2px
- 섹션 라벨은 uppercase + tracking 0.08em + Text Secondary + sans-serif
- 숫자는 sans-serif, light weight (300)로 세련된 느낌
- 긴 본문은 max-width 60ch, line-height 1.9

## Spacing System (4px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 8px - 관련 요소 사이
- md: 20px - 컴포넌트 내부 패딩
- lg: 36px - 카드 사이 간격
- xl: 64px - 섹션 내부 여백
- xxl: 120px - 섹션 사이 여백
- xxxl: 160px - 히어로 섹션 여백
- xxxxl: 200px - 풀스크린 섹션

## Border Radius
- None: 0px - 카드, 버튼 (클래식 스타일)
- Small: 2px - 입력 필드, 작은 요소
- Medium: 4px - 모달, 큰 컨테이너
- Large: 8px - 히어로 요소
- Pill: 999px - 뱃지, 작은 태그

## Shadows
- Subtle: `0 2px 8px rgba(0,0,0,0.04)` - 기본 카드
- Medium: `0 4px 20px rgba(0,0,0,0.06)` - hover 상태
- Large: `0 16px 48px rgba(0,0,0,0.08)` - 모달, 오버레이
- Elevated: `0 24px 64px rgba(0,0,0,0.1)` - floating 요소

## Borders
- Accent: `1px solid #d4a574` - 섹션 구분, 강조
- Accent Thick: `2px solid #d4a574` - 중요한 구분
- Divider: `1px solid #dfe6e9` - 일반 구분선
- Card: `1px solid #dfe6e9` - 카드 테두리
- Card Hover: `1px solid #d4a574` - hover 시 액센트 변경
- Warm: `1px solid #e8e0d8` - 따뜻한 구분선

## Buttons
- Primary: bg `#2d3436`, text white, radius 0px, padding 16px 32px, font-weight 500, letter-spacing 0.06em
- Secondary: bg transparent, border 1px `#2d3436`, text `#2d3436`, radius 0px, padding 16px 32px
- Accent: bg `#d4a574`, text white, radius 0px, padding 16px 32px, font-weight 500, letter-spacing 0.06em
- Ghost: bg transparent, text `#2d3436`, padding 8px 16px, border-bottom 1px `#2d3436`
- Hover: bg darken 5% 또는 border color → Secondary, transition 0.4s ease
- Active: bg darken 10%
- Disabled: opacity 0.4, cursor not-allowed

## Links
- Color: `#2d3436`, text-decoration none, border-bottom 1px `#d4a574`
- Hover: color `#d4a574`, border-bottom-color `#2d3436`
- Arrow link: `→` 또는 `—` 아이콘 + hover 시 transform translateX(6px)
- Underline: 1px Secondary, hover 시 Primary

## Layout
- Max Width: 1100px (조금 좁아 집중도 높임)
- Container: max-width 1100px, margin 0 auto, padding 0 24px
- Container Narrow: max-width 700px (텍스트 중심 섹션)
- Container Wide: max-width 1300px (이미지 섹션)
- Grid Gap: 36px (2컬럼), 48px (3컬럼)
- Section Padding: 120px vertical (desktop), 72px (mobile)
- Navigation Height: 76px, bg `#faf9f6`, border-bottom 1px `#dfe6e9`

## Navigation
- Sticky top, bg `#faf9f6`, border-bottom 1px `#dfe6e9`
- Logo 중앙 또는 좌측 (serif 폰트, font-weight 600, letter-spacing 0.02em)
- Menu 우측 또는 중앙 (font-weight 400, spacing 36px, hover color → Secondary)
- CTA 버튼 우측 끝 (Accent 스타일)
- Scroll 시: shadow subtle
- Mobile: hamburger 메뉴, slide-in drawer with warm bg

## Hero Section
- Min-height: 100vh, display flex, align-items center
- Background: off-white 또는 warm gradient
- Center-aligned content, max-width 700px
- H1: serif, 56px+, elegant spacing
- Description: 18px / 300 / line-height 1.9 / `#636e72`
- CTA: Accent 버튼 1~2개, gap 16px
- Decorative: 세련된 divider (48px, Secondary 컬러)
- Scroll indicator: minimal animated line

## Cards
- Padding: 36px
- Background: white
- Border: 1px `#dfe6e9`
- Border-radius: 0px (클래식) 또는 4px
- Box-shadow: subtle
- Hover: border → Secondary, shadow medium, transform translateY(-4px), transition 0.4s ease
- Icon area: 48px, Secondary 컬러, icon 24px
- Title: 20px / 600 / serif
- Description: 15px / 400 / `#636e72` / line-height 1.7
- Divider: 32px width, Secondary, margin 16px 0

## Stats Section
- Large numbers: 52px / 300 / serif / Primary 컬러
- Label: 13px / 500 / uppercase / tracking 0.08em / `#636e72`
- Grid: 4컬럼 (desktop), 2컬럼 (mobile)
- Divider: 1px `#dfe6e9` between columns
- Decorative: Secondary 컬러 accent line above numbers

## Testimonials
- Card: padding 40px, bg white, border 1px `#dfe6e9`, border-radius 0px
- Quote icon: 32px, Secondary, opacity 0.4, serif font
- Text: 17px / 400 / line-height 1.85 / italic / `#2d3436`
- Author: 16px / 600 / serif / Primary
- Role: 13px / 400 / `#636e72` / uppercase / tracking 0.05em
- Divider: 32px width, Secondary, between quote and author
- Avatar: 56px circle, border 2px Secondary, object-fit cover

## Pricing Cards
- 3-tier layout, middle card highlighted
- Highlighted: shadow large, border 2px Secondary, bg `#faf9f6`
- Label: 14px / 500 / uppercase / tracking 0.08em / `#636e72`
- Price: 52px / 300 / serif / Primary
- Currency: 20px / 400 / `#636e72`
- Period: 13px / 400 / `#b2bec3`
- Divider: 1px `#dfe6e9`, margin 20px 0
- Features: check icons (Secondary), 15px, spacing 14px
- CTA: full-width, Accent 스타일

## FAQ Accordion
- Item: bg white, border 1px `#dfe6e9`, border-radius 0px, margin-bottom 12px
- Question: 17px / 500 / serif, padding 24px 32px, cursor pointer
- Answer: padding 0 32px 24px, 15px / 400 / `#636e72` / line-height 1.7
- Icon: +/−, Secondary 컬러, transition 0.3s ease
- Active: border color Secondary, shadow subtle

## Footer
- Background: `#2d3436`, text `#faf9f6`
- Top section: padding 80px 0
- 4 columns: Brand, Navigation, Services, Contact
- Logo: serif, font-weight 600, white
- Column heading: 13px / 500 / uppercase / tracking 0.08em / `#b2bec3`
- Links: 14px / 400 / `#dfe6e9`, hover white
- Bottom bar: 1px `#3d4446` divider, padding 24px 0
- Copyright: 13px / 400 / `#636e72`
- Social icons: 20px, `#b2bec3`, hover white

## Form Elements
- Input: bg white, border 1px `#dfe6e9`, radius 0px, padding 14px 18px, font-size 15px
- Focus: border Secondary, box-shadow 0 0 0 3px rgba(212,165,116,0.15)
- Label: 13px / 500 / uppercase / tracking 0.05em / `#2d3436`, margin-bottom 10px
- Textarea: min-height 140px, resize vertical
- Placeholder: `#b2bec3`
- Error: border `#c44536`, box-shadow 0 0 0 3px rgba(196,69,54,0.1)

## Decorative Elements
- Section Divider: `<hr>` 스타일, Secondary 컬러, 48px 너비, central aligned
- Corner Accent: ::before ::after로 모서리 장식 (Secondary 컬러, 1px)
- Background Pattern: 미세한 noise texture 또는 linen pattern (opacity 0.03)
- Image Frame: 6px padding + border 1px Secondary + shadow subtle
- Accent Line: 1px Secondary, various widths (32px, 48px, 64px)
- Dot Pattern: radial-gradient dots, opacity 0.05
- Ornamental: `✦`, `◆`, `—` 등의 심볼, Secondary 컬러

## Animations
- Fade In: opacity 0 → 1, duration 1s ease
- Slide Up: translateY 30px → 0, opacity 0 → 1, duration 0.8s ease
- Hover Lift: translateY(-4px), shadow medium, duration 0.4s ease
- Underline Expand: width 0 → 100%, duration 0.4s ease
- Color Transition: color change, duration 0.4s ease
- Stagger: children delay 0.15s each
- Scroll Reveal: IntersectionObserver 기반, threshold 0.15

## Responsive Breakpoints
- Mobile: 0-768px
- Tablet: 768px-1024px
- Desktop: 1024px+
- Wide: 1300px+

## Style Notes
- Serif headings for elegance and sophistication
- Warm, inviting color palette with gold accents
- Thin accent borders for refined details
- Generous line-height for readability (1.8-1.9)
- Minimalist with refined details, less is more
- High-quality imagery is essential for this style
- Consistent 4px spacing grid
- Zero border-radius for classic feel
- Letter-spacing on uppercase text for refinement
- Smooth, slow transitions (0.4s) for elegant feel
