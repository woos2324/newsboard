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

## 자동화 파이프라인 (GitHub Actions, 10종)

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
| **cron-naver-pv** | **매시 30분 (UTC)** | **네이버 파트너센터 PV 수집 → 4개 테이블** |

**cron chain**: `ranking → cluster → gap` (매시 자동 연쇄)

## DB 스키마 (마이그레이션 19건)

- `0001_init` — 11개 코어 테이블
- `0002` ~ `0006` — daily_publication_count, section_ranking, 성능 인덱스, section_ranking_unique, gap_verdict
- `0007~0012` — RLS 활성화 (전체 14개 테이블)
- `0013~0014` — editorial 인덱스 3개 (19차)
- `0015` — editorial.edition_date DATE 컬럼 추가 (20차)
- `0016` — PV 데이터 4개 테이블 (article_pv_snapshot, hourly_pv_snapshot, traffic_source_daily, search_keyword_daily) (21차)
- `0017` — article_pv_snapshot.article_url 컬럼 추가 (21차)
- `0018` — naver_session 쿠키 캐시 테이블 (21차)
- `0019` — daily_report / daily_report_section / daily_report_article 3개 테이블 (사설 일일 동향 보고서, 22차)
- 마이그레이션 상세: [supabase/migrations/](supabase/migrations/)
- 매체 51개 (naver_media_id 보유 47개)

## 환경변수

**Vercel Production + GitHub Secrets (동일)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_LEGACY_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **필수**, Supabase Legacy `service_role` JWT(`eyJ...`). 신 포맷(`sb_secret_...`) 사용 시 Python 스크립트 전체 중단.
- `AI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY`, `DEFAULT_AI_MODEL=gpt-4o-mini`, `DEFAULT_EMBED_MODEL=text-embedding-3-small`
- `NAVER_PARTNER_ID`, `NAVER_PARTNER_PW` — 네이버 파트너센터 공용계정 (GitHub Secrets + .env.local)

**로컬 .env.local 추가 항목** (GitHub Secrets에 없는 것):
- `HEADLESS=0` — Playwright 브라우저 표시 (로컬 디버깅용, 운영은 기본값 1)

## 재개 지점 (2026-05-21, 27차 세션 종료)

**이번 세션 (27차) 완료** — UI 디테일 정리 + 대시보드 KPI 재구성 + 성능 최적화:

- **`/traffic` 페이지 UI 디테일**
  - 유입 경로 도넛 차트 확대 + 세로 배치 (144px → 240px, 가로→세로 배치, gap 28px, 폰트 키움)
  - subtitle 문구 정확화: "매시 30분 자동 갱신" → "매일 KST 01:00 갱신 (일간 매일 · 주간 월요일 · 월간 1일)"
  - footer 우측 텍스트 삭제
  - **한국 증시 컬러 컨벤션 적용** — 상승=빨강 / 하락=파랑 (KPI 총조회수 / 시간대 차트 / 시간대 상세표 Δ 3곳)

- **PageShell 헤더 통합 + 날짜 네비 위치 변경**
  - PageShell의 title/description optional 처리 (필요시 페이지가 자체 렌더)
  - traffic/articles 페이지 헤더를 "title 좌측 + 날짜 네비 우측" 형태로 통일
  - articles 날짜 네비를 기사 목록 카드 하단 → 페이지 상단으로 이동
  - ArticleDateNav 폰트를 traffic과 동일 스타일로 통일 (text-lg font-bold tracking-tight)

- **대시보드 KPI 카드 재구성**
  - 순서 변경: 자사 오늘 기사 / **조회수 (전일기준)** / 자사 총 구독자 / 댓글 반응
  - "자사 일일 구독자 증감" 카드 제거
  - 신규 "조회수" 카드: `daily_cv_snapshot` 어제 PV, 그저께 대비 delta
  - `StatCard`에 `sublabel` prop 추가 (작은 글씨 부제 — "(전일기준)" 표시용)
  - 4개 카드 모두 **클릭 시 관련 페이지로 이동** (`href` prop — /articles, /traffic, /analytics/subscribers, /analytics/comments)
  - 아이콘 재배치: 조회수=Eye, 자사 총 구독자=Users

