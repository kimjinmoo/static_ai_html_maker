# Design Token - Bold Modern

## Overview
강렬한 그라데이션과 대담한 타이포그래피로 임팩트를 주는 다크 테마 디자인입니다. 기술 스타트업, 크리에이티브 에이전시, 제품 런칭, AI/SaaS 서비스에 적합합니다.

## Color Palette
- Primary: `#6c5ce7` (Vivid Purple) - 메인 브랜드 컬러, CTA
- Primary Light: `#a29bfe` (Soft Purple) - hover, 보조 요소
- Secondary: `#00cec9` (Teal) - 보조 액센트, 그라데이션 조합
- Secondary Light: `#81ecec` (Light Teal) - hover, 하이라이트
- Background: `#0a0a0a` (Deep Black) - 페이지 배경
- Surface: `#141414` (Dark Gray) - 카드, 섹션 배경
- Surface Hover: `#1a1a1a` - hover 상태
- Surface Raised: `#1e1e1e` - elevated 카드
- Text Primary: `#ffffff` - 본문 텍스트
- Text Secondary: `#a0a0a0` - 설명 텍스트
- Text Muted: `#666666` - 비활성화, placeholder
- Border: `#2a2a2a` - 구분선, 카드 테두리
- Border Light: `#333333` - 강조 테두리
- Success: `#00b894` - 성공 상태
- Warning: `#fdcb6e` - 경고 상태
- Error: `#ff7675` - 오류 상태

### CSS Variables
```css
:root {
  --color-primary: #6c5ce7;
  --color-primary-light: #a29bfe;
  --color-secondary: #00cec9;
  --color-secondary-light: #81ecec;
  --color-bg: #0a0a0a;
  --color-surface: #141414;
  --color-text: #ffffff;
  --color-text-secondary: #a0a0a0;
  --color-border: #2a2a2a;
}
```

## Typography
- Font Family: `'Poppins', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap`

### Heading Scale
- H1: 72px / 900 / line-height 1.0 / tracking -0.04em (desktop), 44px / 800 (mobile)
- H2: 48px / 800 / line-height 1.1 / tracking -0.03em (desktop), 32px / 700 (mobile)
- H3: 32px / 700 / line-height 1.2 / tracking -0.01em
- H4: 24px / 700 / line-height 1.3
- H5: 20px / 600 / line-height 1.3
- H6: 16px / 700 / line-height 1.4 / uppercase / tracking 0.1em

### Body Scale
- Body Large: 20px / 400 / line-height 1.8
- Body: 17px / 400 / line-height 1.75
- Body Small: 15px / 400 / line-height 1.6
- Caption: 12px / 600 / line-height 1.4 / tracking 0.12em / uppercase

### Usage Guidelines
- H1은 그라데이션 텍스트 적용 필수 (`background-clip: text`, `-webkit-text-fill-color: transparent`)
- 숫자 강조 시 900 weight, 80px+ 크기 사용
- 섹션 라벨은 uppercase + tracking 0.12em + Secondary 컬러 + 작은 크기
- 인용문은 24px / 600 / italic, 좌측 border 3px Primary
- 긴 본문은 max-width 65ch, line-height 1.8

## Spacing System (8px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 12px - 관련 요소 사이
- md: 24px - 컴포넌트 내부 패딩
- lg: 40px - 카드 사이 간격
- xl: 80px - 섹션 내부 여백
- xxl: 140px - 섹션 사이 여백
- xxxl: 200px - 히어로 섹션 여백

## Border Radius
- Small: 8px - 버튼, 입력 필드
- Medium: 16px - 카드, 모달
- Large: 24px - 큰 컨테이너
- XL: 32px - 히어로 요소, 큰 카드
- Pill: 999px - 뱃지, 태그, CTA 버튼

