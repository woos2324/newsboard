# 판단 사항 아카이브

새 세션에서 특정 구현 결정의 배경이 궁금할 때 참조. 평소엔 읽을 필요 없음.

---

## cron-trends 실제 실행 빈도
- **설정**: `*/10 * * * *` (10분마다)
- **실제**: GitHub Actions 무료 플랜 schedule 지연으로 **실제 40~60분 간격** 실행. 시간당 1~2배치 수준.
- **비용**: GPT 비용은 실제 ~3,500원/월 수준 (하루 ~20배치 × 25키워드 × 500토큰).
- **1시간 캐시 효과**: 배치 간격이 이미 1시간 가까이라 캐시 효과는 제한적. 간헐적 10분 내 연속 실행 시 중복 방지 역할.

## 구글 급상승 검색어 통합
- **데이터 소스**: Google Trends RSS (`trends.google.com/trending/rss?geo=KR`). 무료, 인증 불필요, GitHub Actions 미국 IP에서 접근 가능. ~6시간마다 업데이트.
- **approx_traffic**: `100+`, `1K+`, `10K+`, `100K+`, `1M+` — 정확한 수치 아님.
- **클러스터 매칭 로직**: `_match_cluster()` — 키워드 직접 포함 or 제목 바이그램 Jaccard ≥ 0.5.
- **배치 그룹화**: `fetched_at` 기준 **5분** 이내를 같은 배치로 처리.
- **RLS**: trending_keyword 테이블은 0012 마이그레이션으로 RLS 적용 완료 (2026-05-13).

## Supabase API 키 포맷 — RLS 이후
- **신 포맷 (`sb_secret_...`)**: `supabase-py 2.10.0`에서 인식 불가.
- **구 JWT 포맷 (`eyJ...`)**: "Legacy anon, service_role API keys" 탭. Python 스크립트는 반드시 이 포맷 사용.
- **진단법**: `_is_jwt()`는 `startswith("eyJ")` 체크. 실패 시 `RuntimeError: SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다` 출력.

## 데이터 보존 정책 — 7일 cleanup
- **대상**: `ranking_news_snapshot`(→ ranking_news_item CASCADE), `section_ranking_snapshot`, `comment_metric`, `missed_issue_alert`, `trending_keyword`.
- **missed_issue_alert**: `reviewing` 상태는 삭제 제외.
- **UI 표시**: `open` 항목은 최근 2일치만, `reviewing`은 전체 표시.
- **제외**: `subscriber_snapshot`, `daily_publication_count` — 보존 기간 미결정.

## 모바일 반응형 사이드바
- `AppShell.tsx` Client Component가 `open` 상태 관리.
- **모바일**: Sidebar `fixed inset-y-0 left-0 z-40` + translate 토글. backdrop 클릭 시 닫힘.
- **데스크탑**: `lg:sticky lg:top-0 lg:h-screen lg:translate-x-0` — 기존 레이아웃 유지.

## 미보도 탐지 — verdict 2차 검증
- **verdict 기준**: `유사보도있음` — bigram ≥ 0.4 OR kw_overlap ≥ 2 / `확인필요` — bigram ≥ 0.15 OR kw_overlap ≥ 1 / `미보도` — else.
- **priority 조정**: `유사보도있음` → 15, `확인필요` → 기본×0.6, `미보도` → 기본 (경쟁사 25점씩 max 100).
- **similar_article_id**: 2차 검증 시 가장 유사한 자사 기사 article_id 저장.

## AI 리포트 날짜 기준 — KST vs UTC
- **문제**: FastAPI `date.today()`는 UTC 기준 → KST 낮에 버튼 누르면 "오늘" 리포트 안 생김.
- **해결**: `summary_date`를 `datetime.now(KST).date()`로 설정. 클러스터 조회는 `gte(yesterday_utc)`로 최근 2일치 포함.
- **cluster_date는 여전히 UTC 기준**: `cluster_articles.py`는 변경 안 함.

## 미보도·클러스터 개선 설계 (구현 예정)
**미보도 탐지 개선 목표 구조**:
```
경쟁사 클러스터 후보 선정 (경쟁사 ≥2)
→ 자사 기사 2차 검증 (키워드 + 제목 텍스트 유사도)
→ 판정 분류 (미보도/유사보도있음/부분보도가능성/확인필요)
→ 우선순위 계산 → 알림 생성
```
**구현 순서**: 1단계(텍스트 기반 2차 검증) → 2단계(DB alert_status 세분화) → 3단계(임베딩 기반) → 4단계(AI 최종 판정)

**클러스터 품질 개선**:
- 같은 실행 내 후처리: centroid 간 cosine ≥ 0.82 쌍 병합.
- Re-absorption 강화: 텍스트 유사도 → centroid 임베딩 직접 비교로 교체.

## 클러스터 re-absorption
- **같은 실행 내**: cosine 유사도 ≥ 0.85.
- **다른 실행 간**: `_find_similar_cluster` — 제목 바이그램 ≥ 0.55 OR 공통 키워드 ≥ 2개+비율 ≥ 0.4.
- **AI 제목 의존 위험**: 같은 사건 다른 표현 시 threshold 미달 가능. 지속 발생 시 0.50으로 완화 검토.

## AI 일간 브리핑 불릿 → 이슈 링크
- **bullets 형식**: `[{text, cluster_id, cluster_title}]`. `parseBullets()` 구·신 형식 모두 처리.
- **툴팁 gap 패턴**: tooltip wrapper에 `pb-2` (padding) 적용 — `mb-2` (margin)는 hover 영역 외부라 사용 금지.
- **기자명 수집 보류**: GitHub Actions 미국 IP에서 Naver SSR 다르게 반환 → NCP 한국 IP 서버 구성 후 재추가.

