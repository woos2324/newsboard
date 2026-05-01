# Newsboard — AI 기반 미디어 모니터링 대시보드

뉴스 조직 내부용 AI 미디어 모니터링 및 인사이트 대시보드 프로젝트.

상세 기획/설계 문서는 [documents/](documents/) 참조 (PRD / IA / Use Case / ERD / Design).

---

## 현재 진행 상태 (2026-05-01)

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

### 자동화 파이프라인 (GitHub Actions, 8종)
| 워크플로 | 트리거 | 역할 |
|---|---|---|
| [cron-ranking.yml](.github/workflows/cron-ranking.yml) | 매시 7분 (UTC, KST :16) | 50개 매체 × 5건 인기 랭킹 → article + snapshot |
| [cron-cluster.yml](.github/workflows/cron-cluster.yml) | **ranking 성공 직후 (workflow_run)** + UTC :30 6시간 fallback | 미할당 article 임베딩 클러스터링 → issue_cluster (threshold=0.85) |
| [cron-gap.yml](.github/workflows/cron-gap.yml) | **cluster 성공 직후 (workflow_run)** + UTC 01/07/13/19시 fallback | 클러스터 기반 미보도 탐지 → missed_issue_alert |
| [cron-publications.yml](.github/workflows/cron-publications.yml) | 매시 17분·47분 (UTC, KST :26·:56) | 자사 전체 기사 제목·URL → article 적재 + daily_publication_count |
| [cron-section-ranking.yml](.github/workflows/cron-section-ranking.yml) | **ranking 성공 직후 (workflow_run)** + UTC 02/08/14/20시 fallback | 섹션별 랭킹 → section_ranking_snapshot |
| [cron-subscribers.yml](.github/workflows/cron-subscribers.yml) | UTC 23:00 (KST 08:00) | followers.json API → subscriber_snapshot |
| [cron-comments.yml](.github/workflows/cron-comments.yml) | 매시 15분 (UTC, KST :24) | 자사·경쟁사 기사 댓글 수 → comment_metric |
| [cron-daily-briefing.yml](.github/workflows/cron-daily-briefing.yml) | UTC 15:00 (KST 00:00) | 오늘 클러스터 → AI 일간 브리핑 → ai_summary |

**cron chain**: `ranking → cluster → gap` (매시 정각 자동 연쇄)

### DB 스키마 (마이그레이션 4건)
- `0001_init` — 11개 코어 테이블 (media_company, article, issue_cluster 등)
- `0002_daily_publication_count` — 자사 일일 네이버 발행 수 카운트 테이블
- `0003_section_ranking` — 섹션별 랭킹 스냅샷 테이블 (`section_ranking_snapshot`)
- `0004_perf_indexes` — 성능 인덱스 3개 (comment_metric.comment_count DESC, subscriber_snapshot.snapshot_date DESC, issue_cluster_article.article_id)
- 매체 51개 (시드 9 + 사용자 추가 42, naver_media_id 보유 47개)

