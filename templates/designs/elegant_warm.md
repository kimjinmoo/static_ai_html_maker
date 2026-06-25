# Design Token - Elegant Warm

## Overview
세련된 세리프 폰트와 따뜻한 컬러 팔레트로 품격을 주는 디자인입니다. 로슈텔, 갤러리, 고급 레스토랑, 포트폴리오, 개인 브랜드에 적합합니다.

## Color Palette
- Primary: `#2d3436` (Charcoal) - 본문 텍스트, 헤더
- Secondary: `#d4a574` (Warm Gold) - 액센트, CTA, 구분선
- Accent: `#c9956b` (Deep Gold) - hover 상태
- Background: `#faf9f6` (Off White) - 페이지 배경
- Surface: `#ffffff` - 카드, 섹션 배경
- Text Primary: `#2d3436` - 본문 텍스트
- Text Secondary: `#636e72` - 설명 텍스트, 캡션
- Border: `#dfe6e9` - 구분선, 카드 테두리
- Muted: `#b2bec3` - 비활성화, placeholder

## Typography
- Heading Font: `'Playfair Display', Georgia, 'Times New Roman', serif`
- Body Font: `'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif`
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Source+Sans+3:wght@300;400;500;600&display=swap`

### Heading Scale (Serif)
- H1: 52px / 700 / line-height 1.15 / tracking -0.01em
- H2: 38px / 600 / line-height 1.2
- H3: 26px / 600 / line-height 1.3
- H4: 20px / 500 / line-height 1.4

### Body Scale (Sans-serif)
- Body Large: 18px / 300 / line-height 1.9
- Body: 16px / 400 / line-height 1.8
- Body Small: 14px / 400 / line-height 1.6
- Caption: 12px / 500 / line-height 1.5 / tracking 0.08em / uppercase

### Usage Guidelines
- H1, H2는 serif 폰트로 품격 강조
- 본문은 sans-serif로 가독성 확보
- 인용문은 serif italic, 20px, Secondary 컬러 좌측 border
- 섹션 라벨은 uppercase + tracking 0.08em + Text Secondary
- 숫자는 sans-serif, light weight (300)로 세련된 느낌

## Spacing System (4px base)
- xs: 4px - 아이콘과 텍스트 사이
- sm: 8px - 관련 요소 사이
- md: 20px - 컴포넌트 내부 패딩
- lg: 36px - 카드 사이 간격
- xl: 60px - 섹션 내부 여백
- xxl: 100px - 섹션 사이 여백
- xxxl: 140px - 히어로 섹션 여백

## Border Radius
- Small: 2px - 버튼, 입력 필드 (세련된 느낌)
- Medium: 6px - 카드, 모달
- Large: 12px - 큰 컨테이너
- None: 0px - 일부 카드 (클래식 스타일)

## Shadows
- Subtle: `0 2px 8px rgba(0,0,0,0.06)` - 기본 카드
- Medium: `0 4px 16px rgba(0,0,0,0.08)` - hover 상태
- Large: `0 12px 40px rgba(0,0,0,0.1)` - 모달, 오버레이

## Borders
- Accent: `1px solid #d4a574` - 섹션 구분, 강조
- Divider: `1px solid #dfe6e9` - 일반 구분선
- Card: `1px solid #dfe6e9` - 카드 테두리
- Hover: `1px solid #d4a574` - hover 시 액센트 변경

## Buttons
- Primary: bg `#2d3436`, text white, radius 2px, padding 14px 28px, letter-spacing 0.05em
- Secondary: bg transparent, border `#2d3436`, text `#2d3436`
- Accent: bg `#d4a574`, text white, radius 2px, padding 14px 28px
- Hover: bg color darken 5%, 또는 border color 변경
- Transition: all 0.3s ease

## Layout
- Max Width: 1100px (조금 좁아 집중도 높임)
- Container Padding: 24px (mobile), 48px (desktop)
- Grid Gap: 36px
- Section Padding: 100px vertical
- Navigation Height: 72px

## Components
- Navigation: 로고 중앙 또는 좌측, 세리프 폰트, minimal 메뉴
- Hero: 풀폭 배경 이미지 또는 오프화이트 배경 + 세리프 H1
- Card: padding 32px, border 1px, shadow subtle, hover 시 border accent
- Divider: 48px 너비, Secondary 컬러, 중앙 정렬
- Footer: bg `#2d3436`, text `#faf9f6`, minimal 링크

## Decorative Elements
- Section Divider: `<hr>` 스타일, Secondary 컬러, 48px 너비
- Corner Accent: ::before ::after로 모서리 장식
- Background Pattern: 미세한 noise texture 또는 linen pattern
- Image Frame: 4px padding + border 1px Secondary

## Animations
- Fade In: opacity 0 → 1, duration 0.8s ease
- Slide Up: translateY 30px → 0, duration 0.6s ease
- Hover Lift: translateY(-4px), shadow medium, duration 0.3s
- Underline: width 0 → 100%, duration 0.3s ease

## Style Notes
- Serif headings for elegance and sophistication
- Warm, inviting color palette with gold accents
- Thin accent borders for refined details
- Generous line-height for readability
- Minimalist with refined details, less is more
- High-quality imagery is essential for this style
