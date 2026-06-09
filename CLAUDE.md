# Newsboard — AI 기반 미디어 모니터링 대시보드

뉴스 조직 내부용 AI 미디어 모니터링 및 인사이트 대시보드 프로젝트.

## 협업 규칙 (필수)

- **사용자가 "이해했어?" 라고 물으면**: 이해했는지 여부만 대답한다. 코드 수정·파일 변경·배포 등 어떤 작업도 즉시 실행하지 않는다. 사용자가 확인 후 명시적으로 진행 지시를 내릴 때까지 대기한다.
- **모델 전환 요청**: Claude가 직접 모델을 바꿀 수 없다. 더 강한 추론이 필요한 단계(프롬프트 품질 튜닝, 복잡한 아키텍처 판단 등)에서는 사용자에게 **명시적으로 "이 단계는 Opus로 올려주세요"** 라고 요청한다. 기본 구현 작업은 Sonnet으로 진행한다.

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

## 자동화 파이프라인 (NCP worker cron, 12종) — 33차 이전 완료

> **33차(2026-05-28) 수집 인프라 NCP 이전 완료.** 아래 12종 cron 은 이제 **NCP VM Docker worker(`worker-worker-1`)의 `/etc/cron.d/newsboard`(crontab)** 에서 실행된다. GitHub Actions 워크플로 13종은 **전부 비활성화(`disabled_manually`)** 됨 — 삭제 아님(롤백 대비). `Build Worker Docker Image` 만 active.
> - 코드 push → GitHub Actions 가 Docker 이미지 빌드 + GHCR push (`ghcr.io/woos2324/newsboard-worker:latest`)
> - NCP 반영은 **수동**: `infra-mcp` 의 `deploy_worker` (= `docker compose pull && up -d`) 또는 직접 SSH
> - 배포 자동화 MCP: [D:\mcp\infra-mcp](D:\mcp\infra-mcp) (CLAUDE.md 별도). config: host `10.36.194.36`, user `segyecom`, compose_path `/home/segyecom/worker`
> - 트리거 표의 "성공 직후 연쇄"는 GitHub Actions 전제였고, NCP crontab 은 **고정 시각(UTC)** 으로 동작 (아래 [crontab](crontab) 참조)

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
| cron-naver-pv | 매일 KST 01:00 | 네이버 파트너센터 PV 수집 → 4개 테이블 |
| **cron-foreign-editorials** | **UTC 22:00 (KST 07:00)** | **해외 매체 사설 수집 + gpt-4o-mini 한국어 번역 → foreign_editorial** |

**cron chain**: `ranking → cluster → gap` (매시 자동 연쇄)

## DB 스키마 (마이그레이션 23건)

- `0001_init` — 11개 코어 테이블
- `0002` ~ `0006` — daily_publication_count, section_ranking, 성능 인덱스, section_ranking_unique, gap_verdict
- `0007~0012` — RLS 활성화 (전체 14개 테이블)
- `0013~0014` — editorial 인덱스 3개 (19차)
- `0015` — editorial.edition_date DATE 컬럼 추가 (20차)
- `0016` — PV 데이터 4개 테이블 (article_pv_snapshot, hourly_pv_snapshot, traffic_source_daily, search_keyword_daily) (21차)
- `0017` — article_pv_snapshot.article_url 컬럼 추가 (21차)
- `0018` — naver_session 쿠키 캐시 테이블 (21차)
- `0019` — daily_report / daily_report_section / daily_report_article 3개 테이블 (사설 일일 동향 보고서, 22차)
- `0020` — article_pv_snapshot.time_dimension + daily_cv_snapshot (26차)
- `0021` — foreign_editorial 신규 (해외 매체 사설, 28차)
- `0022` — foreign_session 쿠키 캐시 (해외 매체별, 28차)
- `0023` — profiles (auth.users 1:1, role/approved 기반 접근 제어, 30차)
- `0024` — profiles RLS 보안 패치 (31차)
- `0025` — trending_keyword 6개 컬럼 추가 (search_volume, growth_rate, started_at, started_ago_text, status, related_queries) (34차)
- `0026` — autowrite 3개 테이블 (reporter_style_profile / article_fact / article_draft + RLS, 35차)
- `0027` — profiles 로그인 잠금 (failed_login_attempts INT, locked BOOL, 37차)
- 마이그레이션 상세: [supabase/migrations/](supabase/migrations/)
- 매체 51개 (naver_media_id 보유 47개) + 해외 8개 매체 코드 (foreign_sources.py: wapo/nyt/ft/scmp/guardian/wtimes/mainichi/sankei)

## 환경변수

**Vercel Production + GitHub Secrets (동일)**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_LEGACY_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **필수**, Supabase Legacy `service_role` JWT(`eyJ...`). 신 포맷(`sb_secret_...`) 사용 시 Python 스크립트 전체 중단.
- `AI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY`, `DEFAULT_AI_MODEL=gpt-4o-mini`, `DEFAULT_EMBED_MODEL=text-embedding-3-small`
- `NAVER_PARTNER_ID`, `NAVER_PARTNER_PW` — 네이버 파트너센터 공용계정 (GitHub Secrets + .env.local)

**로컬 .env.local 추가 항목** (GitHub Secrets에 없는 것):
- `HEADLESS=0` — Playwright 브라우저 표시 (로컬 디버깅용, 운영은 기본값 1)

**Supabase Auth (Email OTP) — 30차 신규 설정**:
- SMTP: Resend (`smtp.resend.com:587`, username `resend`, password = Resend API key)
- 발신 도메인: `send.segye.com` 서브도메인 (Akamai DNS 에 DKIM/MX/SPF 등록, Verified)
- Sender email: `noreply@segye.com`
- Email Template "Confirm signup" → `{{ .Token }}` 으로 OTP 6자리 발송 (10분 만료)
- 비밀번호 정책: 8자 이상, 대소문자 + 숫자 + 특수문자

## 재개 지점 (2026-06-09, 37차 세션 종료)

**이번 세션 (37차) 완료**:

### 1. 경쟁사 비교 — 수집 매체 전체 노출 (선택 UI 동적화)

- **문제**: `/compare` 에서 수집 매체가 다 안 나옴. 원인은 수집/데이터가 아니라 [MediaSelector.tsx](src/app/compare/MediaSelector.tsx) 의 `CHIP_LIST` 가 **10개 매체 하드코딩** (실제 활성 수집 매체는 자사 포함 48개, 최근 24h 47개 데이터 적재).
- **수정**:
  - `getActiveCompareMedia()` 추가 ([queries.ts](src/lib/queries.ts)) — `is_active=TRUE AND naver_media_id IS NOT NULL` 전체 조회, `unstable_cache` `compare` 태그 재사용
  - [page.tsx](src/app/compare/page.tsx) — 전체 매체 옵션 prop 주입, `DEFAULT_MEDIA` 주요 9개 경쟁사로 복원(빈 화면 방지), `explicit` prop 전달
  - [MediaSelector.tsx](src/app/compare/MediaSelector.tsx) — 하드코딩 제거. 선택 칩(× 제거, segye 고정) + "매체 추가" 검색 드롭다운(외부 클릭 닫힘)
- **localStorage 저장/복원**: `?media=` 명시 선택은 `compare:media` 키로 저장, 파라미터 없이 진입 시 마지막 선택 복원(`router.replace`). 기기/브라우저 단위. 서버는 기본값 렌더 후 클라가 복원 → 커스텀 조합 시 짧은 깜빡임 있음(내부도구라 허용).

### 2. 로그인 5회 실패 시 계정 잠금 (관리자 수동 해제)

- **`0027_profiles_login_lock`** — `profiles.failed_login_attempts INT`, `locked BOOL` 추가 (운영 DB 적용 완료)
- [login/actions.ts](src/app/(auth)/login/actions.ts) — 인증 전 이메일로 잠금 확인 → 잠겼으면 즉시 거부. 실패 시 카운트+1, **5회 도달 시 `locked=true`**. 성공 시 카운트·잠금 초기화. **superadmin 은 락아웃 제외**(영구 잠금 방지)
- 회원관리 ([UsersTable.tsx](src/app/admin/users/UsersTable.tsx) / [actions.ts](src/app/admin/users/actions.ts)) — `잠김` 배지 + `잠금 해제` 버튼(`unlockUser`, superadmin 전용, `locked=false`+`attempts=0`)
- **E2E 테스트 7/7 PASS** — 일회용 reporter 계정 + Playwright(python) 로 로컬 dev 실제 로그인 화면 구동: 1~4회 일반실패 / 5회째 잠김 / DB locked·attempts 기록 / 잠긴 상태 정답거부 / 해제 / 해제후 정답 성공. 테스트 계정 삭제 완료
- **이메일 대소문자**: 가입(`requestSignupOtp` lowercase + GoTrue 정규화 → `profiles.email` 소문자) / 로그인(입력 lowercase) 모두 소문자 통일 확인. DB 현 6명 mixed_case 0건. **잠금 매칭 정상, 수정 불필요**

