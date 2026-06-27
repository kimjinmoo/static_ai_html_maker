# Design Token - Minimal Clean

## Overview
깔끔하고 여백이 많은 미니멀 디자인입니다. 콘텐츠 자체에 집중할 수 있도록 간결한 구조와 플랫한 컬러를 사용합니다. 기업 소개, SaaS, 포트폴리오에 적합합니다.

## Color Palette
- Primary: `#1a1a2e` (Deep Navy) - 메인 액션, 헤더, 네비게이션
- Secondary: `#e94560` (Accent Red) - CTA 버튼, 강조 요소
- Background: `#ffffff` - 페이지 배경
- Surface: `#f8f9fa` - 카드, 섹션 배경
- Surface Alt: `#f1f3f5` - 어두운 카드 배경
- Text Primary: `#212529` - 본문 텍스트
- Text Secondary: `#6c757d` - 설명 텍스트, 캡션
- Text Muted: `#adb5bd` - 비활성화, placeholder
- Border: `#e9ecef` - 구분선, 카드 테두리
- Success: `#51cf66` - 성공 상태
- Warning: `#fcc419` - 경고 상태
- Error: `#ff6b6b` - 오류 상태

### CSS Variables
```css
:root {
  --color-primary: #1a1a2e;
  --color-secondary: #e94560;
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-text: #212529;
  --color-text-secondary: #6c757d;
  --color-border: #e9ecef;
}
```

## Typography
- Font Family: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap`

### Heading Scale
- H1: 56px / 800 / line-height 1.05 / tracking -0.03em (desktop), 40px / 700 (mobile)
- H2: 40px / 700 / line-height 1.15 / tracking -0.02em (desktop), 28px / 600 (mobile)
- H3: 28px / 600 / line-height 1.25 / tracking -0.01em
- H4: 22px / 600 / line-height 1.3
- H5: 18px / 600 / line-height 1.4
- H6: 16px / 600 / line-height 1.4 / uppercase / tracking 0.05em

### Body Scale
- Body Large: 20px / 400 / line-height 1.7
- Body: 16px / 400 / line-height 1.65
- Body Small: 14px / 400 / line-height 1.6
- Caption: 12px / 500 / line-height 1.5 / tracking 0.05em / uppercase

### Usage Guidelines
- H1은 페이지당 1회만 사용 (히어로 섹션)
- H2는 섹션 제목에 사용, 상단에 작은 라벨 텍스트 추가 권장
- 본문 최대 너비 65ch 권장 (가독성)
- 링크는 Primary 컬러, underline 없이 hover 시 underline
- 강조는 bold만 사용, 컬러 변경 금지

## Spacing System (4px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 8px - 관련 요소 사이
- md: 16px - 컴포넌트 내부 패딩
- lg: 24px - 카드 사이 간격
- xl: 48px - 섹션 내부 여백
- xxl: 80px - 섹션 사이 여백
- xxxl: 120px - 메인 섹션 여백
- xxxxl: 160px - 히어로 섹션 여백

## Border Radius
- None: 0px - 카드 (클래식)
- Small: 4px - 버튼, 입력 필드
- Medium: 8px - 카드, 모달
- Large: 12px - 큰 컨테이너
- XL: 16px - 히어로 요소
- Pill: 999px - 뱃지, 태그, 작은 버튼

## Shadows
- Subtle: `0 1px 3px rgba(0,0,0,0.06)` - 기본 카드
- Medium: `0 4px 16px rgba(0,0,0,0.08)` - hover 상태
- Large: `0 12px 40px rgba(0,0,0,0.1)` - 드롭다운, 모달
- Elevated: `0 20px 60px rgba(0,0,0,0.12)` - 오버레이 카드

## Buttons
- Primary: bg `#1a1a2e`, text white, radius 8px, padding 14px 28px, font-weight 600
- Secondary: bg transparent, border 1px `#1a1a2e`, text `#1a1a2e`, radius 8px, padding 14px 28px
- CTA: bg `#e94560`, text white, radius 8px, padding 16px 32px, font-weight 600
- Ghost: bg transparent, text `#1a1a2e`, padding 8px 16px
- Hover: opacity 0.9, transform translateY(-1px), shadow medium
- Active: transform translateY(0), shadow none
- Disabled: opacity 0.5, cursor not-allowed

