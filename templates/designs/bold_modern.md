# Design Token - Bold Modern

## Overview
강렬한 그라데이션과 대담한 타이포그래피로 임팩트를 주는 다크 테마 디자인입니다. 기술 스타트업, 크리에이티브 에이전시, 제품 런칭에 적합합니다.

## Color Palette
- Primary: `#6c5ce7` (Vivid Purple) - 메인 브랜드 컬러, CTA
- Secondary: `#00cec9` (Teal) - 보조 액센트, 그라데이션 조합
- Background: `#0a0a0a` - 페이지 배경
- Surface: `#141414` - 카드, 섹션 배경
- Surface Hover: `#1a1a1a` - hover 상태
- Text Primary: `#ffffff` - 본문 텍스트
- Text Secondary: `#a0a0a0` - 설명 텍스트
- Border: `#2a2a2a` - 구분선, 카드 테두리

## Typography
- Font Family: `'Poppins', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap`

### Heading Scale
- H1: 64px / 800 / line-height 1.05 / tracking -0.03em
- H2: 42px / 700 / line-height 1.1 / tracking -0.02em
- H3: 28px / 700 / line-height 1.2
- H4: 22px / 600 / line-height 1.3

### Body Scale
- Body Large: 19px / 400 / line-height 1.8
- Body: 17px / 400 / line-height 1.7
- Body Small: 14px / 500 / line-height 1.5
- Caption: 12px / 600 / line-height 1.4 / tracking 0.1em / uppercase

### Usage Guidelines
- H1은 그라데이션 텍스트 적용 권장 (`background-clip: text`)
- 숫자 강조 시 800 weight 사용
- 섹션 라벨은 uppercase + tracking 0.1em + Secondary 컬러
- 인용문은 24px / 600 / italic, 좌측 border-accent

## Spacing System (8px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 12px - 관련 요소 사이
- md: 20px - 컴포넌트 내부 패딩
- lg: 32px - 카드 사이 간격
- xl: 64px - 섹션 내부 여백
- xxl: 120px - 섹션 사이 여백
- xxxl: 160px - 히어로 섹션 여백

## Border Radius
- Small: 6px - 버튼, 입력 필드
- Medium: 12px - 카드, 모달
- Large: 24px - 큰 컨테이너, 히어로
- Pill: 999px - 뱃지, 태그

## Shadows & Glows
- Glow Purple: `0 0 40px rgba(108,92,231,0.3)` - primary 요소
- Glow Teal: `0 0 40px rgba(0,206,201,0.3)` - secondary 요소
- Glow Combined: `0 0 60px rgba(108,92,231,0.2), 0 0 120px rgba(0,206,201,0.1)` - 히어로
- Card Shadow: `0 8px 32px rgba(0,0,0,0.4)` - 카드
- Text Glow: `0 0 20px rgba(108,92,231,0.5)` - 강조 텍스트

## Gradients
- Primary: `linear-gradient(135deg, #6c5ce7, #a29bfe)`
- Accent: `linear-gradient(135deg, #00cec9, #81ecec)`
- Hero: `linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%)`
- Background: `radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a0a 70%)`
- Text: `background: linear-gradient(135deg, #6c5ce7, #00cec9); -webkit-background-clip: text;`

## Buttons
- Primary: gradient Hero, text white, radius 12px, padding 16px 32px, glow on hover
- Secondary: bg transparent, border `#6c5ce7`, text `#6c5ce7`, glow on hover
- Ghost: bg `rgba(108,92,231,0.1)`, text `#a29bfe`, radius 12px
- Hover: glow 효과 추가, transform scale(1.02)

## Layout
- Max Width: 1400px
- Container Padding: 32px (mobile), 64px (desktop)
- Grid Gap: 32px
- Section Padding: 120px vertical
- Navigation Height: 80px (transparent, scroll 시 bg `#0a0a0a`)

## Components
- Navigation: 로고 좌측, 메뉴 우측, scroll 시 배경 변경
- Hero: 풀스크린, 그라데이션 텍스트, glow 효과 CTA
- Feature Card: bg `#141414`, border `#2a2a2a`, glow on hover
- Stats: 큰 숫자 (48px / 800) + 그라데이션
- Footer: bg `#050505`, 4 컬럼, 상단 glow divider

## Animations
- Fade In: opacity 0 → 1, translateY 20px → 0, duration 0.6s
- Scale In: scale 0.9 → 1, opacity 0 → 1, duration 0.4s
- Glow Pulse: glow intensity 0.3 → 0.5 → 0.3, duration 2s infinite
- Scroll Reveal: IntersectionObserver 기반 fade-in

## Style Notes
- Dark theme with vibrant gradients
- Bold typography, extra large headings
- Glow effects on interactive elements
- Smooth scroll animations on reveal
- High contrast for readability on dark background
