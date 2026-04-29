# Newsboard — AI 기반 미디어 모니터링 대시보드

뉴스 조직 내부용 AI 미디어 모니터링 및 인사이트 대시보드 프로젝트.

상세 기획/설계 문서는 [documents/](documents/) 참조 (PRD / IA / Use Case / ERD / Design).

---

## 현재 진행 상태 (2026-04-26)

새 세션 시작 시 가장 먼저 확인할 진행 현황 체크포인트.

### 핵심 아키텍처
- **단일 Vercel 프로젝트** (프론트 + Python API 공존, production: https://newsboard-two.vercel.app)
- **자사 매체**: **세계일보** (`normalized_name=segye`, `naver_media_id=022`, `is_our_company=TRUE`)
- **AI 백엔드**: OpenAI 직접 (`AI_BASE_URL=https://api.openai.com/v1`, 모델 `gpt-4o-mini` / `text-embedding-3-small`). `AI_GATEWAY_API_KEY` 우선이지만 사용자는 OpenAI 직접 채택.
- **DB**: Supabase (project_ref: `zwgqzutknvbmronqkkzw`)
- **백엔드 Python**: FastAPI (Vercel Fluid Compute) — AI 생성 엔드포인트 전용 (`/api/report/daily`, `/api/report/issue/{id}`)
- **프론트**: Next.js 15 App Router + Tailwind + lucide-react. `dev` 스크립트 `next dev --turbopack` (Windows webpack 행 회피)
- **데이터 경로 (하이브리드)**:
  - 단순 조회(리스트·상세·집계)는 Next.js Server Component → [src/lib/queries.ts](src/lib/queries.ts) → Supabase JS 직접
  - AI 생성·무거운 파이프라인은 FastAPI 경유 OR GitHub Actions 의 Python scripts 가 직접 Supabase 적재

### 자동화 파이프라인 (GitHub Actions, 5종)
| 워크플로 | 트리거 | 역할 |
|---|---|---|
| [cron-ranking.yml](.github/workflows/cron-ranking.yml) | 매시 정각 (UTC) | 50개 매체 × 5건 인기 랭킹 → article + snapshot |
| [cron-cluster.yml](.github/workflows/cron-cluster.yml) | **ranking 성공 직후 (workflow_run)** + 6시간 schedule fallback | 미할당 article 임베딩 클러스터링 → issue_cluster |
| [cron-publications.yml](.github/workflows/cron-publications.yml) | 매시 5분 (UTC) | 자사 발행 기사 카운트 (오늘+어제 KST) → daily_publication_count |
| [cron-subscribers.yml](.github/workflows/cron-subscribers.yml) | UTC 23:00 (KST 08:00) | followers.json API → subscriber_snapshot |
| [cron-daily-briefing.yml](.github/workflows/cron-daily-briefing.yml) | UTC 15:00 (KST 00:00) | 오늘 클러스터 → AI 일간 브리핑 → ai_summary |

### DB 스키마 (마이그레이션 2건)
- `0001_init` — 11개 코어 테이블 (media_company, article, issue_cluster 등)
- `0002_daily_publication_count` — 자사 일일 네이버 발행 수 카운트 테이블
- 매체 51개 (시드 9 + 사용자 추가 42, naver_media_id 보유 47개)

### 완료된 작업
- [x] **A) AI 요약 파이프라인** — [api/lib/ai.py](api/lib/ai.py) JSON 구조 출력, [api/routes/report.py](api/routes/report.py) 클러스터 기반 upsert, `POST /api/report/daily`, `POST /api/report/issue/{cluster_id}`, [src/components/GenerateReportButton.tsx](src/components/GenerateReportButton.tsx)
- [x] **B) 이슈 상세 페이지** [src/app/issue/\[cluster_id\]/page.tsx](src/app/issue/[cluster_id]/page.tsx)
- [x] **C) 시드 확장** — 경쟁사 구독자 스냅샷 7일치 (라이브 데이터로 대체됨)
- [x] **D-(a) 데이터 수집 스크립트** — `scripts/collect_subscribers.py` (followers.json JSON API 사용), `scripts/collect_ranking.py` (li.as_thumb selector). `published_at = collected_at` fallback 패치 + `ignore_duplicates=True`.
- [x] **D-(b) AI 클러스터링 파이프라인** — [scripts/cluster_articles.py](scripts/cluster_articles.py), 그리디+centroid running mean, [scripts/lib/cluster.py](scripts/lib/cluster.py)
- [x] **D-(c) GitHub Actions 자동화** — 5개 cron 워크플로, 모두 검증 완료
- [x] **자사 매체 = 세계일보 이전** — `is_our_company` 플래그 newsboard → segye, 6일치 backfill
- [x] **자사 발행 수 측정** — list.naver 페이지 페이지네이션 파싱, daily_publication_count 적재
- [x] **A) 50매체 UI 대응** — `/compare` 동적 매체 선택 (searchParams + 프리셋), `/analytics/subscribers` TOP 15 + "+N개 더" 토글
- [x] **B) Vercel 배포** — production https://newsboard-two.vercel.app, env 7개 설정, `vercel.json` runtime 키 제거 (Python 자동 감지)
- [x] **C) cron chain** — cron-cluster 가 cron-ranking 성공 직후 `workflow_run` 으로 자동 발동
- [x] **대시보드 레이아웃 개선** — AI 일간 요약 풀 폭 가로 + 주요 이슈 4 카드 grid