- **성능 최적화 — `unstable_cache` 적용** ⭐ 가장 큰 성과
  - 문제: searchParams 사용 페이지(dynamic)는 `revalidate` 설정이 **완전히 무시**되어 매 요청마다 Supabase 쿼리 실행
  - 응답 헤더 진단: `Cache-Control: no-cache, no-store, max-age=0`, `X-Vercel-Cache: MISS`
  - 해결: 데이터 페칭 레이어에 `unstable_cache` 래핑
    - `getTrafficPageData`: 24h 캐시 (KST 01:00 1회 수집)
    - `getDailyCvHistory`: 24h
    - `getLatestTrafficDate`: 1h
    - `getOurArticlesPage`: 10min (cron-publications 주기 일치)
  - 효과: **/traffic 800~1700ms → 540~840ms** (warm cache, ~50% 개선), **/articles 1800ms → 470~500ms** (warm, ~75% 개선)

- **Vercel 자동 배포 이슈 발견**
  - newsboard는 git push로 자동 배포되는 게 정상이지만 webhook이 트리거되지 않는 경우 발견
  - 빈 커밋 push도 재트리거 안 됨 → 이번 세션 내내 `vercel --prod --yes` 수동 배포 사용
  - 원인 추정: Vercel "Ignored Build Step" 또는 GitHub webhook 일시 지연
  - 다음 세션에서 Vercel 대시보드 → newsboard → Settings → Git 확인 필요

**미완료 (다음 세션 이어받을 것)**:
- ⚠ **사설 과거 데이터 백필** — 4월 + 3/25~3/31 완료, 남은 구간 역순 진행:
  ```bash
  python -m scripts.collect_editorials --date-from 20260318 --date-to 20260324
  python -m scripts.collect_editorials --date-from 20260311 --date-to 20260317
  python -m scripts.collect_editorials --date-from 20260304 --date-to 20260310
  python -m scripts.collect_editorials --date-from 20260301 --date-to 20260303
  # ... 2월, 1월 순서로 계속
  ```
- ⚠ **트래픽/기사 페이지 추가 성능 최적화** (현재 warm cache 540~840ms, 더 빠르게):
  - **Streaming SSR + Suspense** — 헤더/KPI 먼저 보이고 차트·모달 데이터는 점진 로딩 (체감 속도 큰 향상 예상)
  - **클라이언트 캐시 (SWR/React Query)** — 페이지 간 이동 시 즉시 표시 + 백그라운드 재검증
- ⚠ **Vercel 자동 배포 webhook 안정화 확인** — 대시보드에서 Git 연동 상태 + Ignored Build Step 점검
- ⚠ **/traffic 인터랙티브 추가 기능** — 매칭 기사 양방향 점프, 디바이스별 시간대 차트
- ⚠ **subscriber_snapshot / daily_publication_count 보존 기간 미결정**
- ⚠ **미보도 탐지 3단계** (임베딩 기반) — article.body 수집 + NCP 이전 후
- ⚠ **StanceTab 차트 레이블 겹침** — 스태거드 방식 적용
- ⚠ **On-demand Revalidation** — 수집 스크립트 완료 시 `/api/revalidate` 호출로 즉시 캐시 갱신
- ⚠ **/report 과거 보고서 아카이브 페이지**

---

**지난 세션 (26차) 완료**:
- **`/traffic` 페이지 UI 전체 완성** — page.tsx + HourlyChart + ArticleListModal + KeywordListModal + TotalPvModal + TrafficContent + DateDeviceSelector
  - KPI 4개 / 인기기사 Top25 / SVG 시간대 차트(출근·점심·퇴근 구간 음영) / 유입경로 도넛 / 키워드 Top15
  - 날짜 네비게이터 + 디바이스 토글(클라이언트 state)
  - 시간대별 PV 상세표(오늘/어제/Δ), 오늘 데이터 없을 때 마지막 수집일 fallback
- **모달 인터랙티브 기능**
  - ArticleListModal: 전체/PC/모바일 + 섹션 탭 + 제목·기자 검색 + 정렬 + CSV + 30건 페이저
  - KeywordListModal: 키워드 검색 + CSV
  - TotalPvModal (총 조회수 더보기): 일간/주간/월간 탭 + 섹션 탭 + 날짜별 전체/PC/모바일 테이블