### 완료된 작업
- [x] **AI 요약 파이프라인** — [api/lib/ai.py](api/lib/ai.py), [api/routes/report.py](api/routes/report.py), `POST /api/report/daily`, `POST /api/report/issue/{cluster_id}`
- [x] **이슈 상세 페이지** — [src/app/issue/\[cluster_id\]/page.tsx](src/app/issue/[cluster_id]/page.tsx)
- [x] **데이터 수집 스크립트** — ranking, subscribers, publications, section_ranking, comments
- [x] **AI 클러스터링 파이프라인** — [scripts/cluster_articles.py](scripts/cluster_articles.py), 그리디+centroid
- [x] **GitHub Actions 자동화** — 8개 cron 워크플로 + chain
- [x] **자사 매체 = 세계일보** — `is_our_company` 플래그 segye 로 이전
- [x] **Vercel 배포** — production https://newsboard-two.vercel.app
- [x] **/compare 경쟁사 비교** — 인기 랭킹 + 섹션별 랭킹 탭, 언론사 칩 선택 UI, 세계일보 고정 강조
- [x] **구독자 분석** — 표형 UI + 체크박스 → 차트 연동 + 구독자수/증감수 토글
- [x] **댓글 반응 분석** — 자사/경쟁사 분리, /analytics/comments 페이지
- [x] **미보도 탐지 파이프라인** — [scripts/detect_gap.py](scripts/detect_gap.py), cron-gap chain, 검토 시작/완료 버튼 ([src/app/gap/actions.ts](src/app/gap/actions.ts))
- [x] **자사 전체 기사 수집** — [scripts/collect_publications.py](scripts/collect_publications.py) 에서 제목·URL → article 테이블 적재 (낙종 탐지 정확도 향상)
- [x] **댓글 페이지 중복 제거** — `article_id` 기준 Set dedup으로 동일 기사 중복 스냅샷 제거. 배지 기준 `comment_count` 직접 사용 (500↑ 매우활발 / 200↑ 활발 / 미만 보통)
- [x] **대시보드 댓글 반응 수정** — 25시간 시간 필터 + `limit(3000)` + article_id dedup 으로 0 표시 버그 수정
- [x] **댓글 수집 cron 매시간으로 변경** — `cron-comments.yml` 4회/일 → `15 * * * *` (UTC, KST :24) 매시 수집
- [x] **쿼리 성능 개선** — `getOurTopComments` / `getCompetitorTopComments` 25h 필터 + limit×10, `getCompetitorSubscribers` 최근 16일 필터 ([src/lib/queries.ts](src/lib/queries.ts))
- [x] **DB 인덱스 3개 추가** — `0004_perf_indexes` 마이그레이션 적용 (comment_metric 정렬, subscriber_snapshot 날짜, issue_cluster_article 기사 조회)
- [x] **전 페이지 loading.tsx 스켈레톤** — 메뉴 클릭 즉시 시각적 피드백. 8개 페이지 animate-pulse 스켈레톤 적용
- [x] **Topbar 검색창 주석 처리** — 미구현 상태로 UI에서 제거 ([src/components/Topbar.tsx](src/components/Topbar.tsx))
- [x] **자사 기사 현황 페이지** — `/articles` 페이지: 상단 stat 카드 3개(총 기사 수·섹션 수·기자 수), 7일 트렌드 바차트(600기준 px 계산, 고정 높이), 섹션 분포 뱃지, 2컬럼 equal-height 기사 목록(CSS Grid), 그룹 페이지네이션(5개 단위 ‹ 1 2 3 4 5 ›)
- [x] **기사 목록 CSR 전환** — [src/app/articles/ArticleListClient.tsx](src/app/articles/ArticleListClient.tsx) Client Component + `/api/articles` route ([src/app/api/articles/route.ts](src/app/api/articles/route.ts)) 추가. 페이지 이동 시 전체 새로고침 없이 기사 목록만 업데이트
- [x] **기자 이름 수집** — [scripts/lib/naver.py](scripts/lib/naver.py) `parse_author_name()` 5개 selector 우선순위 탐색. [scripts/collect_publications.py](scripts/collect_publications.py) `_backfill_author_names()` — 신규 기사(author_name IS NULL)만 비동기 병렬 수집(Semaphore 8). article 목록 UI에 "기자명 기자" 표시
- [x] **category null backfill** — `collect_publications.py` 에서 upsert 후 별도 UPDATE 패스 추가. `ignore_duplicates=True` 가 차단하던 기존 기사 카테고리 미채움 문제 해결
- [x] **댓글 수집 Playwright → httpx 전환** — Naver 댓글 JSONP API 직접 호출. objectId 형식 `news{oid},{aid}` (쉼표, 언더스코어 아님) 수정 — 2일간 0 반환 근본 원인 해결. [scripts/collect_comments.py](scripts/collect_comments.py) 완전 재작성. requirements.txt 및 [cron-comments.yml](.github/workflows/cron-comments.yml) 에서 playwright 제거
- [x] **대시보드 NAVER 배지 제거 + 댓글 기사 title dedup** — `page.tsx` source 배지 제거, `getOurTopComments` title Set dedup으로 중복 방지
- [x] **Naver 기사 URL 정규화** — [scripts/lib/naver.py](scripts/lib/naver.py) `normalize_naver_article_url()` 추가. ranking → `/mnews/article/` 통일. 기존 중복은 title dedup으로 처리
- [x] **기자명 수집 로직 제거** — GitHub Actions 데이터센터 IP에서 Naver가 다른 HTML 반환 → 기자명 요소 absent. [scripts/collect_publications.py](scripts/collect_publications.py) `_backfill_author_names()` 제거. NCP 서버(한국 IP) 구성 후 재추가 예정
- [x] **클러스터 re-absorption** — [scripts/cluster_articles.py](scripts/cluster_articles.py) 에 이미 구현됨. `_load_recent_clusters` (최근 2일) + `_find_similar_cluster` (제목 바이그램 ≥0.55 또는 공통 키워드 ≥2개+비율 ≥0.4) 로 기존 클러스터에 흡수. 같은 실행 내는 임베딩 유사도(0.85)로, 다른 실행 간은 텍스트 유사도로 병합. "미구현" 표기는 오기였음.
- [x] **AI 일간 브리핑 불릿 → 이슈 링크 (B안)** — [api/lib/ai.py](api/lib/ai.py) 프롬프트 변경: bullets를 `{text, cluster_index}` 형태로 출력. [api/routes/report.py](api/routes/report.py) cluster_index → cluster_id/cluster_title 매핑 후 source_metadata 저장. [src/lib/queries.ts](src/lib/queries.ts) `BulletItem` 타입 추가 + `parseBullets()` 함수 (string/dict 하위호환). [src/components/dashboard/AISummaryCard.tsx](src/components/dashboard/AISummaryCard.tsx) per-bullet 아이콘 + `pb-2` 툴팁으로 교체 (cluster_id 있을 때만 아이콘 표시, 클릭 시 `/issue/[id]` 이동). 아이콘은 `inline-flex ml-2.5`로 텍스트 직후 인라인 배치 (flex 끝이 아님). production 배포 완료 + `/api/report/daily` POST로 신규 형식 브리핑 생성 확인 (cluster_id 매핑 정상)
- [x] **generate_daily_briefing.py 이슈 링크 매핑 추가** — GitHub Actions cron용 스크립트에 cluster_index → cluster_id/cluster_title enriched_bullets 로직 추가. FastAPI endpoint와 동일 형식으로 저장.
- [x] **AI 리포트 날짜 KST 기준 수정** — [api/routes/report.py](api/routes/report.py) + [scripts/generate_daily_briefing.py](scripts/generate_daily_briefing.py): `summary_date`를 KST 오늘 날짜로 저장. 클러스터 조회는 최근 2일치(`gte yesterday_utc`)로 확장해 UTC/KST 날짜 불일치 방지.
- [x] **GenerateReportButton 성공 상태** — [src/components/GenerateReportButton.tsx](src/components/GenerateReportButton.tsx): 생성 완료 시 "생성 완료!" + CheckCircle 아이콘 3초 표시.