### ⚠️ 환경변수 (라이브 / .env.local 양쪽)
**Vercel Production env (이미 설정됨)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(publishable), `SUPABASE_LEGACY_ANON_KEY`(JWT, Python 용)
- `AI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY`, `DEFAULT_AI_MODEL=gpt-4o-mini`, `DEFAULT_EMBED_MODEL=text-embedding-3-small`

**GitHub Secrets (이미 설정됨, 동일)**: 위 7개 + 옵션 `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`

**로컬 .env.local 만 있는 것** (gitignore): 위 값 + 옵션 1 (Vercel AI Gateway) 주석 블록

### 재개 지점 (2026-04-26 세션 종료)
- C) cron chain 완료 + 푸시 (`62dcacb`). 다음 매시 정각 ranking 직후 cluster 자동 발동 검증 대기 중.
- 대시보드 production 에서 "자사 오늘 기사 (네이버) + 전일 대비 delta" 정상 동작 확인됨.
- 디자인 미리보기 파일 [_design-preview.html](_design-preview.html) — gitignore 됨, 다른 PC에선 없음.

### 다음 작업 로드맵
- **D) 스포츠 매체 0 진단** (5분) — 스포츠조선/스포티비뉴스의 followers.json 응답 키 확인. cron-subscribers workflow_dispatch 에 `media: sportschosun spotvnews` + `debug: true`.
- **P3) 댓글 반응 수집 파이프라인** (30분~) — 자사/전체 분리. 네이버 commonComment/listCount API 활용 가능.
- **(보너스) 셀렉터 견고화** — Naver UI 변경 대비 [scripts/lib/naver.py](scripts/lib/naver.py) 다중 selector 우선순위 확장.
- **(보너스) GitHub auto-deploy 연결** — Settings → Git 에서 Vercel ↔ GitHub 연결, push 자동 배포.
- **(미래) 본문 임베딩** — `article.body` 채워지면 클러스터링 입력을 `title + body[:500]` 으로 확장.

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

### 판단 사항 (자사 매체 = 세계일보)
- 시드는 가상 매체 "뉴스보드" 가 자사로 들어가지만, 실 운영 시점에 `is_our_company` 플래그를 segye(세계일보) 로 옮김. 시드와 라이브 DB 의 자사 매체가 다르므로 새 환경 셋업 시 동일 UPDATE 필요 (`UPDATE media_company SET is_our_company=TRUE WHERE normalized_name='segye'; UPDATE ... =FALSE WHERE normalized_name='newsboard';`).
- 세계일보 7일치 subscriber backfill 됨 (Naver 라운드값 3,000,000 으로 고정, 차트 평평한 라인). Naver 가 큰 매체는 round 단위로만 노출하는 한계.
- 시드의 `missed_issue_alert.target_media_company_id` 도 세계일보로 변경됨.