**판단 사항 (37차)**:
1. **검색 드롭다운 UX 채택** — 48개 매체를 칩 전체 나열(화면 차지)·카테고리 그룹(DB 분류 컬럼 없음) 대신 검색+다중선택. 확장성·화면 깔끔함 우선.
2. **localStorage(계정 DB 저장 X)** — 매체 선택 기억은 기기 단위면 충분. DB/마이그레이션 부담 회피.
3. **superadmin 락아웃 제외** — 마지막 관리자가 잠기면 영구 잠금(DB 직접 복구 필요). 자동 잠금 대상에서 superadmin 제외.
4. **잠김 메시지 명시적 유지** — "5회 실패로 잠겼습니다" 가 계정 존재 신호가 되지만 사내 도구라 허용. 모호화 미적용.

**미완료 (다음 세션)**:
- 기존 미완료 항목 유지 (naver-pv KST 05:00 수집 재확인, 사설 백필, signup UI 다듬기 등)

---

## 재개 지점 (2026-06-02, 36차 세션 종료)

**이번 세션 (36차) 완료**:

### 1. autowrite M3/M4 완료

**M3 — Lazy 팩트 추출**
- `api/lib/fact_extractor.py` — related_news URL 크롤링 + GPT gpt-4o-mini 팩트 추출 + `og:image` 추출 → `article_fact` 캐싱
- `POST /api/autowrite/facts` — 캐시 히트 즉시 반환, 미스 10~20초
- `GET /api/autowrite/keywords` — 미보도 활성 트렌드 키워드 목록

**M4 — 초안 생성 + 검수 UI**
- `POST /api/autowrite/draft` — reporter_id 있으면 문체 프로파일+few-shot 포함, 없으면 팩트만으로 gpt-4o 초안 생성
- 트렌딩 우측 패널: "추천 기사 제목" 삭제 → reporter 전용 "초안 작성" 섹션 (DraftSection)
- `src/app/autowrite/[draft_id]/page.tsx` — 초안 상세 (좌측 본문 + 우측 팩트 패널 w-[470px])
- `/api/autowrite/drafts` — 본인 초안 목록 (세션 쿠키 인증)
- 뒤로 가기 시 키워드 패널 자동 복원 (`?keyword=` URL 파라미터)
- 김현주 계정 생성: `egg0love@segye.com` / reporter 역할 / 즉시 승인

**판단 사항 (36차)**:
1. **M3/M4에 OpenSearch 불필요** — M1/M2 한정. M3는 `trending_keyword.related_news` URL 크롤링으로 충분.
2. **팩트 추출 URL별 개별 GPT 호출** — UNIQUE(keyword, source_url) 캐시와 자연스럽게 매핑.
3. **reporter_id null → 빈 문자열** — `article_draft.reporter_id` NOT NULL 제약 대응.
4. **FactImage Client Component 분리** — Server Component에 onError 핸들러 불가.
5. **`/api/autowrite/drafts` 세션 쿠키 인증** — 미들웨어 x-user-* 헤더가 API Route에 전달 안 됨.

### 2. 버그 수정 및 개선

- **트래픽 시간대별 PV 0 재발** — 6/1 hourly 데이터 전부 0(KST 05:00 집계 미완료). `getLatestTrafficDate()`를 `hourly_pv_snapshot pv>0` 기준으로 변경. 6/1 데이터는 수동 실행(KST 15:30)으로 백필 완료(141만 PV). `upsert_hourly_pv`에 전 시간대 0 경고 로그 추가.
- **경쟁사 비교 탭 전환 속도** — `getCompareMatrix`를 N+1 쿼리 → `ranking_news_snapshot` 기반 3번 통합 쿼리로 최적화. `getCompareMatrix`·`getSectionRankings` `unstable_cache` 1시간 적용.
- **스켈레톤 UI 불일치** — 트렌딩(카드그리드→테이블구조), 트래픽(신규), 회원관리(신규) loading.tsx 실제 레이아웃에 맞게 재작성.

### 3. 캐시 자동 무효화 (On-demand Revalidation 전면 도입)

- `scripts/lib/revalidate.py` 공용 유틸 생성
- `/api/revalidate` 엔드포인트에 `compare`, `articles` 태그 추가 (총 5개)
- 9개 수집 스크립트 완료 시 해당 태그 즉시 무효화:
  - collect_ranking → compare, dashboard
  - collect_publications → articles, dashboard
  - collect_section_ranking → compare
  - collect_subscribers, collect_comments, cluster_articles, detect_gap → dashboard
  - collect_naver_pv → traffic
  - collect_trends → trending

### 4. UI 개선

- 트렌딩: 보도됨 키워드에 녹색 바 추가 (미보도=빨강, 보도됨=초록)
- collect_trends.py: `title_suggestions` AI 생성 제거 (summary만 유지, 비용 절감)

**미완료 (다음 세션)**:
- ⚠ naver-pv KST 05:00 수집 재확인 필요 — 내일(6/3) 로그 확인 후 수집 시간 조정 여부 결정
- 기존 미완료 항목 유지 (사설 백필, signup UI 등)

---

## 재개 지점 (2026-06-01, 35차 세션 종료)

**이번 세션 (35차) 완료**:

### 1. 버그 수정 3건

- **트래픽 시간대별 조회수 0** — 네이버 hourly API는 KST 01:00에 전날 데이터 집계 미완료 → `cv=0` 반환. cron `UTC 16:00 → UTC 20:00`으로 변경. 2026-05-29~31 3일치 백필 완료.
- **사설/해외번역 AI 분석 누락** — OpenAI 크레딧 소진 + 트렌딩 cron rate limit 충돌. retry 3→5회, 지수 백오프(`min(30*2^n, 480)s`), 건 사이 sleep 5s 적용.
- **6/1일 사설·해외번역** — 크레딧 충전 후 NCP cron 자동 복구 (수동 백필 불필요).

### 2. autowrite — 기자 문체 기반 초안 작성 기능

- **설계 확정** (`documents/autowrite.md` 전면 재작성) — 외부 설계안 비교 검토 + OpenSearch 실측 검증 반영
  - 학습 데이터: OpenSearch API `web_articles_v2` (550만 건, 본문·기자·byline 완비)
  - 매칭 키: `reporter_id` (이메일 더미 오염 → `reporter_id`가 이메일 local part와 동일, 일관)
  - 팩트 추출: **Lazy** (초안 진입 시 + 캐싱) — Eager 전량은 99% 낭비
  - 프로파일: 계정 비의존(`reporter_id` 키) → 오픈 전 선학습 → 가입 시 `profiles.email` local part 연결
- **M1 완료** — `scripts/lib/opensearch_client.py` + DB 마이그레이션 `0026_autowrite_tables` (`reporter_style_profile` / `article_fact` / `article_draft` + RLS)
- **M2 완료** — `scripts/generate_style_profiles.py` (gpt-4o, `--all-domains`, `--skip-existing`) → **212명 전원 성공** (실패 0명, ~53분 소요)

**판단 사항 (35차)**:
1. **gpt-4o 선택** — 프로파일은 초안 품질의 근간, 1회성 배치라 비용 부담 낮음. gpt-4o-mini 부적합.
2. **도메인 필터 Python 레벨** — OpenSearch wildcard leading-`*` 불허 → aggregation 후 Python에서 suffix 매칭.
3. **reporter_id 그룹핑** — 같은 기자가 `reporter_email`이 정상/더미로 갈려도 `reporter_id`는 일관. 그룹핑 키로 확정.
4. **rate limit 패턴** — gpt-4o 호출마다 429 걸리고 30s 후 자동 복구. 5회 retry로 안정 처리.