### ⚠️ 환경변수 (라이브 / .env.local 양쪽)
**Vercel Production env (이미 설정됨)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(publishable), `SUPABASE_LEGACY_ANON_KEY`(JWT, Python 용)
- `AI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY`, `DEFAULT_AI_MODEL=gpt-4o-mini`, `DEFAULT_EMBED_MODEL=text-embedding-3-small`

**GitHub Secrets (이미 설정됨, 동일)**: 위 7개 + 옵션 `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`

**로컬 .env.local 만 있는 것** (gitignore): 위 값 + 옵션 1 (Vercel AI Gateway) 주석 블록

### 재개 지점 (2026-05-02 5차 세션 종료)
- **AI 일간 브리핑 불릿 → 이슈 링크 B안 완전 구현 + 배포 완료** (이전 세션)
- **`scripts/generate_daily_briefing.py` 업데이트** — cluster_index → cluster_id/cluster_title 매핑 로직 추가 (FastAPI endpoint와 동일 로직). GitHub Actions cron도 이슈 링크 포함 bullets 저장.
- **AI 리포트 날짜 KST 기준으로 수정** — `api/routes/report.py`: `date.today()` → KST 오늘(`datetime.now(KST).date()`), 클러스터는 최근 2일치(`gte(yesterday_utc)`) 조회. `summary_date`를 KST로 저장. `generate_daily_briefing.py` 동일 정책 적용.
- **GenerateReportButton 성공 상태 추가** — 생성 완료 시 "생성 완료!" + CheckCircle 아이콘 3초 표시. 에러 메시지 단순화.
- production 배포 완료 (commit `0b825a9`)
- ⚠ **과거 날짜 category backfill** 미완료: 2026-04-25~29 날짜별로 `python -m scripts.collect_publications --date YYYYMMDD` 수동 실행 필요.
### 다음 작업 로드맵
- **(즉시) 과거 날짜 category backfill** — `python -m scripts.collect_publications --date 20260425` ~ `20260429` 5일치 수동 실행 (2026-04-29 이전 ~90건 기타 원인).
- **(미래) 미보도 탐지 + 클러스터 품질 개선** — 설계 완료, 단계적 구현 예정. 상세 내용은 아래 "판단 사항 (미보도·클러스터 개선 설계)" 참조.
- **(미래) 검색 기능** — Topbar 검색창 UI 주석 처리됨 ([src/components/Topbar.tsx](src/components/Topbar.tsx)). 이슈 클러스터 제목/키워드 검색 + 드롭다운 자동완성 또는 `/search` 페이지로 구현 필요.
- **(미래) 이메일 브리핑 자동 발송** — 매일 KST 9시, GitHub Actions cron으로 주요 지표 + 놓친 이슈 + Top 3 이슈 이메일 발송. 추후 카카오 알림톡 전환 가능.
- **(미래) 기자 이름 기반 통계** — NCP 한국 IP 서버 구성 후 기자명 수집 재도입 전제. 기자별 기사 수 / 이슈 연결 현황. `/articles` 페이지 확장.
- **(보너스) 셀렉터 견고화** — Naver UI 변경 대비 [scripts/lib/naver.py](scripts/lib/naver.py) 다중 selector 우선순위 확장.
- **(보너스) GitHub auto-deploy 연결** — Settings → Git 에서 Vercel ↔ GitHub 연결, push 자동 배포.
- **(미래) 본문 임베딩** — `article.body` 채워지면 클러스터링 입력을 `title + body[:500]` 으로 확장.