### 판단 사항 (daily_publication_count — 자사 발행 수)
- "오늘 기사 수" 카드는 자사(세계일보) 가 네이버에 송출한 모든 기사 수. cron-ranking 의 인기 5건 만으로는 부족해서 별도 테이블 + 별도 cron.
- 데이터 출처: `https://news.naver.com/main/list.naver?mode=LPOD&mid=sec&oid={id}&listType=summary&date=YYYYMMDD&page=N` (옛 list URL, HTML 정적 렌더)
- 카운트 방법: 페이지 1 fetch → max_page 추출 → 2..N 병렬 fetch → `n.news.naver.com/mnews/article` 링크 unique URL 합산.
- 별도 테이블로 둔 이유: 자사 article 을 모두 article 테이블에 적재하면 클러스터링이 자사 데이터로 편향됨. count 만 저장이 깔끔.
- KST 기준 today/yesterday 둘 다 매시간 갱신 (오늘은 점점 늘고 어제는 안정화).

### 판단 사항 (workflow_run cron chain)
- ranking 성공 → cluster 자동 발동을 GitHub Actions 의 `workflow_run` trigger 로 구현.
- `if` 가드: workflow_run 트리거면 `conclusion=='success'` 일 때만 실행, schedule/manual 은 항상 실행.
- 6시간 schedule fallback 도 유지 — ranking 모두 실패해도 cluster 단독 발동 보장.
- ⚠ **`workflow_dispatch` 로 트리거된 ranking 은 chain 자동 발동 안 될 수 있음** (GitHub 제약). 자연스러운 schedule 실행에서만 안정적으로 chain.
- daily-briefing / publications / subscribers 는 chain 안 함 — 1일 1회 또는 자사 통계라 ranking 과 무관.

### 판단 사항 (Vercel 배포)
- **`vercel.json` 의 `functions.runtime` 키 제거** — Vercel 의 새 표준에서 community runtime 모듈 식별자만 받음. 공식 Python 은 자동 감지되므로 키 자체 빼야 함. `maxDuration` 만 유지.
- Python 3.13 명시 안 하면 Vercel 이 3.12 사용. 코드가 3.13 전용 기능 안 써서 OK. 명시하려면 `.python-version` 파일에 `3.13` 추가.
- production URL: `https://newsboard-two.vercel.app` (Vercel 이 `newsboard` 가 다른 곳 reserved 라 `newsboard-two` 로 alias 부여)
- GitHub auto-deploy 미연결 — push 후 매번 `vercel deploy --prod` 수동 호출. 연결하려면 Settings → Git.

### 판단 사항 (대시보드 레이아웃)
- AI 일간 요약 카드: 우측 세로 박스 → 상단 풀 폭 가로 박스로 이전. 헤더 한 줄에 라벨+title+updated+button 다 배치. bullets 는 세로 stack 유지 (가독성).
- 주요 이슈 카드: 3개 → **4개** (`md:grid-cols-2 xl:grid-cols-4`). `getIssues(3) → getIssues(4)`.
- StatCard 라벨 명시: "오늘 기사 수" → "자사 오늘 기사 (네이버)", "총 구독자" → "자사 총 구독자", "댓글 반응" → "댓글 반응 (전체)" (자사 vs 전체 혼동 회피).
- 디자인 미리보기 도구: [_design-preview.html](_design-preview.html) (gitignore, 로컬 전용). Tailwind CDN + emoji icons 로 레이아웃 픽셀 미리보기.

