# 디자인 가이드: AI 기반 미디어 모니터링 대시보드

---

## 1. Design System Overview

본 디자인 시스템은 **데이터 기반 의사결정**, **빠른 스캔**, **신뢰성 있는 정보 전달**을 목표로 한다.

핵심 원칙:
- 정보 우선 (Data First)
- 시각적 계층 구조 명확화
- AI vs Raw Data 분리
- 최소한의 색상, 최대한의 가독성

---

## 2. Color Palette (Tailwind 기준)

| Token | HEX | 설명 |
|------|------|------|
| primary-500 | #1E40AF | 메인 액션 |
| primary-600 | #1E3A8A | hover |
| background | #F9FAFB | 기본 배경 |
| foreground | #111827 | 텍스트 |
| muted | #6B7280 | 보조 텍스트 |
| border | #E5E7EB | 경계선 |
| success | #16A34A | 긍정 |
| warning | #D97706 | 경고 |
| error | #DC2626 | 오류 |

### Tailwind 설정 예시

```js
theme: {
  extend: {
    colors: {
      primary: {
        500: '#1E40AF',
        600: '#1E3A8A'
      }
    }
  }
}
```

---

## 3. Typography

| 요소 | 폰트 | 크기 |
|------|------|------|
| Heading | Inter / Noto Sans KR | 20~28px |
| Body | Noto Sans KR | 14~16px |
| Caption | Noto Sans KR | 12px |

---

## 4. 페이지 설계

### 4.1 Overview Dashboard

목적:
- 전체 상황 빠르게 파악

구성:
- 주요 이슈 카드
- 랭킹 뉴스
- 낙종 알림
- 구독자 변화

레이아웃:
- Grid (3~4 columns)

이미지 예시:
https://picsum.photos/800/400

---

### 4.2 Issue Cluster

목적:
- AI 이슈 이해

구성:
- 버블 차트
- 키워드 리스트
- 기사 리스트

---

### 4.3 Missed Issue

목적:
- 낙종 확인

구성:
- Alert Table
- Priority Badge

---

## 5. Layout Components

| 컴포넌트 | 설명 |
|------|------|
| Sidebar | 주요 메뉴 |
| Topbar | 검색/날짜 |
| Content | 데이터 영역 |

---

## 6. Dashboard Card 가이드

| 상태 | 스타일 |
|------|------|
| Default | border + white |
| Hover | shadow |
| Alert | red border |

---

## 7. Interaction Patterns

- 클릭 → 상세
- Hover → Tooltip
- 필터 → 즉시 반영

---

## 8. Breakpoints

| 구간 | px |
|------|------|
| mobile | 320 |
| tablet | 768 |
| desktop | 1024 |
| wide | 1440 |

---

## 9. 접근성 가이드

- 최소 4.5:1 대비
- 키보드 탐색 지원
- aria-label 사용

---

## 10. WCAG 체크리스트

- 텍스트 대비 4.5 이상
- 버튼 명확한 상태
- focus visible

---