### 판단 사항 (AI 리포트 날짜 기준 — KST vs UTC)
- **문제**: FastAPI `date.today()`는 UTC 기준. KST 낮에 버튼 누르면 UTC는 전날이라 기존 브리핑을 update만 하고 KST "오늘" 날짜 리포트가 생기지 않음.
- **해결**: `summary_date`를 `datetime.now(KST).date()`로 설정. 클러스터 조회는 `gte(yesterday_utc)`로 최근 2일치 포함 (UTC/KST 경계 무관하게 최신 클러스터 항상 포함).
- **cluster_date는 여전히 UTC 기준**: `cluster_articles.py`는 변경 안 함. 브리핑 날짜만 KST로 보정.
- **cron 브리핑(UTC 15:00 = KST 00:00)**: `generate_daily_briefing.py`도 동일 KST 정책 적용. `--date` 인자 지정 시 해당 날짜 사용, 미지정 시 KST 오늘.

### 판단 사항 (미보도·클러스터 개선 설계)

#### 미보도 탐지 개선

**문제**: 현재 "클러스터에 자사 기사 없으면 바로 알림" → 오탐 다수. 자사가 이미 유사 기사를 보도했지만 임베딩 유사도가 낮아 클러스터에 안 묶인 경우도 미보도로 처리됨.

**목표 구조** (단계적):
```
경쟁사 클러스터 후보 선정 (경쟁사 ≥2)
→ 자사 기사 2차 검증 (키워드 + 제목 텍스트 유사도)
→ 판정 분류
→ 우선순위 계산
→ 알림 생성
```

**판정 분류**:
- `미보도`: 자사 유사 기사 없음 → 알림 생성
- `유사보도있음`: 제목/키워드 기준 자사 기사와 충분히 유사 → 알림 생략 or priority 낮춤
- `부분보도가능성`: 키워드는 겹치지만 제목 의미가 다름 → priority 낮춰서 알림
- `확인필요`: 유사도 점수 애매 → 알림 생성 (priority 낮음)

**구현 순서**:
- 1단계: `detect_gap.py`에 자사 기사 2차 검증 추가 (키워드+제목 텍스트). `reason` 필드에 판정 근거 기록. priority_score 조정으로 분류 표현.
- 2단계: DB 마이그레이션으로 `alert_status` 세분화 (`similar_covered`, `needs_review` 추가) + `/gap` UI 수정.
- 3단계: 자사 기사 임베딩 저장 파이프라인 추가 → 임베딩 기반 2차 검증으로 교체.
- 4단계 (장기): 유사도 점수 애매한 것만 AI 최종 판정.