**미완료 (다음 세션)**:
- ⚠ **M3**: 미보도 트렌드 키워드 → `related_news` 본문 크롤링 → 팩트 추출 → `article_fact` 캐싱 (Lazy)
- ⚠ **M4**: 초안 생성 API + 검수 UI (reporter 전용, `roles.ts` 연동)
- ℹ️ OpenSearch NCP ACG 미개방 메모는 **M1/M2 한정** (이미 완료). M3/M4는 OpenSearch 불필요 — `trending_keyword.related_news` URL 크롤링 + Supabase `reporter_style_profile` 조회만으로 구현 가능
- 기존 미완료 항목 (naver-pv revalidate, 사설 백필 등) 유지

---

## 재개 지점 (2026-05-29, 34차 세션 종료)

**이번 세션 (34차) 완료** — 실시간 트렌드 v2 전면 개편:

### 1. 실시간 트렌드 수집기 전환 (RSS → DOM 파싱)

- **수집원**: `trending/rss?geo=KR` (10건, 대략 수치) → `trending?geo=KR&hl=ko&hours=24&status=active` (25건, Playwright DOM)
- **수집 주기**: crontab `*/10` → `*/3` (3분)
- **신규 수집 데이터**: 정밀 검색량(`search_volume` 정수), 증가율(`growth_rate` %), 시작시각(`started_at`), 관련검색어(`related_queries text[]`), 관련뉴스(행 클릭 → `a.xZCHj`, 3건 고정 확인)
- **파싱**: td 인덱스 기반(셀렉터 변동 대비). 한국어 단위 정규화(`5천+`→5000, `1만+`→10000). 시작시각 역산(`N시간 전` → timestamptz)
- **기존 재사용**: 클러스터 매칭, AI 캐시(1시간), AI 요약/제목추천 — 관련검색어도 AI 입력에 추가
- **hours 파라미터 검증**: `hours=1` = `hours=24`와 동일(구글이 최솟값 24h 처리). `hours=4`는 4시간 이내만 → 시간대별 건수 들쑥날쑥. `hours=24`로 25건 안정 수집 확정.
- **DB 마이그레이션**: `0025_trending_v2` — trending_keyword에 6개 컬럼 추가 (NULL 허용, 기존 호환)
- 설계 명세서: [documents/trending-v2-spec.md](documents/trending-v2-spec.md)

### 2. 실시간 트렌드 UI 전면 재구성 (C안 신호등 대시보드)

- **메인**: 컴팩트 테이블 (순위·키워드·검색량·증가율·신선도🟢🟡🔴·보도) + 정렬(구글순위/신선도/증가율/검색량) + 미보도 필터
- **신선도 기준**: 🟢 1시간 이내 / 🟡 1~6시간 / 🔴 6시간 초과 (hours=24 기준)
- **미보도 인디케이터**: `border-l` → 독립 셀(w-6)에 둥근 pill 막대로 분리
- **우측 확장 패널** (행 클릭 시 `w-1/3` 슬라이드): 핵심 지표 4개 · 우리관측 추이 SVG 라인그래프 · AI요약 · 추천제목(복사버튼) · 관련검색어 칩 · 관련보도 · 자사기사 · 외부링크(구글탐색/검색/네이버)
- **InfoTip(ⓘ) 공용 컴포넌트** ([src/components/InfoTip.tsx](src/components/InfoTip.tsx)): `position:fixed` + onMouseEnter 좌표 계산 → `overflow-auto` 컨테이너 클리핑 완전 해결, `text-left` 정렬 통일
- **신규 파일**: `src/components/trending/TrendingClient.tsx`, `src/app/api/trending/history/route.ts`
- **경쟁 컬럼 제외 결정**: 구글 관련뉴스 3건 고정(변별력 없음) + 경쟁사 article은 랭킹 진입분만 수집(과소 집계) → 신뢰 불가

### 3. 기타

- **`scripts/collect_editorials_data_backfill.py`** 신규 추가 — AI 분석 없이 원천 데이터만 수집하는 사설 백필 전용 스크립트
- **`/api/revalidate?tag=`** 엔드포인트 추가 — `unstable_cache` Data Cache 수동 무효화용 (`traffic`/`trending`/`dashboard` 태그 지원). 트래픽 캐시 오염 시 호출: `https://newsboard-two.vercel.app/api/revalidate?tag=traffic`
- **NCP SSH 수동 실행**: infra-mcp는 allowlist된 docker compose 명령만 허용 → 임의 명령은 paramiko 직접 스크립트로 실행 (password: config.yaml)

**판단 사항 (34차)**:
1. **hours=24 확정** — `hours=4`는 시간대별 건수 불안정. `hours=24`로 25건 고정.
2. **경쟁 컬럼 제외** — 구글 3건 캡 + 경쟁사 랭킹 누락으로 신뢰 불가. 자사 보도 여부(전체 발행 기준)만 핵심 신호.
3. **InfoTip position:fixed** — `overflow-auto` 부모의 클리핑은 z-index로 해결 불가. fixed + JS 좌표가 유일한 CSS-only 해법.
4. **unstable_cache Data Cache** — Vercel redeploy로는 초기화 안 됨. `revalidateTag()` 호출 필요. `/api/revalidate` 엔드포인트로 수동 무효화.
5. **트래픽 총 조회수 0 원인** — 수집 전 빈 결과가 24h 캐시에 저장. `/api/revalidate?tag=traffic` 호출로 해결.

---

**미완료 / 다음 세션 이어받을 것 (34차 기준)**:
- ⚠ `/api/revalidate` → `collect_naver_pv.py` 수집 완료 후 자동 호출로 캐시 즉시 갱신 (On-demand Revalidation 부분 구현)
- ⚠ 트렌드 추이 그래프: 데이터 며칠 누적 후 의미 있어짐 (현재 초기 단계)
- ⚠ 사설 과거 데이터 백필 (3월 남은 구간)
- ⚠ `/signup` Email UI 다듬기 (33차 이월)
- ⚠ wapo cron 실동작 확인 (33차 이월)

---

## 재개 지점 (2026-05-28, 33차 세션 종료)

**이번 세션 (33차) 완료** — 수집 인프라 NCP 이전 + 해외 매체 수집기 개선:

### 1. 수집 로직 NCP 이전 (NCP 전면 이전 로드맵 1단계 완료)

- **NCP VM Docker worker 가동 중** — `worker-worker-1` 컨테이너, crontab 12종 전부 정상 동작 확인
  - 구성: [Dockerfile](Dockerfile) (Playwright 베이스 + cron), [crontab](crontab), [entrypoint.sh](entrypoint.sh), [worker/docker-compose.yml](worker/docker-compose.yml)
  - NCP VM: Rocky Linux 8, 내부 IP `10.36.194.36`, segyecom 계정 (docker 그룹), compose_path `/home/segyecom/worker`
  - 이미지: `ghcr.io/woos2324/newsboard-worker:latest` (GHCR)
- **GitHub Actions 13종 전부 비활성화** (`gh workflow disable`) — `Build Worker Docker Image` 만 active 유지
  - 삭제 아님 — `gh workflow enable <id>` 로 즉시 롤백 가능
  - 수집 중복 방지: NCP cron 과 GitHub Actions 동시 실행 막으려 비활성화
- **배포 자동화 — infra-mcp** ([D:\mcp\infra-mcp](D:\mcp\infra-mcp), CLAUDE.md 별도)
  - SSH(paramiko) 기반 MCP 서버. allowlist 된 docker compose 명령만 실행
  - 툴: `deploy_web`/`deploy_worker`(`pull && up -d`), `tail_logs`(1~300줄), `check_status`(`ps`)
  - `.mcp.json` 등록 (Claude Code + Codex 양쪽)
  - ⚠ MCP `deploy_worker` 가 간헐적 `SSH error` 반환 — 이번 세션은 직접 SSH(paramiko)로 배포 성공. 원인 미파악
- **배포 흐름**: `git push` → GitHub Actions 이미지 빌드(~1분) → `deploy_worker` 또는 직접 SSH 로 NCP pull+재시작

### 2. 해외 매체 수집기 전면 개선 (커밋 `95c844d`)

NCP 한국 IP 로 GitHub Actions(Azure IP) 차단이 일부 해제됨을 확인하고 매체별 재점검:

| 매체 | 결과 | 조치 |
|---|:-:|---|
| **mainichi** | ✅ 정상 (10건) | NCP 에서 httpx 정상 수집 확인. `edition_date` 타임존 파싱 수정 후 5/24~5/28 백필 |
| **sankei** | ✅ 정상 | 기존 동작 유지 |
| **guardian** | ✅ 정상 (20건) | 기존 동작 유지 |
| **wtimes** | ✅ 수정 완료 | 본문 셀렉터 `div.bigtext` 추가 ([wtimes.py](scripts/lib/foreign_collectors/wtimes.py)). 하루 1건 발행 매체 |
| **scmp** | ✅ 수정 완료 | INDEX_URL → `/author/scmp-editorial`, **로그인 불필요** 확인 후 로그인 로직 제거. `Editorial \|` 접두어 제거 |
| **wapo** | ⚠ 코드 완료 | Playwright(www 도메인 HTTP/2 차단) → **RSS(`feeds.washingtonpost.com`) + httpx + `__NEXT_DATA__` JSON** 으로 전환. 쿠키 시딩 시 페이월 해제(300자→2500자+). **단 집중 테스트로 NCP IP 일시 차단됨 — 일 1회 cron 실동작 확인 필요** |
| **nyt** | ❌ 차단 | DataDome 이 기사 페이지 IP 차단 (403, Cloudflare challenge). 쿠키 무관. RSS 요약(70~235자)만 가능 |
| **ft** | ❌ 차단 | 로그인에 **hCaptcha** — 데이터센터 IP 차단. httpx/Playwright + 쿠키 모두 403. 쿠키로 우회 불가 |

- **`edition_date` 타임존 파싱 수정** ([collect_foreign_editorials.py](scripts/collect_foreign_editorials.py)) — Python 3.10 `fromisoformat` 이 `+0900`(콜론 없는 오프셋) 미지원 → `+09:00` 정규화. mainichi `edition_date` NULL 들어가던 버그 해결
- **쿠키 시딩 완료** — wapo 45개 / ft 27개 DB 저장 (만료 2026-06-27). EditThisCookie (fork) 확장으로 추출 → `--seed-cookies <src> --cookies-file <path>`
  - 단, ft 는 IP 차단이라 쿠키 있어도 수집 불가. wapo 만 쿠키 효과 있음(페이월 해제)
- **nyt.py** — httpx 제거하고 Playwright 전용으로 전환했으나 DataDome 차단으로 결국 본문 0자

### 3. 트렌드 키워드 중복 표시 버그 수정 (커밋 `c55d4ca`)

- 대시보드 "구글 급상승 검색어"가 20건(중복)으로 표시되던 버그
- 원인: [getTrendingKeywords](src/lib/queries.ts) 가 최신 `fetched_at` **±5분 범위**를 조회 → 10분 미만 간격으로 2회 수집 시 두 배치(20건)가 합쳐짐
- 수정: `.gte(batchStart)` → `.eq(latest.fetched_at)` 정확 일치. 수집 빈도 무관하게 10건만 표시

**판단 사항 (33차)**:
1. **GitHub Actions 비활성화(삭제 X)** — NCP 안정화 전까지 롤백 경로 유지. `Build` 워크플로만 살려 이미지 빌드는 계속.
2. **NCP IP 로도 nyt/ft 는 차단** — DataDome/hCaptcha 는 IP 레벨이라 쿠키로 우회 불가. 구조적 한계로 보류. wapo 는 RSS+`__NEXT_DATA__` 우회 성공.
3. **scmp 로그인 제거** — `/author/scmp-editorial` 페이지가 본문까지 무료 공개. 구독 계정 불필요로 코드 단순화.
4. **wapo httpx 동기 Client를 executor 로 실행** — async httpx 가 NCP↔WaPo 간 `ReadTimeout` 빈발 → `httpx.Client`(동기)를 `run_in_executor` 로 우회. 요청 간 5초 sleep.
5. **트렌드 쿼리 정확 일치** — 3분 간격 수집 계획 대비. ±5분 범위는 고빈도 수집과 충돌.

---

**미완료 / 다음 세션 이어받을 것 (33차 기준)**:

**(진행 중 검토) 실시간 트렌드 — RSS → Playwright DOM 전환** (미구현, 설계만):
- 현재 `collect_trends.py` 는 `https://trends.google.com/trending/rss?geo=KR` (인기 급상승 10건, 대략 수치)
- 목표: `https://trends.google.com/trending?geo=KR` (실시간 인기 25건+, 정밀 수치 `50K+`, 시작 시각, 관련 검색어)
- NCP Playwright 로 DOM 파싱 검증 완료 (table tbody tr: 헤더1+25건, cells[1]=키워드 / [2]=트래픽 / [3]=시작시각 / [4]=관련검색어)
- batchexecute 내부 API(`/_/TrendsUi/data/batchexecute` rpcids=Tnt4U)는 body 포맷 난해 → DOM 파싱이 현실적
- 계획: DB 컬럼 `started_at`/`related_queries` 추가 + crontab `*/10` → `*/3` + UI(시작시각 뱃지, 25건 표시 구조, 트래픽 수치 개선)
- AI 비용: 기존 1시간 캐시(`_load_recent_ai_content`) 그대로 → 3분 간격이어도 실변경 2~3건만 AI 호출

**(확인 필요) wapo cron 실동작** — 집중 테스트로 IP 일시 차단됨. 일 1회 cron(UTC 22:00)에서 정상 수집되는지 다음날 로그 확인

**(미해결, 32차에서 이어짐)**:
- ⚠ `/signup` Email UI 다듬기 (단계 문구 간격, "사번 이메일"→"이메일", 비번 불일치 인라인 표시, Email Template 제목 한국어화)
- ⚠ 메인 메일서버 segye.com SPF 정렬 / superadmin 2명 유지
- ⚠ 사설 과거 데이터 백필 (3월 구간) / nyt·ft 차단 / On-demand Revalidation 등

---

## 재개 지점 (2026-05-26, 32차 세션 종료)

**이번 세션 (32차) 완료** — 인증 UI/UX 개선 + 보안 강화:

- **사업부 → 트래픽 메인 redirect** ([src/app/(auth)/login/actions.ts](src/app/(auth)/login/actions.ts), [src/middleware.ts](src/middleware.ts))
  - 로그인 성공 시 business 역할 → `/traffic` redirect (기존: `/`)
  - 미들웨어: business 역할이 `/`에 오면 `/traffic` redirect
  - Sidebar: business 역할 대시보드 메뉴 숨김

- **브라우저 푸시 알림** (신규 가입 신청 시 superadmin 알림)
  - `src/lib/push.ts` — web-push 서버 유틸, superadmin 구독자 전체 발송
  - `public/sw.js` — Service Worker (백그라운드 수신 + 클릭 시 /admin/users)
  - `src/app/api/push/subscribe/route.ts` — 구독 등록/해제 API
  - Topbar 벨 아이콘 — superadmin 전용, 구독 상태 점 표시 (녹색/빨강/회색)
  - business + admin 가입 시 모두 푸시 발송
  - VAPID 환경변수: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - DB: `push_subscription` 테이블 (Supabase MCP로 직접 생성)

- **회원가입 역할 옵션 추가** ([src/app/(auth)/signup/page.tsx](src/app/(auth)/signup/page.tsx))
  - 기자·사업부만 → 관리자·기자·사업부 순서로 변경
  - 기본 선택값: 관리자

- **중복 가입 차단** ([src/app/(auth)/signup/actions.ts](src/app/(auth)/signup/actions.ts))
  - OTP 발송 전 profiles 테이블 이메일 존재 여부 확인
  - 미승인 상태면 `/signup/pending` redirect, 승인 완료면 "이미 가입된 이메일" 에러

- **비밀번호 찾기 기능** ([src/app/(auth)/reset-password/](src/app/(auth)/reset-password/))
  - 3단계 UI: 이메일 → OTP 인증 → 새 비밀번호 설정
  - 미가입 이메일: "가입되지 않은 이메일" 에러 + 회원가입 링크
  - 미승인 이메일: `/signup/pending` redirect
  - OTP 속도 제한 에러 한국어화 ("요청이 너무 잦습니다. N초 후 다시 시도해주세요.")
  - 변경 완료 후 전체 기기 세션 전역 무효화 (global signOut) → `/login` redirect
  - 로그인 상태에서 접근 시 `/`로 redirect (미들웨어)

- **로그인 페이지** — "비밀번호 찾기" 링크 추가 (가입하기 옆)

