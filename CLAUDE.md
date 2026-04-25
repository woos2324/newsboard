# Newsboard — AI 기반 미디어 모니터링 대시보드

뉴스 조직 내부용 AI 미디어 모니터링 및 인사이트 대시보드 프로젝트.

상세 기획/설계 문서는 [documents/](documents/) 참조 (PRD / IA / Use Case / ERD / Design).

---

## 현재 진행 상태 (2026-04-25)

새 세션 시작 시 가장 먼저 확인할 진행 현황 체크포인트.

### 아키텍처 결정
- **단일 Vercel 프로젝트** (프론트 + Python API 공존)
- **AI 제공자**: Vercel AI Gateway (`anthropic/claude-opus-4-6` 기본 모델)
- **DB**: Supabase (project_ref: `zwgqzutknvbmronqkkzw`)
- **백엔드**: Python FastAPI (Vercel Fluid Compute, Python 3.13)
- **프론트**: Next.js 15 App Router + Tailwind + lucide-react
- **데이터 경로 (하이브리드)**:
  - 단순 조회(리스트·상세·집계)는 **Next.js Server Component → [src/lib/queries.ts](src/lib/queries.ts) → Supabase JS 직접**
  - AI 생성·무거운 파이프라인은 **FastAPI (`/api/*`) 경유**

### 완료된 작업
- [x] Supabase 스키마 적용 (`0001_init` 마이그레이션, 11개 테이블)
- [x] 시드 데이터 주입 (언론사 9, 기사 8, 클러스터 3, 관계·랭킹·구독자·댓글·알림·AI요약 샘플)
- [x] `.env.local` 생성 — URL + publishable key 자동 주입, `SUPABASE_LEGACY_ANON_KEY` 백업 저장
- [x] [src/lib/database.types.ts](src/lib/database.types.ts) — Supabase MCP로 생성한 전체 스키마 타입
- [x] 의존성 설치 (pip: `httpx>=0.26,<0.28` 로 완화해야 supabase 2.10.0 호환 / npm: `@supabase/supabase-js`)
- [x] [src/lib/supabase.ts](src/lib/supabase.ts) — 서버용 싱글톤 클라이언트 (service_role 우선, anon 폴백)
- [x] [src/lib/queries.ts](src/lib/queries.ts) — 도메인별 타입 고정 쿼리 11개
- [x] 프론트 7개 페이지 실DB 연결 (`/`, `/issue`, `/compare`, `/gap`, `/analytics/subscribers`, `/analytics/comments`, `/report`)
- [x] **A) AI 요약 파이프라인** — [api/lib/ai.py](api/lib/ai.py) (JSON 구조 출력), [api/routes/report.py](api/routes/report.py) (클러스터 기반 + upsert), [src/components/GenerateReportButton.tsx](src/components/GenerateReportButton.tsx), `POST /api/report/daily`, `POST /api/report/issue/{cluster_id}`
- [x] **B) 이슈 상세 페이지** [src/app/issue/\[cluster_id\]/page.tsx](src/app/issue/[cluster_id]/page.tsx) — 클러스터 + 기사 목록 + AI 이슈 요약 카드, 리스트에서 `<Link>` 연결
- [x] **C) 시드 확장 (경쟁사 구독자)** — [supabase/seed.sql](supabase/seed.sql) 에 8개 경쟁사 × 7일 `subscriber_snapshot` (`source='naver'`) 추가. `/analytics/subscribers` 경쟁사 블록 실데이터로 채워짐 (최신 481.2K~76.2K, 7일 delta -0.3~+3.2%).
- [x] **D-(a) 데이터 수집 스크립트** — [scripts/](scripts/) 디렉토리 신설. `scripts/lib/{db,http,naver}.py` 공통, [scripts/collect_subscribers.py](scripts/collect_subscribers.py) (네이버 press 페이지 → `subscriber_snapshot` upsert + daily/seven_day delta 자동 계산), [scripts/collect_ranking.py](scripts/collect_ranking.py) (네이버 매체별 인기 랭킹 → `article` upsert + `ranking_news_snapshot/item` 적재). `--media`, `--limit`, `--dry-run` 플래그. requirements.txt 에 `beautifulsoup4==4.12.3` 추가.
- [x] **D-(b) AI 클러스터링 파이프라인** — [api/lib/ai.py](api/lib/ai.py) 에 `embed()` (Vercel AI Gateway `/v1/embeddings`, 기본 `openai/text-embedding-3-small`) + `generate_cluster_metadata()` 추가. [scripts/lib/cluster.py](scripts/lib/cluster.py) 에 cosine·greedy 클러스터링·centroid running mean·representative 선정. [scripts/cluster_articles.py](scripts/cluster_articles.py) 에서 미할당 기사(`issue_cluster_article` 에 없는)만 뽑아 임베딩 → 그리디 클러스터 → AI 메타(title/summary/keywords) → `issue_cluster` + `issue_cluster_article` 적재. `--hours`, `--threshold`, `--min-size`, `--dry-run` 플래그.
- [x] **D-(c) GitHub Actions 자동화** — Vercel Cron 대신 **GitHub Actions** 채택 (Hobby 무료 티어가 일 1회 제한이라 우회). [.github/workflows/cron-ranking.yml](.github/workflows/cron-ranking.yml) 매시 정각 / [.github/workflows/cron-cluster.yml](.github/workflows/cron-cluster.yml) 6시간마다 30분 / [.github/workflows/cron-daily-briefing.yml](.github/workflows/cron-daily-briefing.yml) UTC 15:00 (=KST 00:00). 각 워크플로 `workflow_dispatch` 입력으로 수동 트리거 + 인자 오버라이드 지원. [scripts/generate_daily_briefing.py](scripts/generate_daily_briefing.py) 신규 — FastAPI 의존 없이 standalone 실행되는 일간 브리핑 CLI (cron 진입점).