**제약 사항**:
- `article.body` 대부분 NULL → 본문 임베딩 불가 (수집 파이프라인 붙은 후 확장)
- NER(개체명 인식) 없음 → 인물/기관명 비교는 AI 판정 단계에서 처리
- 자사 기사에 임베딩 미저장 → 1단계는 텍스트 기반으로 시작

#### 클러스터 품질 개선

**문제**: 같은 이슈가 제목 표현 차이로 다른 클러스터에 분리. 다른 실행 간 re-absorption이 텍스트 기반이라 AI 제목 표현에 따라 불안정.

**개선 방향**:
- **같은 실행 내 후처리**: 클러스터링 후 centroid 간 cosine ≥ 0.82인 클러스터 쌍 병합. O(n²)이지만 클러스터 수십 개 수준이라 부담 없음.
- **Re-absorption 강화**: 현재 텍스트 유사도 → 대표 기사 임베딩 저장 후 centroid 직접 비교로 교체. 여러 신호 조합 가능: 임베딩 유사도 + 키워드 겹침 + 카테고리 일치 + 발행 시간 근접성.
- **장기**: `article.body` 수집 시 제목+본문 500자 임베딩으로 클러스터링 정확도 향상.

### 판단 사항 (클러스터 re-absorption)
- **같은 실행 내**: 임베딩 cosine 유사도 ≥0.85 → 같은 그룹으로 묶임. 제목이 달라도 의미가 비슷하면 통과.
- **다른 실행 간**: `_find_similar_cluster`로 최근 2일 기존 클러스터와 비교. 제목 바이그램 유사도 ≥0.55 OR 공통 키워드 ≥2개+비율 ≥0.4 이면 기존 클러스터에 흡수(`absorbed` 카운트 증가).
- **AI 생성 제목 의존**: 같은 사건에 AI가 전혀 다른 표현의 제목을 생성하면 유사도 임계값 미달 가능. 실제 중복이 지속 발생하면 threshold 완화(0.50) 또는 임베딩 기반 클러스터 간 비교로 개선 검토.

### 판단 사항 (AI 일간 브리핑 불릿 → 이슈 링크)
- **bullets 저장 형식 변경**: 구 형식 `string[]` → 신 형식 `[{text, cluster_id, cluster_title}]`. `parseBullets()` 함수가 두 형식 모두 처리해 하위호환 보장.
- **cluster_index 매핑**: AI가 `[{text, cluster_index}]` 반환 → `clusters_raw[cluster_index]`에서 `issue_cluster_id`와 `representative_title` 추출 → enriched_bullets 구성. index 범위 초과 시 `cluster_id: null`로 저장 (아이콘 미표시).
- **툴팁 gap 패턴**: `group-hover:block` 는 마우스가 trigger와 tooltip 사이 공백을 통과하면 닫힘. 해결: tooltip wrapper에 `pb-2` (padding) 적용 — hover 영역을 아래로 확장해 공백 제거. `mb-2` (margin)는 hover 영역 외부이므로 사용 금지.
- **아이콘 표시 조건**: `cluster_id != null` 인 불릿만 아이콘 표시. `null`인 경우 아이콘 없이 텍스트만 표시 (공간 확보 불필요 — 인라인 방식이라 레이아웃 영향 없음).
- **아이콘 위치**: `inline-flex ml-2.5` — 텍스트 span 내부에 인라인으로 배치. flex row 끝(우측 끝)이 아니라 텍스트 바로 오른쪽 10px 위치. `align-middle`로 수직 중앙 정렬. 줄바꿈 발생 시에도 마지막 줄 텍스트 끝에 붙음.
- **기자명 수집 보류**: GitHub Actions 미국 데이터센터 IP에서 Naver가 SSR 다르게 반환 → `em.media_end_head_journalist_name` 요소 absent. NCP 한국 IP 서버 구성 후 `parse_author_name()` + `_backfill_author_names()` 재추가.