## 댓글 수집 — Naver JSONP API
- **objectId 형식**: `news{oid},{aid}` — **쉼표** 구분 (언더스코어 아님). 잘못된 형식이면 API가 count=0 반환.
- **API**: `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?...&objectId=news{oid},{aid}&...`
- **JSONP 파싱**: `re.search(r"\((\{.*\})\)\s*;?\s*$", text, re.DOTALL)` → `data.result.count.total`
- **수집 대상**: `["segye","chosun","joongang","donga","mk"]` 5개 매체, 최근 24h 기사.

## 자사 기사 현황 페이지 — /articles
- **차트 높이**: `Math.round((count / 600) * 140)` px. `height: X%`는 flex child 기준이라 항상 낮게 표시됨.
- **Equal-height 컬럼**: CSS `grid grid-cols-2` 사용. `flex` 2컬럼은 높이 불일치.
- **그룹 페이지네이션**: 5개 단위. `currentGroup = Math.ceil(page / GROUP_SIZE)`.

## 데이터 수집 전략
- **네이버 셀렉터**: `_RANKING_LIST_SELECTORS`, `_TITLE_SELECTORS` 우선순위 리스트. 패치 시 맨 앞에 삽입.
- **Delta 계산**: `daily_delta` = 오늘 - 가장 최근의 어제 이전 스냅샷. `lt(snapshot_date, today)` 사용.
- **upsert 전략**: 구독자 = `(media_company_id, snapshot_date, source)` UNIQUE. 랭킹 = `article.url` UNIQUE + 매 실행마다 새 snapshot row.

## AI 백엔드 — Gateway / OpenAI 직접 분기
- `AI_BASE_URL` 환경변수로 분기: 미설정 → Vercel AI Gateway / `https://api.openai.com/v1` → OpenAI 직접.
- API 키 우선순위: `AI_GATEWAY_API_KEY` → `OPENAI_API_KEY`.
- Gateway 모델명: `provider/model` 형태 (`anthropic/claude-opus-4-6`). OpenAI 직접: `gpt-4o-mini`.

## GitHub Actions 자동화
- **Vercel Cron Hobby 일 1회 제한** 우회 위해 GitHub Actions 채택.
- **GitHub Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_LEGACY_ANON_KEY`, `OPENAI_API_KEY`, `AI_BASE_URL`, `DEFAULT_AI_MODEL`, `DEFAULT_EMBED_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **workflow_dispatch 트리거된 ranking은 chain 자동 발동 안 될 수 있음** — schedule 실행에서만 안정적 chain.

## Supabase Python 키 호환성
- `supabase-py 2.10.0`은 JWT(`eyJ...`) 포맷만 인식. `sb_publishable_*`로 호출 시 `Invalid API key`.
- `scripts/lib/db.py` / `api/lib/db.py`의 `_resolve_key()`는 JWT인 키만 채택 (`SUPABASE_LEGACY_ANON_KEY` 우선).

## 클러스터링 알고리즘 설계
- **알고리즘**: 단순 그리디 + centroid running mean. N 커지면 HDBSCAN으로 교체.
- **임베딩 대상**: 제목(`title`)만. body 수집 시 `title + " " + body[:500]`으로 확장.
- **cluster_key 포맷**: `{YYYY-MM-DD}-auto-{8hex}`.
- **representative 선정**: 클러스터 내 다른 멤버들과의 평균 cosine 유사도가 가장 높은 기사.
- **`--dry-run`**: AI 메타 생성 skip — 임베딩 호출 비용만 발생.

## 자사 매체 = 세계일보
- 새 환경 셋업 시 필요한 SQL:
  ```sql
  UPDATE media_company SET is_our_company=TRUE WHERE normalized_name='segye';
  UPDATE media_company SET is_our_company=FALSE WHERE normalized_name='newsboard';
  ```

## daily_publication_count + 자사 전체 기사 수집
- 데이터 출처: `https://news.naver.com/main/list.naver?mode=LPOD&mid=sec&oid={id}&listType=summary&date=YYYYMMDD&page=N`
- 파싱: `dt:not(.photo) a[href]` ([scripts/lib/naver.py](../scripts/lib/naver.py) `parse_publication_articles`).
- 기사 제목·URL도 article 테이블에 upsert (낙종 탐지 정확도 향상).

## 미보도 탐지 파이프라인
- **탐지 기준**: 세계일보 기사 없고 경쟁사 ≥ 2개 매체인 클러스터.
- **priority_score**: 경쟁사 2개=50 / 3개=75 / 4개+=100. `≥80=high / ≥50=medium / else=low`.
- **검토 상태 흐름**: `open` → `reviewing` → `resolved`.

## Vercel 배포
- **`vercel.json`의 `functions.runtime` 키 제거** — 공식 Python은 자동 감지. `maxDuration`만 유지.
- production URL: `https://newsboard-two.vercel.app`
- GitHub auto-deploy 미연결 — push 후 `vercel deploy --prod` 수동 호출.

## 디자인 결정
- **댓글 sentiment**: `comment_count` 직접 기준 (매우 활발 ≥500 / 활발 ≥200 / 보통). 실 NLP 없음.
- **AI JSON 파싱**: markdown 펜스/pre-text 대비 regex 추출 fallback 탑재.
- **AI 요약 upsert 키**: `(summary_type, summary_date [, issue_cluster_id])`.

## 네이버 셀렉터 — 페이지별
- **인기 랭킹**: `li.as_thumb > a` + `strong.list_title`. 화이트리스트 URL `n.news.naver.com/mnews/article`.
- **list.naver 발행**: `dt:not(.photo) a[href]`.
- **followers.json**: `extract_subscriber_count` — `totalCount`, `total`, `count`, `subscriberCount` 등 다양한 키 자동 탐색.
