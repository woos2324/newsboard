# Newsboard — AI 기반 미디어 모니터링 대시보드

뉴스 조직 내부용 AI 미디어 모니터링 및 인사이트 대시보드 프로젝트.

상세 기획/설계 문서: [documents/](documents/) (PRD / IA / Use Case / ERD / Design)
판단 사항 아카이브: [documents/decisions.md](documents/decisions.md)
완료 작업 히스토리: [documents/history.md](documents/history.md)

---

## 핵심 아키텍처

- **단일 Vercel 프로젝트** (프론트 + Python API 공존, production: https://newsboard-two.vercel.app)
- **자사 매체**: **세계일보** (`normalized_name=segye`, `naver_media_id=022`, `is_our_company=TRUE`)
- **AI 백엔드**: OpenAI 직접 (`AI_BASE_URL=https://api.openai.com/v1`, `gpt-4o-mini` / `text-embedding-3-small`)
- **DB**: Supabase (project_ref: `zwgqzutknvbmronqkkzw`)
- **백엔드 Python**: FastAPI (Vercel Fluid Compute) — `/api/report/daily`, `/api/report/issue/{id}`
- **프론트**: Next.js 15 App Router + Tailwind + lucide-react. `next dev --turbopack` (Windows webpack 행 회피)
- **데이터 경로**: 단순 조회 → Next.js Server Component → `src/lib/queries.ts` → Supabase JS / AI·파이프라인 → FastAPI 또는 GitHub Actions Python scripts

## 자동화 파이프라인 (GitHub Actions, 9종)

| 워크플로 | 트리거 | 역할 |
|---|---|---|
| cron-ranking | 매시 7분 (UTC) | 50개 매체 × 20건 인기 랭킹 → article + snapshot |
| cron-cluster | ranking 성공 직후 + UTC :30 6h fallback | 미할당 article 임베딩 클러스터링 → issue_cluster |
| cron-gap | cluster 성공 직후 + UTC 01/07/13/19시 fallback | 클러스터 기반 미보도 탐지 → missed_issue_alert |
| cron-publications | 10분마다 (UTC :02~:52) | 자사 전체 기사 → article + daily_publication_count |
| cron-section-ranking | ranking 성공 직후 + UTC 02/08/14/20시 fallback | 섹션별 랭킹 → section_ranking_snapshot |
| cron-subscribers | UTC 23:00 (KST 08:00) | followers.json → subscriber_snapshot |
| cron-comments | 매시 15분 (UTC) | 자사·경쟁사 댓글 수 → comment_metric |
| cron-editorials | KST 06:00, 14:00, 22:00 (하루 3회) | 네이버 사설 수집 + AI 성향 분석 → editorial |
| cron-daily-briefing | UTC 15:00 (KST 00:00) | AI 일간 브리핑 → ai_summary |
| cron-cleanup | UTC 15:00 (KST 00:00) | 7일 이전 스냅샷 삭제 |

**cron chain**: `ranking → cluster → gap` (매시 자동 연쇄)

## DB 스키마 (마이그레이션 15건)

- `0001_init` — 11개 코어 테이블
- `0002` ~ `0006` — daily_publication_count, section_ranking, 성능 인덱스, section_ranking_unique, gap_verdict
- `0007~0012` — RLS 활성화 (전체 14개 테이블)
- `0013~0014` — editorial 인덱스 3개 (19차)
- `0015` — editorial.edition_date DATE 컬럼 추가 (20차)
- 마이그레이션 상세: [supabase/migrations/](supabase/migrations/)
- 매체 51개 (naver_media_id 보유 47개)

## 환경변수

**Vercel Production + GitHub Secrets (동일)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_LEGACY_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **필수**, Supabase Legacy `service_role` JWT(`eyJ...`). 신 포맷(`sb_secret_...`) 사용 시 Python 스크립트 전체 중단.
- `AI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY`, `DEFAULT_AI_MODEL=gpt-4o-mini`, `DEFAULT_EMBED_MODEL=text-embedding-3-small`

## 재개 지점 (2026-05-16, 20차 세션 종료)

**이번 세션 완료**:
- **edition_date 날짜 체계 도입** — `editorial` 테이블에 `edition_date DATE` 컬럼 추가 (마이그레이션 0015)
  - 한국 신문은 전날 밤 온라인 게재 → `published_at` KST 날짜 ≠ 신문 판 날짜 문제 해결
  - `collect_editorials.py`: Naver API 요청 날짜(`api_date`)를 `edition_date`로 저장
  - API page=1부터 수집 (HTML 스크래핑 + API 병합, URL 중복 제거)
  - `석간`/`조간` 키워드 필터 — 연합뉴스 단신 묶음 제외 (의도적 설계)
  - 과거 날짜 재수집: 05-13~15 수동 실행, 05-13 이전 데이터 삭제
- **DateNav 날짜 네비게이션** — opinion 메인 상단 `< 2026.05.16.토 📅 >`
  - 달력 아이콘 클릭 시 월별 달력 팝업, 날짜 선택으로 해당 날짜 사설 이동
  - 월 이동 / 오늘 버튼 / 미래 날짜 비활성화 / 일요일 빨간색 / 선택 날짜 파란 원
- **TrendTab edition_date 기준 수정**
  - `EDITORIAL_LIST_COLS` + `getSegyeEditorials` SELECT에 `edition_date` 추가
  - 주간/월간 필터링 및 목록 날짜 표시 모두 `edition_date` 기준으로 통일
- **TodayTab 세계일보 우선 정렬** — 토픽 그룹 내 `is_our_company=true` 기사 맨 앞으로
- **캐시 최적화** — `getTodayEditorials`에 `unstable_cache` 적용 (날짜별 5분 캐시)
- **cron-editorials 하루 3회** — KST 06:00 / 14:00 / 22:00 (기존 07:30 1회 → 3회)
  - 중복 기사는 AI 재분석 없이 필드 업데이트만 → 비용 추가 없음
- **cron-editorials workflow_dispatch date 파라미터 추가** — 수동 특정 날짜 재수집 지원

**미완료 (다음 세션 이어받을 것)**:
- ⚠ **과거 날짜 category backfill** — `python -m scripts.collect_publications --date 20260425` ~ `20260429` 수동 실행
- ⚠ **subscriber_snapshot / daily_publication_count 보존 기간 미결정**
- ⚠ **미보도 탐지 3단계** (임베딩 기반) — article.body 수집 + NCP 이전 후
- ⚠ **StanceTab 차트 레이블 겹침** — 스태거드 방식 적용, 데이터 늘면 툴팁(Option B)으로 전환 검토
- ⚠ **On-demand Revalidation** — 수집 스크립트 완료 시 `/api/revalidate` 호출로 즉시 캐시 갱신 (미구현)

## 다음 작업 로드맵

- **(당장) 과거 날짜 category backfill** — 2026-04-25~29 날짜별 수동 실행
- **(미래) 미보도 탐지 + 클러스터 품질 개선** — 설계 완료. 상세: `documents/decisions.md`
- **(미래) 성향 분석 정확도 개선** — `editorial_label` 테이블에 인간 레이블 충분히 쌓인 후 진행
  - 정확도 측정: `editorial_label` vs `editorial.stance_label` 비교 SQL로 일치율 계산
  - Few-shot 예시 추출: 레이블 일치 사례를 SYSTEM_PROMPT에 추가
  - 상세 6단계 성향 판단 프롬프트 적용 검토 (진보 지표 3개 + 보수 지표 3개 + 점수 산출)
- **(미래) 검색 기능** — Topbar 검색창 UI 주석 처리됨. 이슈 클러스터 제목/키워드 검색
- **(미래) 이메일 브리핑 자동 발송** — 매일 KST 9시 GitHub Actions cron
- **(미래) 기자 이름 기반 통계** — NCP 한국 IP 서버 구성 후 기자명 수집 재도입
- **(미래) NCP 전면 이전** — 사내 데이터 내재화 목적. 3단계 순서로 진행:
  - 1단계: GitHub Actions cron → NCP 수집서버 cron 이전 (1~2일)
  - 2단계: Supabase → NCP PostgreSQL 이전 — `supabase-js` → `pg` 교체, `queries.ts` 전면 수정, RLS 제거 (3~5일, 핵심 난관)
  - 3단계: Vercel → NCP 웹서버 이전 — nginx + PM2, GitHub Actions CD 워크플로 추가 (1~2일)
  - 구성: 웹서버 1대 (80/443 외부 오픈) + 수집서버 1대 (크롤링, 한국 IP) + DB서버 1대 (내부망만 허용, ACG 설정)

---

## 프로젝트 구조

```
d:\newsboard\
├── documents/            # 기획·설계 문서 + decisions.md + history.md
├── src/
│   ├── app/              # Next.js App Router 페이지
│   │   ├── page.tsx      # 대시보드
│   │   ├── issue/[cluster_id]/page.tsx
│   │   ├── gap/          # 미보도 탐지
│   │   ├── compare/      # 경쟁사 비교
│   │   ├── trending/     # 실시간 트렌드
│   │   ├── articles/     # 자사 기사 현황
│   │   ├── analytics/    # 구독자·댓글 분석
│   │   └── report/       # AI 리포트
│   ├── components/       # Sidebar, Topbar, dashboard/*
│   └── lib/
│       ├── queries.ts    # 모든 DB 조회 함수
│       ├── supabase.ts   # Supabase JS 클라이언트
│       └── database.types.ts
├── api/                  # Python FastAPI (Vercel Fluid Compute)
│   ├── index.py
│   ├── lib/              # db.py, ai.py, models.py
│   └── routes/           # issues, ranking, gap, report 등
├── scripts/              # GitHub Actions Python 스크립트
│   ├── collect_ranking.py
│   ├── collect_publications.py
│   ├── collect_comments.py
│   ├── collect_trends.py
│   ├── cluster_articles.py
│   ├── detect_gap.py
│   └── lib/              # db.py, http.py, naver.py, cluster.py
├── .github/workflows/    # GitHub Actions (9종)
├── supabase/migrations/  # DB 마이그레이션 (0001~0012)
├── vercel.json
└── .env.local.example
```

---

## 디자인 시스템

원천: [documents/5)Design.md](documents/5\)Design.md)