### 판단 사항 (댓글 수집 — Naver JSONP API)
- **objectId 형식**: `news{oid},{aid}` — **쉼표** 구분, 언더스코어 아님. 잘못된 형식이면 API가 오류 없이 count=0 반환 (디버깅 어려움).
- **API 엔드포인트**: `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?ticket=news&templateId=default&pool=cbox5&lang=ko&country=KR&objectId=news{oid},{aid}&pageSize=1&sort=NEW&_cv=20140318`
- **JSONP 파싱**: `re.search(r"\((\{.*\})\)\s*;?\s*$", text, re.DOTALL)` → `result.count.total` (구조: `data.result.count.total`)
- **Playwright 제거**: GitHub Actions 에서 chromium 설치 실패로 2일 공백 발생 → httpx 직접 호출로 완전 교체. `playwright` 는 requirements.txt 및 cron yml 에서 제거됨.
- **수집 대상**: [TARGET_MEDIA](scripts/collect_comments.py) `["segye","chosun","joongang","donga","mk"]` 5개 매체, 최근 24h 기사.

### 판단 사항 (자사 기사 현황 페이지 — /articles)
- **차트 높이 계산**: `height: X%` 는 flex child 의 content 높이(~50px) 기준 상대값 → 항상 낮게 표시됨. 픽셀 직접 계산 필수: `Math.round((count / 600) * 140)` px. 600 = 고정 max 기준값.
- **Equal-height 컬럼**: CSS `grid grid-cols-2` 로 구성해야 같은 행 좌우 높이 자동 일치. `flex` 2컬럼은 높이 불일치 발생.
- **Client-side 페이지네이션**: `ArticleListClient.tsx` (`"use client"`) + `/api/articles` route 분리. Server Component `page.tsx` 는 초기 1페이지만 렌더, 이후 클라이언트 fetch로 전환.
- **그룹 페이지네이션**: 5개 단위 그룹. `currentGroup = Math.ceil(page / GROUP_SIZE)` → `groupStart = (currentGroup-1)*5+1`, `groupEnd = min(currentGroup*5, totalPages)`. ‹ / › 로 그룹 이동.
- **기자 이름 backfill**: `_backfill_author_names()` 는 `author_name IS NULL` 인 기사만 대상. `upsert(ignore_duplicates=True)` 이후 별도 UPDATE 패스로 category/author_name 채움 (upsert 가 기존 row UPDATE 차단하기 때문).

### 판단 사항 (데이터 수집 전략)
- **네이버 셀렉터**: [scripts/lib/naver.py](scripts/lib/naver.py) 의 `_RANKING_LIST_SELECTORS`, `_TITLE_SELECTORS` 는 우선순위 리스트. 셀렉터 추가/패치 시 맨 앞에 새 셀렉터 삽입.
- **Delta 계산 정책**: `daily_delta` = (오늘 - 가장 최근의 *어제 이전* 스냅샷). `seven_day_delta` = (오늘 - 7일 이전 가장 가까운 스냅샷). 동일 일자 재실행해도 delta 가 0 으로 깨지지 않도록 `lt(snapshot_date, today)` 사용.
- **upsert 전략**: 구독자 = `(media_company_id, snapshot_date, source)` UNIQUE. 랭킹 = `article.url` UNIQUE + 매 실행마다 새 `ranking_news_snapshot` row 추가 (스냅샷 누적이 의도).

### 판단 사항 (AI 백엔드 — Gateway / OpenAI 직접 분기)
- [api/lib/ai.py](api/lib/ai.py) 는 `AI_BASE_URL` 환경변수로 백엔드 분기:
  - 미설정 → Vercel AI Gateway (기본 모델: `anthropic/claude-opus-4-6` / `openai/text-embedding-3-small`)
  - `https://api.openai.com/v1` → OpenAI 직접 (기본 모델: `gpt-4o-mini` / `text-embedding-3-small`)
- API 키 우선순위: `AI_GATEWAY_API_KEY` → `OPENAI_API_KEY`. 둘 중 하나만 있으면 됨. PLACEHOLDER 시작 문자열은 자동 무시.
- Vercel AI Gateway 의 모델명은 `provider/model` 형태 (`anthropic/claude-opus-4-6`), OpenAI 직접은 prefix 없는 `gpt-4o-mini`. 사용자가 `DEFAULT_AI_MODEL`/`DEFAULT_EMBED_MODEL` 명시하면 그 값을 그대로 사용.