- **공개 페이지 대시보드 레이아웃 노출 수정** ([src/app/loading.tsx](src/app/loading.tsx))
  - 로그아웃 후 `/signup`, `/reset-password` 이동 시 AppShell 스켈레톤이 배경에 보이는 버그
  - 원인: 루트 `loading.tsx`가 Suspense fallback으로 모든 경로에 적용
  - 해결: `(auth)` 라우트 그룹으로 분리 → `(auth)/loading.tsx` null 반환, 루트 `loading.tsx` 복원

- **파일 구조 변경** — 인증 관련 페이지 `(auth)` 라우트 그룹으로 이동
  - `src/app/login/` → `src/app/(auth)/login/`
  - `src/app/signup/` → `src/app/(auth)/signup/`
  - `src/app/reset-password/` → `src/app/(auth)/reset-password/`

- **pending 페이지 문구 수정** — "사업부 계정은 관리자 승인 후 접근 가능합니다." → "승인 후 접근 가능합니다."

**판단 사항 (32차)**:
1. **business redirect 미들웨어 + 로그인 액션 양쪽 적용** — 로그인 직후(액션)와 `/` 직접 접근(미들웨어) 두 경로 모두 처리.
2. **푸시 알림은 superadmin 전용 UI** — 팀원(superadmin)이 각자 브라우저에서 허용해야 수신. 구독 상태는 브라우저/기기별 독립.
3. **비밀번호 찾기 OTP = signInWithOtp + shouldCreateUser:false** — 미가입자가 OTP로 신규 계정 생성하는 것을 방지.
4. **(auth) 라우트 그룹 분리** — URL은 변경 없음, loading.tsx 스코프만 분리.

---

**미완료 (다음 세션 이어받을 것)**:

**(당장) signup/Email UI 다듬기**:
- ⚠ `/signup` 페이지 — "단계 N/3" 안내 문구와 첫 입력 박스 사이 간격 좁힘
- ⚠ `/signup` 페이지 Step 1 — "사번 이메일" 라벨 → "이메일" 로 변경
- ⚠ `/signup` Step 3 — 비밀번호/비밀번호 확인 불일치 시 비밀번호 확인 input 아래에 빨간색 알림 표시
- ⚠ Supabase Email Template 제목 — "Confirm Your Signup" → "newsboard 인증 번호입니다"

**(미해결) 운영 이슈**:
- ⚠ **메인 메일서버에 segye.com 자체 SPF 정렬** — 사내 DNS에도 send.segye.com 레코드 동기화 필요
- ⚠ **superadmin 1명 락아웃 방어** — 운영상 superadmin 최소 2명 유지 권장

---

## 재개 지점 (2026-05-25, 31차 세션 종료)

**이번 세션 (31차) 완료** — 인증 버그 수정 + 보안 패치:

- **`0024_fix_profiles_rls` 마이그레이션** — `profiles` 테이블 보안 취약점 수정
  - `"service role full access"` 정책이 `TO` 절 없이 생성 → `{public}` (anon 포함) 전체에 적용
  - 익명 사용자가 모든 회원 정보 조회·수정·삭제 가능했던 취약점 → DB 즉시 제거
  - service_role 은 RLS 자동 bypass 이므로 해당 정책 자체가 불필요했음

- **회원가입 redirect 루프 수정** ([src/middleware.ts](src/middleware.ts))
  - OTP 인증 완료(세션 O) 후 Step 3 Server Action POST → 미들웨어가 "로그인된 사용자 공개경로 접근 → `/`"로 redirect → `/`에서 profile 없음 → `/login` redirect 루프
  - 수정: profile 체크를 public path redirect 앞으로 이동. profile 없는 로그인 사용자 + `/signup` = 통과 허용
  - 추가: profile 없는 사용자가 다른 경로 접근 시 세션 유지 + `/signup` redirect (이전: signOut + `/login`)

- **승인 대기 페이지 "로그인 화면으로" 버튼 수정** ([src/app/signup/pending/page.tsx](src/app/signup/pending/page.tsx))
  - `<Link href="/login">` → `<form action={signOutAction}>` 로 변경
  - 로그아웃 없이 `/login` 이동 시 미승인 세션 유지 → 미들웨어가 `/signup/pending` 으로 다시 redirect (무반응처럼 보이던 버그)

- **`completeSignup` 병렬화** ([src/app/signup/actions.ts](src/app/signup/actions.ts))
  - `updateUser(비밀번호)` + `profiles.insert` 순차 → `Promise.all` 병렬 처리
  - Supabase 왕복 1회 단축 (~200~400ms 개선)

**발견 이슈 — 자사 기사 현황 캐시 오염 (일시 자연복구)**:
- `/articles` 페이지에서 `총 N건` 표시는 정상이나 목록이 빈 현상 발생 (10분 후 자연복구)
- 추정 원인: 배포 전환 중 `unstable_cache` (TTL 600s) 에 빈 결과가 저장
- 재발 시 확인 순서: ① Vercel 최근 배포 시각과 현상 발생 시각 일치 여부 → ② 10분 대기 후 자연복구 여부 → ③ 지속 시 Vercel 대시보드 Redeploy 로 캐시 강제 무효화
- 근본 해결은 On-demand Revalidation 구현 시 함께 처리 (미완료 항목)

**판단 사항 (31차)**:
1. **profile 없는 로그인 사용자 세션 유지** — 로그아웃 강제 대신 `/signup` 유도. 미완성 세션은 Supabase JWT 만료(1시간)로 자연 처리.
2. **보안 패치 우선 적용** — `profiles` anon 노출은 즉시 위험. 배포 전에 DB 직접 패치.

---

## 재개 지점 (2026-05-24, 30차 세션 종료)

**이번 세션 (30차) 완료** — 로그인 + 역할 기반 접근 제어 시스템 구축:

- **DB 마이그레이션 1건**
  - `0023_profiles` — auth.users 1:1, role (superadmin/admin/business/reporter) + approved + 자동 updated_at trigger
  - RLS: 본인 row SELECT + service role 전체 접근

- **Supabase Auth 인프라**
  - `@supabase/ssr` 패키지 도입
  - 클라이언트 4종 분리: `supabase-server.ts` (Server Component/Action), `supabase-browser.ts` (Client), `supabase-middleware.ts` (Middleware), 기존 `supabase.ts` (service role)
  - 세션 쿠키 모드 — `maxAge`/`expires` 제거 → 브라우저 종료 시 자동 로그아웃
  - Resend SMTP + segye.com DNS 인증 (DKIM/MX/SPF on send.segye.com 서브도메인, DMARC X)

- **인증 페이지 + Server Actions** ([src/app/login](src/app/login), [src/app/signup](src/app/signup))
  - `/signup` — 이메일(@segye.com) → OTP → 이름·역할·비밀번호 3단계 폼
  - `/signup/pending` — 사업부 승인 대기 안내
  - `/login` — 이메일+비밀번호 + 미승인/미가입 사용자 차단

- **Middleware 접근 제어** ([src/middleware.ts](src/middleware.ts))
  - 비로그인 → /login 리다이렉트
  - approved=false → /signup/pending
  - 역할별 경로 검증 (`canAccessPath`)
  - **비활동 4시간 + 브라우저 종료 시** 자동 로그아웃 (`last_activity` 세션 쿠키, 5분 throttle)
  - RSC 요청 감지 → 쿠키 갱신 skip (Next.js multipart 응답 본문 보호)
  - profile 정보를 request header (`x-user-*`) 로 page render 에 전파

- **권한별 UI**
  - Sidebar — 역할 안 맞는 메뉴 자동 숨김, 하단 프로필 영역 삭제
  - Topbar 우상단 — 프로필 드롭다운 (이름·역할·이메일 + 로그아웃)
  - 대시보드 KPI 카드 — 권한 없으면 href + hover 비활성
  - `/admin/users` (superadmin 전용) — 가입자 목록 + 승인 / 역할 변경 / 삭제 (`auth.admin.deleteUser` → profiles CASCADE)

- **성능 최적화**
  - `getDashboardData()` — 대시보드 8개 쿼리 한 번에 5분 캐시 (`unstable_cache`)
  - `getCurrentProfile()` — middleware 가 전파한 header 에서 읽기 → 페이지 렌더링 시 DB 조회 0
  - `getCurrentProfileFromDb()` — Server Action 의 권한 검증용 (DB 직접 조회, 보안 우선)