- **색**: primary `#1E40AF`/`#1E3A8A`, bg `#F9FAFB`, fg `#111827`, muted `#6B7280`, border `#E5E7EB`
- **CSS 유틸**: `.card`, `.badge badge-{success|warning|error|muted}` — [src/app/globals.css](src/app/globals.css)
- **레이아웃**: `<Sidebar />` + `<Topbar />` + `<main>`. 새 페이지는 기존 page.tsx 구조 그대로.

## 데이터 모델

원천: [documents/4)ERD.md](documents/4\)ERD.md) — 핵심 엔티티 11개. PK: `BIGSERIAL`, 시각: `TIMESTAMPTZ`, 상태값: CHECK 제약.

## 코딩 규약

- **FastAPI**: Pydantic 모델 응답. 라우터 = `api/routes/<domain>.py` 1파일 1도메인.
- **Next.js**: Server Components 기본. 클라이언트 상호작용만 `"use client"`.
- **Tailwind**: 기존 `.card`/`.badge` 유틸 재사용. 임의 HEX 금지.

## Supabase MCP

`.mcp.json` 등록. 주요 툴: `list_tables`, `apply_migration(name, query)`, `execute_sql(query)`, `generate_typescript_types`

## 개발 실행

```bash
npm run dev          # 프론트 (turbopack)
vercel dev           # 프론트 + Python API 동시
pip install -r requirements.txt
```

## 다른 PC 셋업

```powershell
git clone https://github.com/woos2324/newsboard.git
cd newsboard
npm install
pip install -r requirements.txt
cp .env.local.example .env.local  # 값 채우기
npm run dev
```

**필수**: `.env.local`은 gitignore — 이전 PC에서 복사하거나 Supabase/OpenAI 콘솔에서 재발급.
**Supabase 키**: 반드시 Legacy 탭의 JWT(`eyJ...`) 포맷 사용 (신 포맷 `sb_secret_...` 불가).

새 세션 시작 시:
```
d:\newsboard 작업 이어가자. CLAUDE.md 확인해줘.
```