## Shadows & Glows
- Glow Purple: `0 0 40px rgba(108,92,231,0.3)` - primary 요소
- Glow Purple Strong: `0 0 60px rgba(108,92,231,0.4), 0 0 120px rgba(108,92,231,0.2)` - 히어로
- Glow Teal: `0 0 40px rgba(0,206,201,0.3)` - secondary 요소
- Glow Teal Strong: `0 0 60px rgba(0,206,201,0.4), 0 0 120px rgba(0,206,201,0.2)`
- Glow Combined: `0 0 60px rgba(108,92,231,0.2), 0 0 120px rgba(0,206,201,0.1)` - 히어로 배경
- Card Shadow: `0 8px 32px rgba(0,0,0,0.5)` - 카드 기본
- Card Hover: `0 16px 48px rgba(0,0,0,0.6), 0 0 40px rgba(108,92,231,0.15)` - 카드 hover
- Text Glow: `0 0 20px rgba(108,92,231,0.5)` - 강조 텍스트
- Nav Shadow: `0 4px 30px rgba(0,0,0,0.3)` - 네비게이션

## Gradients
- Primary: `linear-gradient(135deg, #6c5ce7, #a29bfe)`
- Accent: `linear-gradient(135deg, #00cec9, #81ecec)`
- Hero: `linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%)`
- BG Hero: `radial-gradient(ellipse at 30% 20%, rgba(108,92,231,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,206,201,0.1) 0%, transparent 50%)`
- BG Section: `radial-gradient(ellipse at top, rgba(108,92,231,0.05) 0%, transparent 60%)`
- Text Gradient: `background: linear-gradient(135deg, #6c5ce7, #00cec9); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`
- Border Gradient: `linear-gradient(135deg, rgba(108,92,231,0.3), rgba(0,206,201,0.3))`

## Buttons
- Primary: gradient Hero, text white, radius 16px, padding 18px 36px, font-weight 700, letter-spacing 0.02em
- Secondary: bg transparent, border 2px `#6c5ce7`, text `#a29bfe`, radius 16px, padding 18px 36px, font-weight 600
- Ghost: bg `rgba(108,92,231,0.1)`, text `#a29bfe`, radius 16px, padding 14px 28px, font-weight 500
- CTA Large: gradient Hero, radius 20px, padding 22px 48px, font-weight 800, font-size 18px, glow on hover
- Hover: glow 효과 추가, transform scale(1.02), transition 0.3s ease
- Active: transform scale(0.98)
- Icon Button: 48px circle, bg `rgba(108,92,231,0.1)`, icon 20px, hover glow

## Links
- Color: `#a29bfe`, text-decoration none
- Hover: color `#ffffff`, glow text
- Arrow link: `→` 아이콘 + hover 시 transform translateX(8px) + color change
- Underline link: gradient underline, width 0 → 100% on hover

## Layout
- Max Width: 1400px
- Container: max-width 1400px, margin 0 auto, padding 0 32px
- Container Narrow: max-width 900px (텍스트 중심)
- Grid Gap: 32px (2컬럼), 40px (3~4컬럼)
- Section Padding: 140px vertical (desktop), 80px (mobile)
- Navigation Height: 80px, transparent, scroll 시 bg `rgba(10,10,10,0.9)` + backdrop-filter blur

## Navigation
- Transparent bg, fixed top, full-width
- Logo 좌측 (glow icon + brand text, font-weight 800)
- Menu 중앙 (font-weight 500, spacing 40px, hover color + glow)
- CTA 버튼 우측 (Primary 스타일)
- Scroll 시: bg `rgba(10,10,10,0.9)`, backdrop-filter blur 20px, shadow nav
- Mobile: hamburger 메뉴, full-screen overlay with gradient bg

## Hero Section
- Min-height: 100vh, display flex, align-items center, position relative
- Background: gradient overlay + animated particles 또는 glow orbs
- Center-aligned 또는 left-aligned content
- H1: gradient text, 72px+ 크기로 임팩트
- Description: 20px, max-width 600px, `#a0a0a0`
- CTA: Primary + Secondary 버튼 조합, gap 16px
- Scroll indicator: 하단 animated bouncing arrow
- Decorative: floating glow orbs (position absolute, animation)

## Cards
- Padding: 36px
- Background: `#141414`
- Border: 1px `#2a2a2a`
- Border-radius: 16px
- Box-shadow: card shadow
- Hover: border color gradient, glow purple, transform translateY(-8px), transition 0.4s ease
- Icon area: 56px circle, bg `rgba(108,92,231,0.1)`, icon 28px, glow
- Title: 22px / 700 / white
- Description: 15px / 400 / `#a0a0a0` / line-height 1.7
- Number badge: 48px / 900 / gradient text, opacity 0.3