### ⚠️ 사용자가 직접 채워야 할 env
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 대시보드 → Settings → API → `service_role` (MCP로 못 가져옴, 옵션)
- AI 백엔드는 다음 중 **하나** 채우면 동작:
  - `AI_GATEWAY_API_KEY` (Vercel AI Gateway 사용 시), 또는
  - `OPENAI_API_KEY` + `AI_BASE_URL=https://api.openai.com/v1` + `DEFAULT_AI_MODEL=gpt-4o-mini` + `DEFAULT_EMBED_MODEL=text-embedding-3-small` (OpenAI 직접 호출 시) — **현재 사용자는 이 옵션으로 동작 확인됨**

### 재개 지점 (2026-04-25 세션 종료)
이번 세션에서 D-(b) 까지 완료. 마지막 검증 상태:
- `python -m scripts.cluster_articles --dry-run` → DB 연결 OK, 미할당 4건 발견, 임베딩 호출 OK 까지 확인
- 미할당 기사들의 실제 클러스터링/메타 생성 + DB 적재 결과는 **아직 미검증** (dry-run 만 통과)
- 이전 세션에서 권장한 다음 액션:
  1. **(권장) 옵션 1**: 실 적재 검증 — `python -m scripts.cluster_articles` (dry-run 없이) 실행 → `npm run dev` 후 `http://localhost:3000/issue` 에서 새 클러스터 카드 확인
  2. **(메인) 옵션 2 = D-(c)**: Vercel Cron 자동화 코드 작성
  3. **(보너스) 옵션 3**: 시드 다양화 (랭킹/낙종 추가)

### 다음 작업 로드맵
- **(보너스) 시드 다양화** — `ranking_news_snapshot/item` 를 8개 매체 × 일 1회로 확장 → `/compare` 풍성, `missed_issue_alert` 2~3건 추가해 priority 다양화.
- **(보너스) Vercel 배포** — 프론트엔드를 Vercel 에 배포. 데이터 파이프라인은 GitHub Actions 가 담당하니 배포는 단순 정적/SSR 호스팅 목적.
- **(미래) 셀렉터 견고화** — 첫 cron 실행 후 [scripts/lib/naver.py](scripts/lib/naver.py) 의 selector 가 실제 작동하는지 GitHub Actions 로그로 확인 후 갱신.