- **역할-메뉴 매핑** ([src/lib/roles.ts](src/lib/roles.ts))

| 메뉴 | superadmin | admin | business | reporter |
|---|:-:|:-:|:-:|:-:|
| 대시보드 | ✅ | ✅ | ✅ | ✅ |
| 이슈/미보도/트렌드/비교/기사/리포트/독자반응 | ✅ | ✅ | ❌ | ✅ |
| 트래픽 / 구독자 | ✅ | ✅ | ✅ | ❌ |
| /admin/users | ✅ | ❌ | ❌ | ❌ |

**판단 사항 (30차)**:
1. **`foreign_editorial` 신규 테이블 분리** — 해외 매체는 `media_company_id` FK 안 맞아서 별도 테이블 (28차 결정 그대로). profiles 도 같은 이유로 `auth.users` 와 1:1 분리 — Supabase Auth 표준.
2. **`profiles.updated_at` + trigger 추가** — 계획서엔 없었으나 admin 회원관리에서 "최근 수정일" 추적용으로 추가.
3. **도메인 검증은 Server Action 레벨만** — DB CHECK 안 둠. superadmin 수동 추가 시 우회 번거로움.
4. **세션 쿠키 모드** — `maxAge`/`expires` 제거 → 브라우저 종료 시 자동 삭제. 비활동 4시간과 동시 적용.
5. **last_activity 5분 throttle + RSC 요청 skip** — 매 요청마다 쿠키 set → Next.js RSC streaming 응답의 multipart 구조 깨짐 (`--<boundary>` 본문 노출). 갱신 빈도 줄여서 해결.
6. **AppShell Server Component 전환** — 모든 페이지에서 profile prop 반복 전달 불필요. AppShellClient 분리해서 sidebar 토글 state 유지.
7. **middleware → header 전파 → getCurrentProfile DB 조회 제거** — 페이지 렌더링 속도 향상. 보안 검증은 getCurrentProfileFromDb 로 분리.
8. **getDashboardData 5분 통합 캐시** — 8개 쿼리 한 번에. cron-ranking 매시 + cron-publications 10분 주기에 맞춰 5분.
9. **profile 미존재 사용자 강제 로그아웃** — 가입 도중 이탈 (Step 3 미완료) 방어. 같은 이메일 재가입 시 새 비번으로 정상 가입 가능.
10. **본인 삭제 방지 코드 제거** — 사용자 요청. confirm 다이얼로그는 유지.
11. **Resend 도메인 인증은 send 서브도메인 분리** — 메인 segye.com 자체 메일서버 SPF/MX 와 충돌 회피. Resend Custom Return-Path `send` 사용.
12. **Email Template OTP 코드 방식** — Supabase 기본 매직 링크 → `{{ .Token }}` 6자리 코드로 변경. 우리 가입 폼이 OTP 입력 받는 구조라 매직 링크는 흐름 불일치.
13. **Akamai + NCP Global DNS 양쪽 동기화** — Akamai 장애 시 NCP 비상 운영 대비. 양쪽 모두 동일 DNS 레코드 등록.
14. **/signup/pending isPublicPath 예외 처리** — `PUBLIC_PATHS = ["/login", "/signup"]` 이라 `/signup/pending` 도 매칭됨. 그런데 미승인 로그인 사용자는 pending 페이지를 봐야 하므로, 로그인 사용자가 `isPublicPath` 매칭 시 `/`로 보내는 분기에서 pending 만 예외. 아니면 `/signup/pending` ↔ `/` 무한 루프.
15. **middleware redirect 응답에 Supabase 쿠키 동행** — `copyCookies(target, source)` helper. supabase 가 token refresh 시 set 한 새 cookie 를 redirect 응답에 옮기지 않으면 다음 요청에 만료 토큰 → 비로그인 인식 → 또 redirect 루프 위험.
16. **AppShell `redirect("/login")` 안전망 제거** — `/login` 페이지의 Link prefetch 가 AppShell 사용 페이지를 미리 가져오면서 header 없는 컨텍스트에서 `redirect("/login")` 호출 → 그 redirect digest 가 메인 `/login` 응답에 합쳐져 `/login` 자기 자신 무한 redirect (ERR_TOO_MANY_REDIRECTS). 인증 차단은 middleware 단일 책임으로 통합.

---

**미완료 (다음 세션 이어받을 것)**:

**(당장) signup/Email UI 다듬기**:
- ⚠ `/signup` 페이지 — "단계 N/3" 안내 문구와 첫 입력 박스 사이 간격 좁힘
- ⚠ `/signup` 페이지 Step 1 — "사번 이메일" 라벨 → "이메일" 로 변경
- ⚠ `/signup` Step 3 — 비밀번호/비밀번호 확인 불일치 시 비밀번호 확인 input 아래에 빨간색 알림 표시 (현재는 폼 상단 통합 에러 메시지로만 표시 — `handleStep3` 의 `setError("비밀번호가 일치하지 않습니다.")`)
- ⚠ Supabase Email Template 제목 — "Confirm Your Signup" → "newsboard 인증 번호입니다" (대시보드 Authentication → Emails → Templates → "Confirm signup" → Subject)
- ~~**가입 완료 직후 client-side exception**~~ ✅ 완료 (31차) — middleware redirect 루프 수정으로 해결
- ~~**비밀번호 찾기 기능**~~ ✅ 완료 (32차)
- ~~**회원가입 관리자 역할 추가**~~ ✅ 완료 (32차)
- ~~**중복 가입 차단**~~ ✅ 완료 (32차)

**(미해결) 운영 이슈**:
- ⚠ **메인 메일서버에 segye.com 자체 SPF 정렬** — 외부 DNS 는 OK, 사내 메일서버는 `send.segye.com` SPF 못 봄 → 차단 모드. 사내 DNS 에도 send.segye.com 레코드 동기화 필요.
- ⚠ **superadmin 1명 락아웃 방어** — 마지막 superadmin 이 본인 역할을 reporter 로 바꾸면 회원관리 페이지 영구 못 들어감. DB 직접 복구 필요. 운영상 superadmin 최소 2명 유지 권장.
- (기존 미완료 항목 그대로 — 해외 사설 NCP 이전 / 사설 백필 / 트래픽 페이지 추가 성능 최적화 등)

---

## 재개 지점 (2026-05-23, 29차 세션 종료)

**이번 세션 (29차) 완료** — 해외 매체 수집 파이프라인 완성 + Vercel 자동배포 연결:

- **Vercel 자동배포 GitHub 연동 완료**
  - newsboard 프로젝트가 GitHub에 미연결 상태였음 → Settings → Git → GitHub 버튼 → newsboard 저장소 Connect
  - 이제 `git push origin main` → Vercel 자동 빌드·배포

- **해외 매체 수집 GitHub Actions 실제 테스트 결과** (29차 핵심 발견):

  | 매체 | GitHub Actions | 원인 |
  |---|---|---|
  | **sankei** | ✅ 5건, 본문 880~909자 | 정상 수집 |
  | **guardian** | ✅ 20건, 본문 1200~1599자 | 정상 수집 |
  | mainichi | ❌ HTTP 403 | GitHub Actions IP 차단 |
  | wapo | ❌ HTTP/2 Protocol Error | GitHub Actions IP 차단 |
  | nyt | ❌ 인덱스 OK, 기사 httpx 403 | GitHub Actions IP 차단 |
  | ft | ❌ CAPTCHA (submit 버튼 비활성) | GitHub Actions IP 차단 추정 |
  | scmp | ❌ 로그인 흐름 미완성 | GitHub Actions IP 차단 추정 |
  | wtimes | ❌ Cloudflare + RSS 모두 403 | GitHub Actions IP 차단 |

  **근본 원인**: GitHub Actions는 Azure 데이터센터 IP → 주요 뉴스 사이트 CDN/WAF가 IP 레벨 차단.
  **해결 경로**: NCP 수집서버(한국 IP)로 이전 후 재시도 (로드맵의 NCP 이전 1단계).

- **쿠키 수동 시딩 CLI 구현** ([scripts/collect_foreign_editorials.py](scripts/collect_foreign_editorials.py))
  - `--seed-cookies <source> --cookies-file <path>` — EditThisCookie (fork) 확장으로 추출한 JSON 파일 직접 입력
  - EditThisCookie `sameSite`(`unspecified`/`no_restriction`) → Playwright(`None`/`Lax`/`Strict`) 정규화 (`_normalize_cookies`)
  - `expirationDate` → `expires` 필드명 변환
  - 쿠키 TTL: **30일** (기존 14일 → 확장)
  - NYT 쿠키 DB 저장 완료 (28개, 만료 2026-06-21) — 단, GitHub Actions IP 차단으로 기사 본문 수집 불가