## Stats Section
- Large numbers: 64px / 900 / gradient text
- Label: 14px / 600 / uppercase / tracking 0.12em / `#a0a0a0`
- Grid: 4컬럼 (desktop), 2컬럼 (tablet), 1컬럼 (mobile)
- Divider: 1px `#2a2a2a` between columns
- Background: radial gradient overlay

## Testimonials
- Card: padding 40px, bg `#141414`, border 1px `#2a2a2a`, border-radius 16px
- Quote icon: 36px, gradient, opacity 0.5
- Text: 17px / 400 / line-height 1.8 / `#ffffff`
- Author: 16px / 700 / white
- Role: 14px / 400 / `#a0a0a0`
- Avatar: 48px circle, border 2px gradient
- Stars: Font Awesome star icons, `#fdcb6e`, glow

## Pricing Cards
- 3-tier layout, middle card highlighted
- Highlighted: scale 1.05, border 2px gradient, glow purple strong, bg `#1a1a1a`
- Label: 14px / 700 / uppercase / tracking 0.1em / gradient text
- Price: 56px / 900 / white
- Currency: 24px / 700 / `#a0a0a0`
- Period: 14px / 400 / `#666666`
- Features: check icons (Primary), 15px, spacing 16px
- CTA: full-width, Primary 또는 Hero gradient
- Popular badge: gradient bg, white text, pill shape

## FAQ Accordion
- Item: bg `#141414`, border 1px `#2a2a2a`, border-radius 12px, margin-bottom 12px
- Question: 17px / 600, padding 24px 32px, cursor pointer
- Answer: padding 0 32px 24px, 15px / 400 / `#a0a0a0` / line-height 1.7
- Icon: +/− 또는 chevron, Primary 컬러, rotation animation
- Active: border color Primary, glow purple

## Footer
- Background: `#050505`
- Top divider: 1px gradient, glow
- 4 columns: Brand, Product, Company, Connect
- Column heading: 14px / 700 / uppercase / tracking 0.12em / white
- Links: 14px / 400 / `#a0a0a0`, hover white + glow text
- Bottom: 1px `#2a2a2a` divider, copyright 13px / `#666666`
- Social icons: 24px, `#a0a0a0`, hover white + glow

## Form Elements
- Input: bg `#141414`, border 1px `#2a2a2a`, radius 12px, padding 16px 20px, font-size 16px, color white
- Focus: border Primary, box-shadow 0 0 0 3px rgba(108,92,231,0.2), glow purple
- Label: 14px / 600 / white, margin-bottom 10px
- Placeholder: `#666666`
- Textarea: min-height 140px, resize vertical
- Error: border Error, box-shadow 0 0 0 3px rgba(255,118,117,0.2)

## Background Effects
- Grid pattern: repeating-linear-gradient, opacity 0.03
- Noise texture: SVG filter, opacity 0.02
- Glow orbs: radial-gradient circles, position absolute, animation float
- Line accents: 1px gradients, position absolute

## Animations
- Fade In: opacity 0 → 1, duration 0.8s ease
- Slide Up: translateY 40px → 0, opacity 0 → 1, duration 0.8s ease
- Scale In: scale 0.8 → 1, opacity 0 → 1, duration 0.6s ease
- Glow Pulse: glow intensity 0.3 → 0.5 → 0.3, duration 2s infinite
- Float: translateY 0 → -20px → 0, duration 6s infinite ease-in-out
- Gradient Shift: background-position 0% → 100% → 0%, duration 8s infinite
- Scroll Reveal: IntersectionObserver 기반, threshold 0.1, stagger 0.1s

## Responsive Breakpoints
- Mobile: 0-768px
- Tablet: 768px-1024px
- Desktop: 1024px-1400px
- Wide: 1400px+

## Style Notes
- Dark theme with vibrant gradients and glow effects
- Bold typography with extra large headings (72px+ H1)
- Glow effects on all interactive elements
- Smooth scroll animations with stagger reveals
- High contrast for readability on dark background
- Gradient text for headings and key numbers
- Floating decorative elements for depth
- Consistent 8px spacing grid
- Backdrop-filter blur for overlays and navigation