### 판단 사항 (D-(a) 시점)
- **네이버 셀렉터 다중 시도**: [scripts/lib/naver.py](scripts/lib/naver.py) 의 `_RANKING_LIST_SELECTORS`, `_TITLE_SELECTORS`, `_SUBSCRIBER_PATTERNS` 는 우선순위 리스트로 실시간 검증 안 된 상태. 첫 실행 시 `--dry-run` 으로 매체별 파싱 결과 확인 후 셀렉터 갱신.
- **Delta 계산 정책**: `daily_delta` = (오늘 - 가장 최근의 *어제 이전* 스냅샷). `seven_day_delta` = (오늘 - 7일 이전 시점의 가장 가까운 이전 스냅샷). 동일 일자 재실행해도 delta 가 0 으로 깨지지 않도록 `lt(snapshot_date, today)` 사용.
- **upsert 전략**: 구독자 = `(media_company_id, snapshot_date, source)` UNIQUE 키 활용. 랭킹 = `article.url` UNIQUE 키 활용 + 매 실행마다 새 `ranking_news_snapshot` row 추가 (스냅샷 누적이 의도).

### 판단 사항 (AI 백엔드 — Gateway / OpenAI 직접 분기)
- [api/lib/ai.py](api/lib/ai.py) 는 `AI_BASE_URL` 환경변수로 백엔드 분기:
  - 미설정 → Vercel AI Gateway (기본 모델: `anthropic/claude-opus-4-6` / `openai/text-embedding-3-small`)
  - `https://api.openai.com/v1` → OpenAI 직접 (기본 모델: `gpt-4o-mini` / `text-embedding-3-small`)
- API 키 우선순위: `AI_GATEWAY_API_KEY` → `OPENAI_API_KEY`. 둘 중 하나만 있으면 됨. PLACEHOLDER 시작 문자열은 자동 무시.
- Vercel AI Gateway 의 모델명은 `provider/model` 형태 (`anthropic/claude-opus-4-6`), OpenAI 직접은 prefix 없는 `gpt-4o-mini`. 사용자가 `DEFAULT_AI_MODEL`/`DEFAULT_EMBED_MODEL` 명시하면 그 값을 그대로 사용.

### 판단 사항 (D-(c) 자동화 — GitHub Actions 채택)
- **Vercel Cron Hobby 일 1회 제한** 우회 위해 GitHub Actions 로 전환. 무료 티어에서 5분 간격까지 가능 + 공개 repo 무제한 / private 도 월 2000분 무료.
- **장점**:
  - Vercel 배포 의존성 없이 (Supabase 만 있으면) 자동화 시작 가능
  - `scripts/` Python 코드를 그대로 호출 (FastAPI 엔드포인트로 wrap 안 해도 됨)
  - workflow_dispatch 로 수동 트리거 + 인자 오버라이드 가능 → 디버깅 편함
- **스케줄**: 적극적 옵션 채택 (사용자 선택)
  - 매시 정각: 랭킹 수집 (`0 * * * *` UTC)
  - 6시간마다 +30분: 클러스터링 (`30 */6 * * *` UTC, 수집 직후 마진)
  - 매일 KST 자정: 일간 브리핑 (`0 15 * * *` UTC)