### 판단 사항 (네이버 selector — 페이지별로 다름)
- **인기 랭킹 페이지** (`media.naver.com/press/{id}/ranking?type=popular`): `li.as_thumb > a` + `strong.list_title`. 화이트리스트 URL `n.news.naver.com/mnews/article` 로 garbage(탭 메뉴) 자동 필터.
- **list.naver 발행 페이지** (`news.naver.com/main/list.naver`): `<li><dl><dt class="photo">...</dt><dt><a>제목</a></dt><dd>요약 ... <span class="date">5시간전</span></dd></dl></li>`. 카운트는 unique 기사 URL set 으로.
- **followers.json**: JSON API. `extract_subscriber_count` 가 다양한 키 시도 (`totalCount`, `total`, `count`, `subscriberCount` 등) + 중첩 (`result.*`, `data.*`) 자동 탐색.
- 셀렉터 추가/패치 시 [scripts/lib/naver.py](scripts/lib/naver.py) 의 `_*_SELECTORS` 우선순위 리스트 맨 앞에 새 셀렉터 추가.

### 판단 사항 (의식해야 할 디자인 결정)
- **댓글 sentiment**: DB에 sentiment 컬럼 없음 → `engagement_score` 휴리스틱으로 배지 ("매우 활발 ≥80 / 활발 ≥60 / 보통"). 실 NLP 붙이려면 스키마 + AI 파이프라인 필요.
- **랭킹 변동 지표**: 어제 스냅샷 diff 로직 미구현 → `change: null` (평행). `ranking_news_snapshot` 2회/일 이상 쌓이면 추가.
- **Gap priority 매핑**: `priority_score ≥80` high / `≥50` medium / else low.
- **AI JSON 파싱**: 모델이 markdown 펜스나 pre-text로 감싸는 경우 대비 regex 추출 fallback 탑재.
- **AI 요약 upsert 키**: `(summary_type, summary_date [, issue_cluster_id])` 조합으로 UPDATE or INSERT.

---

## 다른 PC 에서 작업 이어가는 방법

이 프로젝트는 **클라우드 자원** (Supabase, Vercel, GitHub Actions) 에 의존하므로, 다른 PC 에서 풀 셋업 가능.

### 필수: 옮겨야 할 것 (현재 PC 에서 빠져나가기 전)
1. **`.env.local` 파일** — gitignore 라 git 에 없음. **유일한 sensitive secret 보관소**.
   - 안전한 방법: 1Password/Bitwarden 같은 secret manager 에 통째로 저장 / 또는 본인에게 이메일 / 또는 USB
   - 절대 방법: `cat d:\newsboard\.env.local` 결과를 채팅창/Slack 등 평문 노출 X (이전에 OpenAI 키 노출되어 rotate 했던 경험 참고)
   - 또는 새 PC 에서 다시 발급:
     - Supabase URL/anon: 누구나 볼 수 있는 정보 (대시보드에서 복사 가능)
     - SUPABASE_LEGACY_ANON_KEY: Supabase 대시보드 → API → "Legacy API keys" → anon
     - OPENAI_API_KEY: OpenAI 콘솔에서 새 키 발급 (구 키는 폐기)
     - 나머지 상수 (AI_BASE_URL, DEFAULT_AI_MODEL 등) 는 [.env.local.example](.env.local.example) 보고 그대로

### 새 PC 셋업 절차

```powershell
# 1) 기본 도구 설치 (없으면)
#    - Node.js LTS (https://nodejs.org)
#    - Python 3.13 (https://python.org)
#    - Git for Windows (https://git-scm.com)
#    - Vercel CLI (선택, deploy 할 때만): npm i -g vercel
#    - VSCode (선택)

# 2) 프로젝트 clone
git clone https://github.com/woos2324/newsboard.git
cd newsboard

# 3) Windows 면 Git safe.directory 등록 (NTFS dubious ownership 회피)
git config --global --add safe.directory $(pwd)

# 4) 의존성 설치
npm install
pip install -r requirements.txt

# 5) .env.local 만들기 (이전 PC 에서 가져온 값 또는 새로 채움)
cp .env.local.example .env.local
# → 편집기로 .env.local 열어서 값 채움

# 6) 동작 검증
python -m scripts.collect_publications --dry-run     # DB + AI 호출 둘 다 확인
npm run dev                                            # http://localhost:3001

# 7) (선택) Vercel CLI 연결 — 새 PC 에서 배포하려면
vercel login                                          # 브라우저 OAuth
vercel link --yes                                     # 기존 woos2324/newsboard 프로젝트 link
# .vercel/project.json 자동 생성
```