- **PV 수집 확장** (`collect_naver_pv.py`)
  - device 3종 × section 10종 루프, `연예` 섹션 버그 fix
  - `/api/visitV2/cv` 추가 → `daily_cv_snapshot` (섹션·디바이스별 실제 PV)
  - 주간(월요일)/월간(매월 1일) 자동 수집 + 수동 백필 완료
- **DB 마이그레이션 0020** — `article_pv_snapshot.time_dimension` 컬럼 + `daily_cv_snapshot` 신규 테이블
- **`/articles` PV 컬럼 추가** — `OurArticleItem.pv`, `fetchArticlePvMap()`, `👁 X.Xf만` 배지
- **cron-naver-pv 스케줄 변경** — 매시 30분 → 매일 KST 01:00 1회
- **API 라우트 신규 3개** — /api/traffic/page-data, article-pv, daily-cv

## 다음 작업 로드맵

- **(당장) 사설 과거 데이터 백필** — 3월 남은 구간부터 역순으로 주 단위 실행
- **(당장) 트래픽/기사 페이지 추가 성능 최적화** — Streaming SSR + Suspense / 클라이언트 캐시(SWR or React Query)
- **(당장) Vercel 자동배포 webhook 안정화** — 대시보드 Git 연동 상태 + Ignored Build Step 확인
- **(미래) /traffic 인터랙티브 추가** — 매칭 기사 양방향 점프, 디바이스별 시간대 차트
- **(미래) 편집회의 자동 일간 보고서** — 기존 데이터 + PV 통합한 매일 아침 보고서
- **(미래) 미보도 탐지 + 클러스터 품질 개선** — 설계 완료. 상세: `documents/decisions.md`
- **(미래) 성향 분석 정확도 개선** — `editorial_label` 테이블에 인간 레이블 충분히 쌓인 후 진행
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
│   ├── collect_naver_pv.py   # 네이버 파트너센터 PV 수집 (21차)
│   └── lib/              # db.py, http.py, naver.py, cluster.py, naver_pv_json_parser.py
├── opinion/              # 별도 Next.js 앱 (사설 분석 도메인, opinion-eta.vercel.app)
│   ├── src/app/
│   │   ├── page.tsx              # 오늘의 사설
│   │   ├── stance/               # 성향 비교 (사이드바 주석 처리됨)
│   │   ├── trend/                # 세계일보 트렌드
│   │   ├── label/                # 성향 레이블링
│   │   └── report/               # 사설 일일 동향 보고서 (22차)
│   ├── src/components/   # OpinionShell, EditorialModal, ArticleSearchModal, DateNav, ...
│   └── src/lib/          # queries.ts, supabase.ts, supabase-admin.ts, report-queries.ts, media-colors.ts
├── .github/workflows/    # GitHub Actions (10종)
├── supabase/migrations/  # DB 마이그레이션 (0001~0019)
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
npm run dev          # newsboard 프론트 (turbopack)
vercel dev           # newsboard 프론트 + Python API 동시
pip install -r requirements.txt

cd opinion           # opinion 앱은 별도
npm run dev
```

## 배포

**newsboard (메인)**: production `https://newsboard-two.vercel.app`

**opinion**: production `https://opinion-eta.vercel.app`
- ⚠ **GitHub 미연동 — 수동 배포 필수** (git push로 자동 배포 안 됨)
- 배포 명령:
  ```powershell
  cd opinion
  vercel --prod --yes
  ```
  (30~60초 소요)
- Vercel 프로젝트 ID: `prj_MOzajSwRz774IxlzgBsQ13AAXzjD` (woos2324/opinion)
- 등록된 환경변수 (Vercel Production):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (조회용)
  - `SUPABASE_SERVICE_ROLE_KEY` (Server Action mutation용, JWT eyJ... 포맷 필수)
- 새 환경변수 추가: `vercel env add <NAME> production` (인터랙티브 stdin)
- 자동 배포 원하면: Vercel 대시보드 → opinion → Settings → Git → GitHub 연결 + Root Directory `opinion` 설정

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
