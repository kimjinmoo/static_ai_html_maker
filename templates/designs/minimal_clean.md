# Design Token - Minimal Clean

## Overview
깔끔하고 여백이 많은 미니멀 디자인입니다. 콘텐츠 자체에 집중할 수 있도록 간결한 구조와 플랫한 컬러를 사용합니다.

## Color Palette
- Primary: `#1a1a2e` (Deep Navy) - 메인 액션, 헤더, 네비게이션
- Secondary: `#e94560` (Accent Red) - CTA 버튼, 강조 요소
- Background: `#ffffff` - 페이지 배경
- Surface: `#f8f9fa` - 카드, 섹션 배경
- Text Primary: `#212529` - 본문 텍스트
- Text Secondary: `#6c757d` - 설명 텍스트, 캡션
- Border: `#e9ecef` - 구분선, 카드 테두리

## Typography
- Font Family: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`

### Heading Scale
- H1: 48px / 700 / line-height 1.1 / tracking -0.02em
- H2: 36px / 600 / line-height 1.2 / tracking -0.01em
- H3: 24px / 600 / line-height 1.3
- H4: 20px / 600 / line-height 1.4

### Body Scale
- Body Large: 18px / 400 / line-height 1.7
- Body: 16px / 400 / line-height 1.6
- Body Small: 14px / 400 / line-height 1.5
- Caption: 12px / 500 / line-height 1.4 / tracking 0.05em / uppercase

### Usage Guidelines
- H1은 페이지당 1회만 사용 (히어로 섹션)
- H2는 섹션 제목에 사용
- 본문은 16px 기준, 최대 너비 65ch 권장
- 링크는 Primary 컬러, underline 없이 hover 시 underline

## Spacing System (4px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 8px - 관련 요소 사이
- md: 16px - 컴포넌트 내부 패딩
- lg: 24px - 카드 사이 간격
- xl: 48px - 섹션 내부 여백
- xxl: 80px - 섹션 사이 여백
- xxxl: 120px - 히어로 섹션 여백

## Border Radius
- Small: 4px - 버튼, 입력 필드
- Medium: 8px - 카드, 모달
- Large: 16px - 큰 컨테이너
- Pill: 999px - 뱃지, 태그

## Shadows
- Subtle: `0 1px 3px rgba(0,0,0,0.08)` - 기본 카드
- Medium: `0 4px 12px rgba(0,0,0,0.1)` - hover 상태
- Large: `0 8px 30px rgba(0,0,0,0.12)` - 드롭다운, 모달

## Buttons
- Primary: bg `#1a1a2e`, text white, radius 8px, padding 12px 24px
- Secondary: bg transparent, border `#1a1a2e`, text `#1a1a2e`
- CTA: bg `#e94560`, text white, radius 8px, padding 14px 28px
- Hover: opacity 0.9 또는 shadow 변경

## Layout
- Max Width: 1200px
- Container Padding: 24px (mobile), 48px (desktop)
- Grid Gap: 24px
- Section Padding: 80px vertical
- Navigation Height: 72px

## Components
- Navigation: 로고 좌측, 메뉴 우측, sticky top
- Hero: 중앙 정렬, H1 + 설명 + CTA 버튼
- Card: padding 24px, shadow subtle, hover 시 shadow medium
- Footer: 4 컬럼 (브랜드, 링크, 링크, 연락처)

## Style Notes
- Clean lines, generous whitespace
- Subtle hover animations (transform translateY(-2px))
- No gradients, flat colors only
- Focus on content hierarchy through typography
- Maximum readability through proper line-height and line-length