- **수집 파이프라인 구현 완료 (코드 기준)**:
  - `playwright_base.py` — 쿠키 DB 관리 + Chromium 컨텍스트 + stealth + 정규화
  - `wapo.py`, `nyt.py`, `ft.py`, `scmp.py` — Playwright 로그인 + 쿠키 캐시 + 기사 수집
  - `wtimes.py` — httpx RSS 기반 (GitHub Actions에서 차단, NCP 이전 후 재활성화)
  - NCP 이전 후 모든 매체 수집 가능해질 것으로 예상

- **opinion 오늘의 사설 fallback 배너 추가**
  - 해외 논조 페이지에는 있었지만 오늘의 사설(`/`) 에는 없었음 → 동일 패턴 적용
  - `getLatestEditionDate()` 함수 추가 (`opinion/src/lib/queries.ts`)
  - 오늘 데이터 없을 때 amber 배너 + 최근 수집일 링크 표시
  - opinion 앱 수동 배포 완료 (https://opinion-eta.vercel.app)

**판단 사항 (29차)**:
1. **GitHub Actions IP 차단은 구조적 한계** — 코드 수정으로 해결 불가. NCP 이전이 선행 조건.
2. **NYT 인덱스는 작동** — 쿠키로 15건 목록 수집됨. 기사 본문만 IP 차단. NCP 이전 후 즉시 활용 가능.
3. **쿠키 시딩은 로컬 PC에서** — 사내망/개인 인터넷에서 실행 시 쿠키 정상 저장·수집 가능.

---

## 재개 지점 (2026-05-22, 28차 세션 종료)

**이번 세션 (28차) 완료** — 해외 매체 사설 수집 파이프라인 + 한국어 번역 + opinion UI:

- **DB 마이그레이션 2건**
  - `0021_foreign_editorial` — 해외 사설 신규 테이블 (source_code/country/language, title_original+title_ko, body_original+body_ko, ai_meta 등). RLS + anon read
  - `0022_foreign_session` — 매체별 쿠키 캐시 (M2 Playwright 대비)

- **수집 모듈 골격** ([scripts/lib/foreign_sources.py](scripts/lib/foreign_sources.py))
  - 7개 매체 메타 상수 (코드/국가/언어/페이월/fetcher 종류)
  - source_code → collector 함수 매핑 (`collect_foreign_editorials.py::_dispatch`)

- **마이니치/산케이 collector 동작 확인** (httpx + BeautifulSoup)
  - 마이니치: 인덱스 JSON-LD `CollectionPage.hasPart` → 본문 `.articledetail-body p` 단락 join (메타 제외, 835자 내외)
  - 산케이: 인덱스 `/column/editorial/` (계획서의 `/article/category/editorial/` 는 404), h3 `＜主張＞` 카드 매칭 → 본문 `div.article-body` (소프트 페이월, 900자 내외)
  - **Washington Times 는 httpx 차단(Cloudflare 403)** — M2에서 Playwright로 이동

- **GPT 번역 모듈** ([scripts/lib/foreign_translator.py](scripts/lib/foreign_translator.py))
  - `gpt-4o-mini` JSON mode 로 `{title_ko, body_ko}` 응답 강제
  - 환경변수 `FOREIGN_TRANSLATE_MODEL` 로 override 가능
  - 429 재시도 (30s × 3회), traceback 노출
  - 비용: 건당 약 1원, 매일 30건 가정 시 **월 1000원 수준**

- **수집 + 번역 통합 스크립트** ([scripts/collect_foreign_editorials.py](scripts/collect_foreign_editorials.py))
  - 수집 시 자동 번역 (`--no-translate` 로 끄기 가능)
  - 백필 모드 `--translate-backfill --backfill-limit N` (body_ko NULL 레코드만 번역)
  - `edition_date` 는 현지 시각 기준 (UTC 변환 시 JST 새벽 사설이 전날로 빠지는 문제 회피)
  - 기존 URL 이미 번역된 경우 재번역 안 함

- **opinion 앱 "해외 논조" 탭** ([opinion/src/app/foreign/page.tsx](opinion/src/app/foreign/page.tsx))
  - 매체별 그룹 (FOREIGN_SOURCE_ORDER: 구독 영문 → 무료 영문 → 일본)
  - TodayTab 패턴 그대로 row 형태 (제목 + 시간 + "번역" 배지)
  - 모달: 한국어 본문 + "원문" 탭 토글 (한일/한미 동시 비교 가능)
  - DateNav 에 `basePath` prop 추가하여 재사용
  - 사이드바: `Globe` 아이콘 + "해외 논조" 메뉴
  - 운영: https://opinion-eta.vercel.app/foreign (수동 배포, opinion 자동연동 미설정 그대로)

- **GitHub Actions cron 등록** ([.github/workflows/cron-foreign-editorials.yml](.github/workflows/cron-foreign-editorials.yml))
  - **UTC 22:00 (KST 07:00)** 매일 — `--all` 모든 구현된 매체 + 자동 번역
  - workflow_dispatch 옵션: source / dry_run / backfill
  - 신규 GitHub Secret 추가 없음 (기존 `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `AI_BASE_URL` 만 사용)

**판단 사항 (28차)**:
1. **`foreign_editorial` 신규 테이블 분리** — 기존 `editorial` 은 한국 매체 `media_company_id` FK 전제. 해외는 매체가 외부라 FK 안 맞음 → 완전 분리
2. **요약 생성 제외** — 사용자 요청. body_ko 만 있으면 충분
3. **번역 모델은 `gpt-4o-mini`** — 사설 번역 품질 검수 OK. 16배 비용 차이 정당화 불가
4. **`edition_date` 는 현지 시각** — `AT TIME ZONE` 안 쓰고 published_at 의 tz-aware datetime 그대로 `.date()`
5. **Washington Times 분류 변경** — 무료 매체였지만 Cloudflare 차단으로 M2(Playwright 그룹)로 이동
6. **산케이 인덱스 URL 정정** — `/column/editorial/` (계획서 `/article/category/editorial/` 는 404)

---

**미완료 (다음 세션 이어받을 것)**:
- ⚠ **해외 구독 매체 수집 — NCP 이전 후 재활성화**
  - GitHub Actions IP(Azure 데이터센터) 차단으로 현재 불가 (29차에서 확인)
  - 코드 완성: wapo/nyt/ft/scmp collector + `--seed-cookies --cookies-file` CLI + `_normalize_cookies`
  - NCP 수집서버로 이전 후 `cron-foreign-editorials.yml` → NCP cron으로 전환하면 즉시 활성화
  - GitHub Secrets 등록 완료: `WAPO_ID/PW`, `NYT_ID/PW`, `FT_ID/PW`, `SCMP_ID/PW`
  - 현재 작동 중: **sankei** (5건/일), **guardian** (20건/일) — 2개만 GitHub Actions에서 수집
- ⚠ **사설 과거 데이터 백필** (27차에서 이어짐) — 과거분은 데이터만 채운다. **AI 요약/주제/쟁점/성향분석/판단근거 생성 금지**. 전용 스크립트 `scripts.collect_editorials_data_backfill` 사용:
  ```bash
  python -B -m scripts.collect_editorials_data_backfill --date-from 20260318 --date-to 20260324
  python -B -m scripts.collect_editorials_data_backfill --date-from 20260311 --date-to 20260317
  python -B -m scripts.collect_editorials_data_backfill --date-from 20260304 --date-to 20260310
  python -B -m scripts.collect_editorials_data_backfill --date-from 20260301 --date-to 20260303
  ```
- ⚠ **트래픽/기사 페이지 추가 성능 최적화** (27차에서 이어짐) — Streaming SSR + Suspense / SWR
- ~~**Vercel 자동 배포 webhook 안정화**~~ ✅ 완료 (29차)
- ~~**opinion 오늘의 사설 fallback 배너**~~ ✅ 완료 (29차)
- ⚠ **/traffic 인터랙티브 추가** — 매칭 기사 양방향 점프, 디바이스별 시간대 차트
- ⚠ **subscriber_snapshot / daily_publication_count 보존 기간 미결정**
- ⚠ **미보도 탐지 3단계** (임베딩 기반) — article.body 수집 + NCP 이전 후
- ⚠ **StanceTab 차트 레이블 겹침** — 스태거드 방식 적용
- ⚠ **On-demand Revalidation** — 수집 완료 시 `/api/revalidate` 호출로 즉시 캐시 갱신
- ⚠ **/report 과거 보고서 아카이브 페이지**

---

**지난 세션 (27차) 완료** — UI 디테일 정리 + 대시보드 KPI 재구성 + 성능 최적화:

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

- ~~**(당장) 해외 구독 매체 수집 — NCP 이전 후 재활성화**~~ 🔶 33차 부분 완료 — NCP 이전 후 재점검: wtimes/scmp/wapo ✅, mainichi/sankei/guardian ✅. **nyt(DataDome)·ft(hCaptcha)는 IP 레벨 차단으로 우회 불가**. wapo cron 실동작 확인 필요
- ~~**(당장) 실시간 트렌드 RSS → Playwright DOM 전환**~~ ✅ **34차 완료** — DOM 파싱(hours=24, 25건), 3분 주기, 신호등 대시보드 UI + 우측 패널, InfoTip ⓘ 툴팁
- **(당장) 사설 과거 데이터 백필** — 과거분은 `scripts.collect_editorials_data_backfill`로 데이터만 수집. AI 요약/성향분석 없이 3월 남은 구간부터 역순으로 주 단위 실행
- **(당장) 트래픽/기사 페이지 추가 성능 최적화** — Streaming SSR + Suspense / 클라이언트 캐시(SWR or React Query)
- ~~**(당장) 로그인 + 역할 기반 접근 제어**~~ ✅ 30차 완료
- **(미래) /traffic 인터랙티브 추가** — 매칭 기사 양방향 점프, 디바이스별 시간대 차트
- **(미래) 편집회의 자동 일간 보고서** — 기존 데이터 + PV 통합한 매일 아침 보고서
- **(미래) 미보도 탐지 + 클러스터 품질 개선** — 설계 완료. 상세: `documents/decisions.md`
- **(미래) 성향 분석 정확도 개선** — `editorial_label` 테이블에 인간 레이블 충분히 쌓인 후 진행
- **(미래) 검색 기능** — Topbar 검색창 UI 주석 처리됨. 이슈 클러스터 제목/키워드 검색
- **(미래) 이메일 브리핑 자동 발송** — 매일 KST 9시 GitHub Actions cron
- **(미래) 기자 이름 기반 통계** — NCP 한국 IP 서버 구성 후 기자명 수집 재도입
- **(진행 중) NCP 전면 이전** — 사내 데이터 내재화 목적. 3단계 순서로 진행:
  - ~~1단계: GitHub Actions cron → NCP 수집서버 cron 이전~~ ✅ **33차 완료** — worker Docker 컨테이너 + crontab 12종 NCP 가동, GitHub Actions 비활성화, infra-mcp 배포 자동화
  - 2단계: Supabase → NCP PostgreSQL 이전 — `supabase-js` → `pg` 교체, `queries.ts` 전면 수정, RLS 제거 (3~5일, 핵심 난관) **← 다음 단계**
  - 3단계: Vercel → NCP 웹서버 이전 — nginx + PM2, GitHub Actions CD 워크플로 추가 (1~2일)
  - 구성: 웹서버 1대 (80/443 외부 오픈) + 수집서버 1대 (크롤링, 한국 IP) + DB서버 1대 (내부망만 허용, ACG 설정)
  - 현재 수집서버 = NCP VM `10.36.194.36` (Rocky Linux 8, Docker worker). 배포 = infra-mcp ([D:\mcp\infra-mcp](D:\mcp\infra-mcp))

---

## 로그인 + 역할 기반 접근 제어 — 30차 완료 (참고)

> 실제 구현 + 판단 사항은 위 "재개 지점 (30차 세션)" 섹션 참조. 이 섹션은 초기 계획 보존용.

### 역할 구조

| 역할 | 메뉴 접근 | 회원 관리 |
|---|---|---|
| superadmin | 전체 | ✅ 전체 회원 열람·수정·역할변경·삭제 |
| admin | 전체 | ❌ |
| 사업부 | 트래픽·구독자만 | ❌ |
| 기자 | 트래픽·구독자 제외 전체 | ❌ |

### 역할-메뉴 매핑

| 메뉴 | superadmin | admin | 사업부 | 기자 |
|---|---|---|---|---|
| 대시보드 (/) | ✅ | ✅ | ✅ | ✅ |
| 이슈 분석 | ✅ | ✅ | ❌ | ✅ |
| 미보도 탐지 | ✅ | ✅ | ❌ | ✅ |
| 실시간 트렌드 | ✅ | ✅ | ❌ | ✅ |
| 경쟁사 비교 | ✅ | ✅ | ❌ | ✅ |
| 자사 기사 현황 | ✅ | ✅ | ❌ | ✅ |
| 트래픽 분석 | ✅ | ✅ | ✅ | ❌ |
| 구독자 분석 | ✅ | ✅ | ✅ | ❌ |
| 독자 반응 | ✅ | ✅ | ❌ | ✅ |
| AI 리포트 | ✅ | ✅ | ❌ | ✅ |
| 회원 관리 (/admin/users) | ✅ | ❌ | ❌ | ❌ |

- 대시보드 KPI 카드: 접근 불가 페이지 카드는 클릭 비활성 (사업부→기사·독자반응, 기자→조회수·구독자)
- 비로그인 + URL 직접 입력 → `/login` 리다이렉트 (Middleware 서버 레벨)
- 역할 없는 URL 직접 입력 → `/` 리다이렉트

### 가입 정책
- 도메인: `@segye.com` 만 허용 (서버 검증)
- 방식: 이메일 OTP 인증 → 역할 선택 → 비밀번호 설정
- 가입 시 선택 가능 역할: `reporter`, `business` (admin·superadmin은 선택 불가)
- 승인:
  - `reporter` → OTP 인증 완료 시 **자동 승인** (즉시 접근)
  - `business` → 승인 대기 상태 → **superadmin이 수동 승인 후 접근 가능**
  - 승인 대기 중 로그인 시 "승인 대기 중입니다" 안내 화면 표시
- `admin` 역할: superadmin이 `/admin/users`에서 직접 부여
- `superadmin` 계정: Supabase 대시보드에서 `profiles` row 직접 생성 (최초 1회)

### 단계별 작업 (~3일)

**1단계 — DB 마이그레이션** (0.5일)
```sql
CREATE TABLE profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      VARCHAR NOT NULL,
  name       VARCHAR NOT NULL,
  role       VARCHAR NOT NULL
               CHECK (role IN ('superadmin','admin','business','reporter'))
               DEFAULT 'reporter',
  approved   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- reporter 가입 시 approved=true 자동 설정
-- business 가입 시 approved=false → superadmin 승인 필요
-- admin/superadmin은 가입 폼에서 선택 불가, superadmin이 직접 부여
-- RLS: 본인 row SELECT, service role만 INSERT/UPDATE
```

**2단계 — Supabase Auth 설정** (0.5일)
- Supabase 대시보드에서 Email OTP 활성화
- `@supabase/ssr` 패키지 설치 (`npm i @supabase/ssr`)
- 서버 클라이언트 / 미들웨어 클라이언트 분리 (`src/lib/supabase-server.ts`)
- 가입 완료 시 `profiles` 자동 생성 (Server Action)

**3단계 — 인증 페이지** (1일)
- `src/app/login/page.tsx` — 이메일 + 비밀번호
- `src/app/signup/page.tsx` — 이메일 입력 → OTP 발송 → OTP 확인 → 이름·비밀번호 설정

**4단계 — Middleware + 접근 제어** (0.5일)
- `src/middleware.ts` — 비로그인 차단, 역할별 경로 검증
- 역할별 허용 경로 상수 (`src/lib/roles.ts`)

**5단계 — UI 변경** (0.5일)
- `Sidebar.tsx` — 역할에 따라 접근 불가 메뉴 숨김
- `dashboard/*` — KPI 카드 권한별 클릭 비활성
- `Topbar.tsx` — 로그인 사용자 이름·역할 표시 + 로그아웃 버튼
- `src/app/admin/users/page.tsx` — 사용자 목록 + 역할 변경 (admin 전용)

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
