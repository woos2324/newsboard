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

## 재개 지점 (2026-05-20, 24차 세션 종료)

**이번 세션 (24차) 완료**:
- **사설 수집 누락 버그 fix** (`collect_editorials.py`)
  - 원인: GitHub Actions cron 지연으로 KST 자정을 넘어 실행되면 `datetime.now(KST)`가 다음 날을 가리켜 전날 사설 누락 (특히 매일경제처럼 Naver가 다음날 버킷에 안 넣어주는 매체)
  - 수정: `--date` 미지정 시 어제+오늘 둘 다 수집. 기존 URL은 AI 재호출 없이 메타만 업데이트되므로 비용 증가 미미
  - 5/19 매일경제 누락 3건 수동 백필
- **Windows 인코딩 크래시 방지** (`collect_editorials.py`)
  - 한글 방점(〮 U+302E) 등 포함된 사설 제목을 cp949 콘솔에서 print 시 UnicodeEncodeError로 백필 중단
  - sys.stdout/stderr를 utf-8로 강제 reconfigure (Linux는 영향 없음)
- **사설 백필 진행**: 4월 전체 (~1,000건) + 3/25~3/31 (236건) 완료
- **opinion 모달 그룹핑 일관성 fix** (`EditorialModal.tsx`)
  - "같은 주제 타사 사설" 필터를 `topic`(7개 광의 분류) → `issue`(구체 쟁점)로 변경
  - TodayTab 헤드라인 그룹핑과 동일 기준 적용. 무관 사설 노출 방지
- **오늘의 사설 "매체별" 필터** (`TodayTab.tsx`)
  - 필터 옵션 4번째 "매체별" 추가 (전체/종합일간지/경제지/매체별)
  - 매체별 선택 시 매체 단위로 그룹핑 (세계일보 → 종합일간지 가나다 → 경제지 가나다)
  - 세계일보는 ★ 강조
- **/report 검색을 editorial 기반으로 전환**
  - `article.category=opinion`이 114건뿐이라 너무 적어 editorial 테이블(~2,000건) 사용
  - daily_report_article.article_id는 nullable로 저장, URL/제목/매체명/발행일 스냅샷 컬럼은 그대로
  - 모달 문구 "기사 검색" → "사설 검색"
- **Topbar 사설 제목 검색 기능** (신규 `SearchBar.tsx`)
  - editorial 제목 ILIKE 검색, 자동완성 드롭다운 최대 10건, 250ms debounce
  - 키보드 ↑↓/Enter/Esc 지원, 외부 클릭 시 닫힘
  - 결과 클릭 시 `?open=ID`만 갱신해 현재 날짜 보존 (리스트 그대로 유지)
  - 모달 backdrop(fixed inset-0 z-50) 클릭은 outside-click 무시해 dropdown 유지
  - 모달 닫을 때 `history.replaceState`로 `?open=` 조용히 제거 (새로고침 시 모달 재오픈 방지)
  - useSearchParams로 인한 prerender bailout 방지 위해 Suspense로 wrapping

**미완료 (다음 세션 이어받을 것)**:
- ⚠ **사설 과거 데이터 백필** — 4월 + 3/25~3/31 완료. 남은 구간 역순 진행:
  ```bash
  # 주 단위로 나눠서 실행 (타임아웃 방지)
  # 3월 남은 구간 (예상 비용 약 11,000원, gpt-4o)
  python -m scripts.collect_editorials --date-from 20260318 --date-to 20260324
  python -m scripts.collect_editorials --date-from 20260311 --date-to 20260317
  python -m scripts.collect_editorials --date-from 20260304 --date-to 20260310
  python -m scripts.collect_editorials --date-from 20260301 --date-to 20260303
  # 2월 전체 (예상 비용 약 13,000원)
  python -m scripts.collect_editorials --date-from 20260222 --date-to 20260228
  python -m scripts.collect_editorials --date-from 20260215 --date-to 20260221
  python -m scripts.collect_editorials --date-from 20260208 --date-to 20260214
  python -m scripts.collect_editorials --date-from 20260201 --date-to 20260207
  # 1월 전체 (예상 비용 약 14,000원)
  python -m scripts.collect_editorials --date-from 20260125 --date-to 20260131
  python -m scripts.collect_editorials --date-from 20260118 --date-to 20260124
  python -m scripts.collect_editorials --date-from 20260111 --date-to 20260117
  python -m scripts.collect_editorials --date-from 20260104 --date-to 20260110
  python -m scripts.collect_editorials --date-from 20260101 --date-to 20260103
  ```
  진행 전 OpenAI 결제 잔액 확인 필수 (호출당 ~$0.01, 주당 ~$2.50).
- ⚠ **cron-naver-pv 첫 GitHub Actions 실행 확인** — Actions 탭에서 stealth 로그인 동작 여부 미검증
- ⚠ **/traffic 페이지 UI 구현** — 기사 PV 순위 / 시간대별 조회수 / 유입 경로 + 검색 키워드 4탭
- ⚠ **/articles 페이지에 PV 컬럼 추가** — article_pv_snapshot.pv를 기사 목록에 표시
- ⚠ **subscriber_snapshot / daily_publication_count 보존 기간 미결정**
- ⚠ **미보도 탐지 3단계** (임베딩 기반) — article.body 수집 + NCP 이전 후
- ⚠ **StanceTab 차트 레이블 겹침** — 스태거드 방식 적용, 데이터 늘면 툴팁(Option B)으로 전환 검토
- ⚠ **On-demand Revalidation** — 수집 스크립트 완료 시 `/api/revalidate` 호출로 즉시 캐시 갱신
- ⚠ **/report 과거 보고서 아카이브 페이지** — 현재는 `?date=YYYY-MM-DD`로만 과거 조회 가능

## 다음 작업 로드맵

- **(당장) 사설 과거 데이터 백필** — 4월부터 역순으로 주 단위 실행 (위 명령어 참고)
- **(당장) cron-naver-pv GitHub Actions 동작 확인**
- **(당장) /traffic 페이지 UI 구현**
- **(당장) /articles 페이지 PV 컬럼 추가**
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