### 판단 사항 (GitHub Actions 자동화)
- **Vercel Cron Hobby 일 1회 제한** 우회 위해 GitHub Actions 채택. `workflow_dispatch` 로 수동 트리거 + 인자 오버라이드 가능.
- **GitHub Secrets 필요**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_LEGACY_ANON_KEY`, `OPENAI_API_KEY`, `AI_BASE_URL`, `DEFAULT_AI_MODEL`, `DEFAULT_EMBED_MODEL` (+ 옵션 `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`).
- **시간대**: GitHub Actions 러너는 UTC. cluster_date 도 UTC 기준 — KST 자정 브리핑이 cluster_date = today(UTC) 와 자연스럽게 매칭됨.
- **workflow_dispatch 로 트리거된 ranking 은 chain 자동 발동 안 될 수 있음** (GitHub 제약). 자연스러운 schedule 실행에서만 안정적으로 chain.

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
- 시드는 가상 매체 "뉴스보드" 가 자사로 들어있어, **새 환경 셋업 시** 아래 UPDATE 필요:
  ```sql
  UPDATE media_company SET is_our_company=TRUE WHERE normalized_name='segye';
  UPDATE media_company SET is_our_company=FALSE WHERE normalized_name='newsboard';
  ```
- Naver 가 큰 매체 구독자는 round 단위로만 노출 — 세계일보 차트가 평평한 라인으로 보이는 건 정상.

### 판단 사항 (daily_publication_count + 자사 전체 기사 수집)
- "오늘 기사 수" 카드는 자사(세계일보) 가 네이버에 송출한 모든 기사 수. cron-ranking 의 인기 5건 만으로는 부족해서 별도 테이블 + 별도 cron.
- 데이터 출처: `https://news.naver.com/main/list.naver?mode=LPOD&mid=sec&oid={id}&listType=summary&date=YYYYMMDD&page=N` (옛 list URL, HTML 정적 렌더)
- 파싱: `dt:not(.photo) a[href]` 로 제목+URL 추출 ([scripts/lib/naver.py](scripts/lib/naver.py) `parse_publication_articles`).
- **2026-04-30 확장**: count 만 저장 → **기사 제목·URL 도 article 테이블에 upsert** (낙종 탐지 시 세계일보 보도 여부 정확히 판단하기 위해). daily_publication_count 는 계속 병행 갱신.
- KST 기준 today/yesterday 둘 다 매시간 갱신.

### 판단 사항 (미보도 탐지 파이프라인)
- **탐지 기준**: `issue_cluster` 에서 세계일보(`is_our_company=TRUE`) 기사가 없고, 경쟁사 기사 ≥ 2개 매체인 클러스터 → `missed_issue_alert` 생성.
- **priority_score**: 경쟁사 2개=50 / 3개=75 / 4개+=100. `≥80=high / ≥50=medium / else=low`.
- **중복 방지**: `_dedup_by_title()` 로 동일 제목 클러스터 중 confidence 높은 하나만 처리. `_load_existing_titles()` 로 DB 기존 open/reviewing 제목과 비교해 재삽입 방지.
- **⚠ 미해결**: 제목이 조금 다른 같은 이슈(예: "김예성 횡령 무죄" vs "김예성 2심 무죄") 는 현재 dedup 안 됨. 클러스터 re-absorption 구현 전까지 threshold 0.85 로 발생 빈도 감소만.
- **검토 상태 흐름**: `open` → (검토 시작 클릭) → `reviewing` → (완료 클릭) → `resolved`. `resolved`/`ignored` 는 /gap 페이지에서 제외.
- **cron chain**: `ranking → cluster → gap` (매시 정각 자동 연쇄). cluster 실패 시 gap 미실행 — 6시간 fallback 으로 보완.


### 판단 사항 (Vercel 배포)
- **`vercel.json` 의 `functions.runtime` 키 제거** — Vercel 의 새 표준에서 community runtime 모듈 식별자만 받음. 공식 Python 은 자동 감지되므로 키 자체 빼야 함. `maxDuration` 만 유지.
- Python 3.13 명시 안 하면 Vercel 이 3.12 사용. 코드가 3.13 전용 기능 안 써서 OK. 명시하려면 `.python-version` 파일에 `3.13` 추가.
- production URL: `https://newsboard-two.vercel.app` (Vercel 이 `newsboard` 가 다른 곳 reserved 라 `newsboard-two` 로 alias 부여)
- GitHub auto-deploy 미연결 — push 후 매번 `vercel deploy --prod` 수동 호출. 연결하려면 Settings → Git.

