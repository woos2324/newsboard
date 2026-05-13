# 완료 작업 히스토리

세션별 완료 작업 전체 기록. 새 세션에서는 읽을 필요 없음 — CLAUDE.md 재개 지점만 확인.

---

## 16차 세션 (2026-05-13)
- **RLS trending_keyword 적용** — 0012 마이그레이션. Supabase 보안 경고 해소.
- **사설 분석 기능 UI 샘플** — `_editorial_preview.html`. 탭 3개(오늘의 사설/성향 비교/세계일보 트렌드) + 상세 모달. 주간/월간 토글 포함.
- **CLAUDE.md 구조 정리** — 판단 사항 → `documents/decisions.md`, 완료 작업 → `documents/history.md` 분리.

## 15차 세션 (2026-05-12)
- **미보도 탐지(/gap) 경쟁사 수 불일치 수정** — reason 텍스트 live `competitors` 배열로 동적 계산, 매체명 목록 제거. detect_gap.py `[:3]` 이름 제한 제거.
- **미보도 탐지(/gap) 유사도 % 위치 개선** — 자사 유사 기사 링크 옆으로 이동.
- **구독자 분석 default 선택 세계일보만** — `buildInitialSelectedMedia()` isPinned 항목만 반환.
- **cron-publications 10분 주기** — 30분 → 10분(UTC :02,:12,:22,:32,:42,:52).
- **trending_keyword 7일 보존** — cleanup_old_data.py에 추가.
- **실시간 트렌드 시간 KST 표시** — `formatFetchedAt()` UTC → KST(+9) 변환.
- **트렌드 자사보도 매칭 로직 개선** — 클러스터 기반 우선 + 키워드 폴백. `_match_cluster()` 제목 유사도 신호 추가, 임계값 0.2 → 0.5 상향.

## 14차 세션 (2026-05-10)
- **실시간 트렌드 카드 전면 개편** — 2열 그리드, AI 요약 상단, 자사보도 레이블+링크, 제목 추천(①②③). 0011 마이그레이션(`title_suggestions TEXT[]`).
- **대시보드 랭킹뉴스 UX 개선** — 전체 모드 순번 idx+1, 매체명 제목 우측으로 이동.
- **대시보드 인기 댓글 기사 제목 클릭 링크** — url 있을 때 외부 링크 연결.
- **AI 이슈 요약 생성/재생성 복구** — Vercel Production env의 빈 `SUPABASE_SERVICE_ROLE_KEY` 교체. supabase-py UPDATE 후 별도 SELECT로 수정.
- **자사기사현황 기사 수 불일치 수정** — `getOurArticlesPage()` 트렌드/전일 카운트를 `article` 테이블 COUNT로 통일.
- **네이버 섹션 코드 104/105 매핑 수정** — `NAVER_SECTIONS` 104↔105 스왑. DB article.category it↔world 일괄 UPDATE (215건).
- **트렌드 AI 중복 생성 최적화** — 1시간 내 동일 키워드 DB 재사용. GPT 비용 ~1/6 절감.
- **트렌드 시간 표시 KST 수정** — `TrendingKeywords.tsx` UTC+9 변환. `/trending` fetchedAt을 배치 내 최신값으로.

## 13차 세션 이전
- **AI 요약 파이프라인** — `api/lib/ai.py`, `api/routes/report.py`, `POST /api/report/daily`, `POST /api/report/issue/{cluster_id}`
- **이슈 상세 페이지** — `src/app/issue/[cluster_id]/page.tsx`
- **데이터 수집 스크립트** — ranking, subscribers, publications, section_ranking, comments
- **AI 클러스터링 파이프라인** — `scripts/cluster_articles.py`, 그리디+centroid
- **GitHub Actions 자동화** — 9개 cron 워크플로 + chain (ranking→cluster→gap)
- **자사 매체 = 세계일보** — `is_our_company` 플래그 segye로 이전
- **Vercel 배포** — production https://newsboard-two.vercel.app
- **/compare 경쟁사 비교** — 인기 랭킹 + 섹션별 랭킹 탭, 언론사 칩 선택 UI
- **구독자 분석** — 표형 UI + 체크박스 → 차트 연동 + 구독자수/증감수 토글
- **댓글 반응 분석** — 자사/경쟁사 분리, /analytics/comments 페이지
- **미보도 탐지 파이프라인** — `scripts/detect_gap.py`, cron-gap chain, 검토 버튼
- **자사 전체 기사 수집** — `scripts/collect_publications.py` 기사 제목·URL → article 테이블
- **댓글 수집 Playwright → httpx 전환** — Naver JSONP API 직접 호출. objectId `news{oid},{aid}` 수정.
- **클러스터 re-absorption** — `_load_recent_clusters` + `_find_similar_cluster` 구현
- **AI 일간 브리핑 불릿 → 이슈 링크** — bullets `{text, cluster_id, cluster_title}` 형식, per-bullet 아이콘
- **AI 리포트 날짜 KST 기준 수정** — `summary_date`를 KST 기준으로
- **RLS 활성화 (0007~0012)** — 전체 14개 테이블 rowsecurity=true
- **Topbar 날짜+시간 표시** — 1분 자동 갱신
- **대시보드 랭킹뉴스 전 매체 표시** — `getRankingNews` + 매체 드롭다운
- **미보도 탐지 개선 (verdict 2차 검증)** — bigram+키워드 검증, DB 0006 마이그레이션
- **구글 급상승 검색어 통합** — `trending_keyword` 테이블, `collect_trends.py`, TrendingKeywords 컴포넌트
- **실시간 트렌드 전용 페이지 (/trending)** — 통계 카드 + 키워드 카드 그리드
- **실시간 트렌드 AI 요약** — gpt-4o-mini 키워드별 2문장 요약
- **모바일 반응형 사이드바** — `AppShell.tsx` 햄버거 메뉴 + 오버레이
- **자사 기사 현황 페이지 (/articles)** — stat 카드, 7일 트렌드 차트, 섹션 분포, 기사 목록 + 페이지네이션
- **7일 데이터 보존 정책** — `cleanup_old_data.py` + cron-cleanup
- **GitHub Actions cron 복구** — RLS 이후 Legacy JWT 키로 교체
- **랭킹뉴스 수집 20건으로 확장** — cron-ranking default 20