### Claude Code 에 작업 이어가달라고 할 때

새 세션에서 이렇게 한 줄만 보내면 충분:

```
d:\newsboard 작업 이어가자. CLAUDE.md "현재 진행 상태" + "재개 지점"
확인하고 남은 로드맵 (D 스포츠 0 진단 / P3 댓글 수집) 중 추천 것부터.
```

Claude Code 가 자동으로:
- CLAUDE.md 읽어서 진행 상태 파악
- 마이그레이션·시드·env 다 적용된 라이브 DB 와 동기화 가정
- 메모리 (`~/.claude/projects/d--newsboard/memory/`) 의 마일스톤 보고 패턴, 판단 사항 누적 컨벤션 적용

### 메모리 폴더 (옵션 — 새 PC 면 비어있음)

이전 PC 의 `C:\Users\<user>\.claude\projects\d--newsboard\memory\` 에 3개 파일이 있었어:
- `feedback_milestone_reporting.md` — 마일스톤 단위 보고 후 사용자 승인 대기
- `feedback_judgment_calls.md` — 임의 결정은 "판단 사항"에 누적
- `reference_state_source.md` — 진행 상태 원천은 CLAUDE.md
- `MEMORY.md` — 인덱스

새 PC 에서 이대로 작업하려면 폴더 통째로 복사하거나, 빠진대로 진행하고 새 세션에서 Claude Code 가 알아서 같은 패턴 적용 (CLAUDE.md 가 그 가이드 자체임).

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
---

## Recent Updates (2026-04-28 ~ 2026-04-29)

### 주요 이슈
- 주요 이슈 노출 기준을 **관련 기사 2건 이상**으로 조정.
- 이슈 카드와 이슈 목록에 **보도 매체 목록**을 함께 표시하도록 변경.
- 단일 기사만 묶인 클러스터는 주요 이슈 영역에서 제외.

### 구독자 분석
- `경쟁사 구독자 규모` 영역을 카드형 목록에서 **표형 UI**로 개편.
- `세계일보`는 경쟁사 표에서 **순위와 무관하게 항상 첫 행**에 보이도록 정렬.
- `세계일보` 행은 강조 배경 + `고정` 배지를 사용하지만, sticky 행은 아니며 스크롤 시 함께 이동.
- 순위 왼쪽에 **체크박스**를 추가하고, 체크한 매체만 왼쪽 차트에 반영되도록 연결.
- 표 하단 토글은 `+N개 더` 링크 대신 **`More` 버튼**으로 변경.
- 왼쪽 차트는 `구독자 변화`에서 **`구독자 추이`**로 정리.
- 차트 헤더에 **`구독자 수 / 증감수` 세그먼트 토글**을 추가해서 같은 선택 매체 기준으로 지표 전환 가능.

### 구현 메모
- [src/lib/queries.ts](src/lib/queries.ts)
  - 경쟁사 구독자 조회 결과를 표용 최근 3일(`tableSnapshots`)과 차트용 최근 15일(`trendSnapshots`)로 분리.
  - `세계일보`는 DB 상 `is_our_company = true` 이지만, 경쟁사 비교 표에서는 예외적으로 포함.
- [src/components/analytics/SubscriberComparisonExplorer.tsx](src/components/analytics/SubscriberComparisonExplorer.tsx)
  - 구독자 분석 전용 클라이언트 컴포넌트 추가.
  - 체크박스 선택, 표 UI, 차트 지표 토글(`구독자 수 / 증감수`)을 한 곳에서 관리.
- [src/app/analytics/subscribers/page.tsx](src/app/analytics/subscribers/page.tsx)
  - 서버에서 데이터만 조회하고 전용 컴포넌트에 전달하는 구조로 단순화.

### 배포 메모
- 최근 변경은 모두 `main` 브랜치에 반영.
- Vercel production: `https://newsboard-two.vercel.app`
- 관련 최근 커밋:
  - `479dcf8 feat(subscribers): connect chart selection to comparison table`
  - `0a72793 feat(subscribers): add chart metric toggle`