### 판단 사항 (대시보드 레이아웃)
- StatCard 라벨: "자사 오늘 기사 (네이버)" / "자사 총 구독자" / "댓글 반응 (전체)" — 자사 vs 전체 혼동 방지.
- 디자인 미리보기: [_design-preview.html](_design-preview.html) (gitignore, 로컬 전용). Tailwind CDN + emoji icons 로 레이아웃 픽셀 미리보기.

### 판단 사항 (네이버 selector — 페이지별로 다름)
- **인기 랭킹 페이지** (`media.naver.com/press/{id}/ranking?type=popular`): `li.as_thumb > a` + `strong.list_title`. 화이트리스트 URL `n.news.naver.com/mnews/article` 로 garbage(탭 메뉴) 자동 필터.
- **list.naver 발행 페이지** (`news.naver.com/main/list.naver`): `<li><dl><dt class="photo">...</dt><dt><a>제목</a></dt><dd>요약 ... <span class="date">5시간전</span></dd></dl></li>`. 카운트는 unique 기사 URL set 으로.
- **followers.json**: JSON API. `extract_subscriber_count` 가 다양한 키 시도 (`totalCount`, `total`, `count`, `subscriberCount` 등) + 중첩 (`result.*`, `data.*`) 자동 탐색.
- 셀렉터 추가/패치 시 [scripts/lib/naver.py](scripts/lib/naver.py) 의 `_*_SELECTORS` 우선순위 리스트 맨 앞에 새 셀렉터 추가.

### 판단 사항 (의식해야 할 디자인 결정)
- **댓글 sentiment**: DB에 sentiment 컬럼 없음 → `comment_count` 직접 기준 배지 ("매우 활발 ≥500 / 활발 ≥200 / 보통"). 실 NLP 붙이려면 스키마 + AI 파이프라인 필요.
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
d:\newsboard 작업 이어가자. CLAUDE.md "현재 진행 상태" + "재개 지점" 확인해줘.
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
│   │   ├── compare/
│   │   │   ├── page.tsx
│   │   │   ├── CompareTabView.tsx
│   │   │   └── MediaSelector.tsx
│   │   ├── gap/
│   │   │   ├── page.tsx
│   │   │   ├── actions.ts    # markReviewing / markResolved Server Action
│   │   │   └── ReviewButton.tsx
│   │   ├── analytics/
│   │   │   ├── subscribers/page.tsx
│   │   │   └── comments/page.tsx
│   │   └── report/page.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── dashboard/*
│   └── lib/
│       ├── queries.ts        # 모든 DB 조회 함수
│       ├── supabase.ts       # Supabase JS 클라이언트
│       ├── naver-section.ts  # 섹션 타입 + SECTION_ORDER 상수
│       └── database.types.ts # Supabase 자동 생성 타입
├── api/                      # Python FastAPI (Vercel Fluid Compute)
│   ├── index.py              # ASGI 엔트리 (FastAPI app)
│   ├── lib/
│   │   ├── db.py             # Supabase Python 클라이언트
│   │   ├── ai.py             # OpenAI / AI Gateway 래퍼
│   │   └── models.py         # Pydantic 응답 스키마
│   └── routes/
│       ├── issues.py
│       ├── ranking.py
│       ├── gap.py
│       ├── subscribers.py
│       ├── comments.py
│       └── report.py
├── scripts/                  # GitHub Actions 에서 직접 호출하는 Python 스크립트
│   ├── collect_ranking.py
│   ├── collect_publications.py  # 자사 전체 기사 → article + daily_publication_count
│   ├── collect_section_ranking.py
│   ├── collect_subscribers.py
│   ├── collect_comments.py
│   ├── cluster_articles.py
│   ├── detect_gap.py         # 미보도 탐지 → missed_issue_alert
│   └── lib/
│       ├── db.py
│       ├── http.py
│       ├── naver.py
│       └── cluster.py
├── .github/workflows/        # GitHub Actions (8종)
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── requirements.txt
├── vercel.json
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

- Node.js 24 LTS가 현재 기본.
- AI 백엔드는 OpenAI 직접 (`AI_BASE_URL=https://api.openai.com/v1`). Vercel AI Gateway 전환 시 모델명 `provider/model` 형태로 변경 필요.