## Links
- Color: `#1a1a2e`, text-decoration none
- Hover: text-decoration underline, underline-offset 4px
- Arrow link: `→` 아이콘 + hover 시 transform translateX(4px)

## Layout
- Max Width: 1200px
- Container: max-width 1200px, margin 0 auto, padding 0 24px
- Container Large: max-width 1400px
- Container Narrow: max-width 800px (텍스트 중심 섹션)
- Grid Gap: 24px (2컬럼), 32px (3~4컬럼)
- Section Padding: 100px vertical (desktop), 60px (mobile)
- Navigation Height: 72px, sticky top, bg white, border-bottom 1px `#e9ecef`

## Navigation
- Sticky top, bg white, box-shadow subtle on scroll
- Logo 좌측 (24px icon + brand text, font-weight 700)
- Menu 우측 (font-weight 500, spacing 32px, hover color change)
- CTA 버튼 우측 끝
- Mobile: hamburger 메뉴, slide-in drawer

## Hero Section
- Min-height: 100vh, display flex, align-items center
- Center-aligned content, max-width 800px
- H1 + 설명문 (max-width 600px) + CTA 버튼 1~2개
- Background: gradient 또는 패턴
- Scroll indicator: 하단 animated arrow

## Cards
- Padding: 32px
- Background: white 또는 `#f8f9fa`
- Border: 1px `#e9ecef`
- Border-radius: 8px
- Box-shadow: subtle
- Hover: shadow medium, transform translateY(-4px), transition 0.3s ease
- Icon area: 48px circle, bg `#f8f9fa`, icon 24px
- Title: 20px / 600
- Description: 15px / 400 / `#6c757d`

## Stats Section
- Large numbers: 48px / 800 / Primary 컬러
- Label: 14px / 500 / uppercase / tracking 0.05em / Secondary text
- Grid: 4컬럼 (desktop), 2컬럼 (mobile)
- Divider: 1px `#e9ecef` between columns

## Testimonials
- Card: padding 32px, bg `#f8f9fa`, border-radius 8px
- Quote icon: 32px, `#e9ecef`
- Text: 16px / 400 / line-height 1.7 / italic
- Author: 15px / 600 / Primary
- Role: 13px / 400 / Secondary
- Stars: Font Awesome star icons, `#fcc419`

## Pricing Cards
- 3-tier layout, middle card highlighted
- Highlighted: scale 1.05, shadow large, border 2px Primary
- Price: 48px / 800 / Primary
- Period: 14px / 400 / Secondary
- Features list: check icons, 15px, spacing 12px
- CTA: full-width button

## Footer
- Background: `#1a1a2e`, text white
- 4 columns: Brand, Quick Links, Services, Contact
- Column heading: 14px / 600 / uppercase / tracking 0.05em
- Links: 14px / 400 / `#a0a0a0`, hover white
- Bottom bar: 1px `#2d2d4e` divider, copyright 13px
- Social icons: 20px, `#a0a0a0`, hover white

## Form Elements
- Input: border 1px `#e9ecef`, radius 8px, padding 12px 16px, font-size 15px
- Focus: border Primary, box-shadow 0 0 0 3px rgba(26,26,46,0.1)
- Label: 14px / 500 / `#212529`, margin-bottom 8px
- Textarea: min-height 120px, resize vertical
- Placeholder: `#adb5bd`

## Animations
- Fade In: opacity 0 → 1, duration 0.6s ease
- Slide Up: translateY 20px → 0, opacity 0 → 1, duration 0.6s ease
- Hover Lift: translateY(-4px), shadow medium, duration 0.3s ease
- Stagger: children delay 0.1s each
- Scroll Reveal: IntersectionObserver 기반, threshold 0.1

## Responsive Breakpoints
- Mobile: 0-768px
- Tablet: 768px-1024px
- Desktop: 1024px+
- Wide: 1400px+

## Style Notes
- Clean lines, generous whitespace
- Subtle hover animations (transform translateY(-2px))
- No gradients, flat colors only
- Focus on content hierarchy through typography
- Maximum readability through proper line-height and line-length
- Consistent 4px spacing grid
- Cards have consistent padding and shadow across all sections