- **구독자 수집** (`collect_subscribers`) 은 일단 cron 안 함 — 매시간 실행할 정도 데이터가 아님. 필요 시 `cron-subscribers.yml` 추가 (예: 일 1회).
- **GitHub Secrets 7개 필요**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_LEGACY_ANON_KEY`, `OPENAI_API_KEY`, `AI_BASE_URL`, `DEFAULT_AI_MODEL`, `DEFAULT_EMBED_MODEL` (+ 옵션 `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`).
- **시간대 정합성**: GitHub Actions 러너는 UTC, `date.today()` 도 UTC. cluster_date 는 UTC 기준이므로 KST 자정에 트리거되는 일간 브리핑이 cluster_date = today(UTC) 와 자연스럽게 매칭됨.

### 판단 사항 (Supabase Python 키 호환성)
- `supabase-py 2.10.0` 은 **JWT(`eyJ...`) 포맷만 인식** — 신규 publishable key (`sb_publishable_*`) 로 호출 시 `Invalid API key` 발생. [scripts/lib/db.py](scripts/lib/db.py)/[api/lib/db.py](api/lib/db.py) 의 `_resolve_key()` 는 JWT 인 키만 채택 (`SUPABASE_LEGACY_ANON_KEY` 우선). Next.js (`@supabase/supabase-js`) 는 publishable 도 OK 라 분리해서 운영. supabase-py 가 publishable key 지원하는 버전(>= 2.13?) 으로 올리면 폴백 단순화 가능.

### 판단 사항 (D-(b) 시점)
- **클러스터링 알고리즘**: 단순 그리디 + centroid running mean. HDBSCAN/agglomerative 대비 단순하지만 소규모 배치에서 충분. N 커지면 교체.
- **임베딩 대상**: 제목(`title`)만. 본문(`body`)은 seed 기준 대부분 NULL 이라 의미 없음. 실데이터 수집 시 본문 채워지면 `title + " " + body[:500]` 으로 확장 권장.
- **입력 범위**: 미할당(`issue_cluster_article` 에 없는) 최근 N시간 기사만. 기존 클러스터와의 병합(re-absorption)은 v1 에서 미구현 — 매 실행이 새 클러스터만 생성. 결과적으로 동일 이슈가 다른 키로 중복 생성될 가능성 있음. 필요 시 기존 클러스터의 대표 기사 임베딩을 같이 로드해서 threshold 이상이면 `issue_cluster_article` 에 이어 붙이는 로직 추가.
- **cluster_key 포맷**: `{YYYY-MM-DD}-auto-{8hex}` 로 자동 생성. 사람이 읽기 좋은 slug 가 아니지만 충돌 회피 목적.
- **representative 선정**: 클러스터 내 다른 멤버들과의 평균 cosine 유사도가 가장 높은 기사 (centrality 기반).
- **confidence_score**: 클러스터 내 페어 평균 유사도 (single = 1.0).
- **비용 가드**: `--dry-run` 은 AI 메타 생성(chat) 도 skip — 임베딩 호출 비용만 발생. 실 적재는 일반 실행에서만.

### 판단 사항 (의식해야 할 디자인 결정)
- **댓글 sentiment**: DB에 sentiment 컬럼 없음 → `engagement_score` 휴리스틱으로 배지 ("매우 활발 ≥80 / 활발 ≥60 / 보통"). 실 NLP 붙이려면 스키마 + AI 파이프라인 필요.
- **`/compare` 매체 목록**: 하드코딩 4개 (조선/중앙/한겨레/매일경제). 관리자 UI or 쿼리 파라미터 가변화 필요 시 수정.
- **랭킹 변동 지표**: 어제 스냅샷 diff 로직 미구현 → `change: null` (평행). `ranking_news_snapshot` 2회/일 이상 쌓이면 추가.
- **Gap priority 매핑**: `priority_score ≥80` high / `≥50` medium / else low.
- **AI JSON 파싱**: 모델이 markdown 펜스나 pre-text로 감싸는 경우 대비 regex 추출 fallback 탑재.
- **AI 요약 upsert 키**: `(summary_type, summary_date [, issue_cluster_id])` 조합으로 UPDATE or INSERT.

---

## 프로젝트 구조

```
d:\newsboard\
├── documents/                # 기획·설계 문서 (수정 금지)
│   ├── 1)PRD.md
│   ├── 2)IA.md
│   ├── 3)Use Case.md
│   ├── 4)ERD.md              # DB 스키마의 원천
│   └── 5)Design.md           # 디자인 시스템 원천
├── src/                      # Next.js (App Router)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # 대시보드 (Overview)
│   │   ├── issue/page.tsx
│   │   ├── compare/page.tsx
│   │   ├── gap/page.tsx
│   │   ├── analytics/
│   │   │   ├── subscribers/page.tsx
│   │   │   └── comments/page.tsx
│   │   └── report/page.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── dashboard/*
│   └── lib/
│       ├── api.ts            # 프론트 → /api 호출 클라이언트
│       └── supabase.ts       # 브라우저/서버 공용 Supabase JS 클라이언트
├── api/                      # Python FastAPI (Vercel Fluid Compute)
│   ├── index.py              # ASGI 엔트리 (FastAPI app)
│   ├── lib/
│   │   ├── db.py             # Supabase Python 클라이언트
│   │   ├── ai.py             # Vercel AI Gateway 래퍼
│   │   └── models.py         # Pydantic 응답 스키마
│   └── routes/
│       ├── issues.py
│       ├── ranking.py
│       ├── gap.py
│       ├── subscribers.py
│       ├── comments.py
│       └── report.py
├── supabase/
│   ├── migrations/0001_init.sql
│   └── seed.sql
├── requirements.txt          # Python deps
├── vercel.json               # Python 런타임 + 라우팅
├── .env.local.example
└── package.json
```

---

## 디자인 시스템 요약

[documents/5)Design.md](documents/5\)Design.md) 원천.

- **색**: primary `#1E40AF`(500) / `#1E3A8A`(600), bg `#F9FAFB`, fg `#111827`, muted `#6B7280`, border `#E5E7EB`, success `#16A34A`, warning `#D97706`, error `#DC2626`
- **폰트**: Inter + Noto Sans KR (Google Fonts)
- **CSS 유틸**: `.card`, `.card-hover`, `.card-alert`, `.badge badge-{success|warning|error|muted}`, `.section-title`, `.caption` — [src/app/globals.css](src/app/globals.css) 참조
- **레이아웃**: `<Sidebar />` + `<Topbar />` + `<main>` 패턴. 새 페이지는 [src/app/page.tsx](src/app/page.tsx)의 구조를 그대로 따른다.

---

## 데이터 모델 요약

[documents/4)ERD.md](documents/4\)ERD.md)를 반드시 먼저 확인.

핵심 엔티티 11개 (`MediaCompany`, `Article`, `RankingNewsSnapshot`, `RankingNewsItem`, `SubscriberSnapshot`, `CommentMetric`, `IssueCluster`, `IssueClusterArticle`, `MissedIssueAlert`, `AISummary`, `User`).

주요 규칙:
- PK: `BIGSERIAL`
- 시각: `TIMESTAMPTZ`, 날짜: `DATE`
- 상태값은 ENUM이 아니라 `CHECK` 제약
- `IssueCluster.keywords` 는 `TEXT[]` + GIN 인덱스
- `AISummary.source_metadata` 는 `JSONB` + GIN 인덱스
- `is_our_company = true` 는 운영 정책으로 단일 유지

---

## 코딩 규약

- **FastAPI**: 응답은 Pydantic 모델로 타입 고정. 각 라우터는 `api/routes/<domain>.py` 1파일 1도메인.
- **Next.js**: Server Components 기본. 클라이언트 상호작용만 `"use client"`.
- **Tailwind**: 가급적 기존 `.card`/`.badge` 유틸 재사용. 임의 HEX 직접 입력 금지.
- **주석**: 필요할 때만. 파일 상단 docstring/WHAT은 쓰지 않음 (Claude Code 규약).
- **에러 처리**: API 경계에서만 방어적으로. 내부 함수는 trust.

---

## Supabase MCP 사용 가이드 (재시작 후)

`.mcp.json`에 등록된 `supabase` MCP 서버를 통해 DB 전부를 제어한다.

주요 MCP 툴 (Supabase):
- `list_tables` — 현재 스키마 확인
- `apply_migration(name, query)` — DDL 실행 (테이블/인덱스/뷰 생성)
- `execute_sql(query)` — 데이터 쿼리/시드
- `get_project_url` / `get_anon_key` — 프론트 env 생성
- `generate_typescript_types` — TS 타입 자동 생성 (→ `src/lib/database.types.ts`)

**표준 작업 순서:**
1. `list_tables` 로 비어있는지 확인
2. `apply_migration("init", <SQL>)` 로 스키마 생성
3. `execute_sql(<seed>)` 로 시드
4. `generate_typescript_types` → `src/lib/database.types.ts` 저장

---

## 개발 실행

```bash
# Python 의존성
pip install -r requirements.txt

# 프론트 + Python API 동시 (Vercel CLI)
vercel dev

# 프론트만
npm run dev
```

환경 변수는 [.env.local.example](.env.local.example) 참조. 배포 전에 `vercel env pull` 로 동기화.

---

## 참고

- Vercel AI Gateway: `"provider/model"` 문자열로 AI SDK 호출. Anthropic SDK 직접 의존 금지.
- Node.js 24 LTS가 현재 기본.
- `vercel.json` 대신 `vercel.ts`로 이동 가능 (향후 과제).
