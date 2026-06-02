# 실시간 트렌드 v2 — 구현 명세서

> 목적: 기존 RSS 수집(10건, 대략 수치)을 **`trending?geo=KR` DOM 파싱**으로 전환하고,
> 기자가 "이거 빨리 기사 써야겠다"를 한눈에 판단하도록 UI를 재구성한다.
> 작성: Opus (설계·검증 완료). 구현: Sonnet 진행 가능.
> 이 문서는 구현 완료 후 핵심만 CLAUDE.md 재개 지점에 반영하고 삭제 가능.

---

## 0. 설계 확정 사항 (검증 완료)

| 항목 | 결정 | 근거 |
|---|---|---|
| 수집원 | `https://trends.google.com/trending?geo=KR&hl=ko&hours=4&status=active` (Playwright DOM) | 로컬 한국 IP에서 파싱 검증 완료. 데이터 15건+ |
| 수집 주기 | crontab `*/10` → `*/3` (3분) | 거의 실시간 |
| 메인 UI | **C안** 신호등 대시보드 (컴팩트 테이블 + 정렬/필터 + 우측 확장 패널) | 사용자 결정 |
| 메인 컬럼 | 순위 · 키워드 · 검색량 · 증가율 · 신선도 · 보도 (**경쟁 컬럼 제외**) | 경쟁 수치는 신뢰 불가 (아래 §6) |
| 상세 | 우측 패널 확장 (지표 + 우리관측 추이 + AI요약/제목 + 관련검색어 + 관련뉴스 + 자사기사) | 사용자 결정 |
| 툴팁 | 각 항목 옆 ⓘ 호버 설명 | 사용자 결정 |
| 보도 판정 | 자사 전체 발행 기사 기준(기존 로직 유지). **절대 판정 아닌 참고 신호** | §6 |

---

## 1. 수집기 전환 — `scripts/collect_trends.py`

### 1.1 DOM 구조 (검증된 셀렉터)

`page.goto(URL, wait_until="domcontentloaded")` → `page.wait_for_selector("table tbody tr")` → 2.5초 대기.

`table tbody tr` 행 구조:
- **row 0**: 헤더성 (td 1개) — **건너뜀**
- **데이터 행**: `td` 7개 (`len(td) >= 7` 인 행만 사용)

| td 인덱스 | 내용 | inner_text 예시 |
|---|---|---|
| `td[0]` | 체크박스 (빈칸) | `""` |
| `td[1]` | **키워드** | `정동원` |
| `td[2]` | **검색량 + 증가율** | `5천+ \| arrow_upward \| 1,000%` |
| `td[3]` | **시작시각 + 상태** | `3시간 전 \| trending_up \| 활성` |
| `td[4]` | **관련 검색어** (없을 수 있음) | `블루오리진 폭발 \| 블루 오리진` |
| `td[5]` | (빈칸) | `""` |
| `td[6]` | 액션 버튼 | `more_vert추가 작업…` — 무시 |

> ⚠ 위치(td 인덱스) 기반 파싱을 1순위로. 클래스명(`xZCHj` 등)은 구글이 자주 바꾸므로 보조로만.

### 1.2 td[2] 파싱 — 검색량 + 증가율

`inner_text`를 줄바꿈/`|`로 분리 후 **머티리얼 아이콘 토큰 제거** (`arrow_upward`, `arrow_downward`, `trending_up`, `trending_down` 등 영문 토큰).

- **검색량 (search_volume)** — 한국어 단위 정규화:
  - `"5천+"` → `5000`, `"1천+"` → `1000`, `"500+"` → `500`, `"200+"` → `200`, `"100+"` → `100`
  - `"2만+"` → `20000`, `"1만+"` → `10000`, `"100만+"` → `1000000`
  - 규칙: 숫자 추출 후 `천`=×1000, `만`=×10000, 단위 없으면 ×1. 정규식 `(\d[\d,]*)\s*(천|만)?`
  - 원문 문자열(`approx_traffic`)도 그대로 보존 (`"5천+"`)
- **증가율 (growth_rate)** — `"1,000%"` → 콤마·`%` 제거 → `1000` (int). 패턴 못 찾으면 `None`.

### 1.3 td[3] 파싱 — 시작시각 + 상태

`inner_text` 분리 후 아이콘 토큰 제거.
- **started_ago_text** — 원문 그대로 저장 (`"3시간 전"`, `"1시간 전"`, `"방금"`, `"N분 전"`)
- **started_at (timestamptz)** — 수집 시각에서 역산:
  - `"N시간 전"` → `now - N시간`, `"N분 전"` → `now - N분`, `"방금"`/`"분 전"` 단독 → `now`
  - 파싱 실패 시 `None`
- **status** — `"활성"` 등 텍스트 (`활성`이면 active). 마지막 한글 토큰.

### 1.4 td[4] 파싱 — 관련 검색어

`inner_text`를 `|`/줄바꿈으로 split → 공백 trim → 빈 항목 제거 → **문자열 배열**.
- 비어있으면 `[]`
- 저장: `related_queries` (text[] 권장)

### 1.5 관련 뉴스 — 행 클릭 펼침

테이블 전체 파싱(1.2~1.4)을 **먼저 클릭 없이** 끝낸 뒤, 각 데이터 행을 순회하며:
1. `row.click()` → 1.8초 대기
2. 우측 패널의 `a.xZCHj` 링크 수집 (키워드당 **정확히 3건 고정** — §6 참고)
3. 각 링크:
   - `href` = 기사 URL (`http`로 시작, `google` 도메인 제외)
   - `inner_text` = `"제목 N시간 전 ● 출처"` → 파싱:
     - **source**: ` ● ` 뒤 토큰
     - **published_ago**: `N시간 전` / `N분 전` 패턴
     - **title**: 나머지 앞부분 (출처/시각 제거). 트레일링 ` - 매체명` 접미어도 정리
   - 썸네일 `img[src]` 있으면 `thumbnail` 추가 (선택)
4. 저장 구조(`related_news` jsonb, 기존과 호환): `[{title, url, source, published_ago?, thumbnail?}]`

> 성능: 15건 × (클릭+1.8초) ≈ 30~40초. 3분 주기 내 충분. 타임아웃·실패 행은 `related_news=[]`로 건너뛰고 계속.

### 1.6 Playwright 설정 (쿠키 불필요)

- `chromium.launch(headless=True)` (운영). 로컬 디버그는 `HEADLESS=0` 시 `headless=False`.
- `new_context(locale="ko-KR", user_agent=<Chrome UA>)` — `playwright_base.py`의 `_UA` 재사용 가능
- stealth 스크립트(`playwright_base._STEALTH_SCRIPT`) `add_init_script`로 주입 권장
- **쿠키/로그인 불필요** — `foreign_session` 안 씀. trends 전용 경량 함수로 작성 (foreign_collectors 의존 X, UA/stealth 상수만 참고)
- 동기 API(`sync_playwright`) 사용 — 현 스크립트는 `asyncio` 기반이므로 **DOM 수집부는 `run_in_executor` 또는 동기 함수 분리** 후, AI 생성부만 async 유지 (wapo 패턴 §33-4 참고)

### 1.7 기존 로직 재사용 (그대로 유지)

- `_match_cluster` / `_load_recent_clusters` — 클러스터 매칭 (변경 없음)
- `_load_recent_ai_content` — 1시간 AI 캐시 (변경 없음). 3분 주기여도 신규 2~3건만 AI 호출
- `_generate_trend_content` — AI 요약+제목추천. 입력은 `related_news` 제목 (1.5에서 수집하므로 유지). **관련검색어도 입력에 추가하면 품질↑** (선택)
- `_save` — rows에 신규 필드 추가 (§2 컬럼)

### 1.8 RSS 코드 처리

`_fetch_rss` / `_parse_rss` / `TRENDS_RSS_URL` / `HT_NS` 제거. `httpx` import는 다른 용도 없으면 제거.

---

## 2. DB 마이그레이션 — `0025_trending_v2.sql`

`trending_keyword` 테이블에 컬럼 추가 (모두 NULL 허용 — 기존 행 호환):

```sql
ALTER TABLE trending_keyword
  ADD COLUMN IF NOT EXISTS search_volume    INTEGER,      -- 정규화 검색량 (정렬용). "5천+"→5000
  ADD COLUMN IF NOT EXISTS growth_rate      INTEGER,      -- 증가율 %. "1,000%"→1000
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ,  -- 역산된 시작 시각
  ADD COLUMN IF NOT EXISTS started_ago_text TEXT,         -- 원문 "3시간 전"
  ADD COLUMN IF NOT EXISTS status           TEXT,         -- "활성" 등
  ADD COLUMN IF NOT EXISTS related_queries  TEXT[];       -- 관련 검색어 배열
```

- `approx_traffic`(원문 `"5천+"`), `related_news`(jsonb), `ai_summary`, `title_suggestions`, `traffic_rank`, `fetched_at` 는 **유지**
- 인덱스: `fetched_at` 기존 인덱스 활용. 필요시 `(fetched_at, search_volume)` 추가 검토
- RLS: 기존 정책 그대로 (신규 컬럼은 자동 포함)
- 적용: `mcp__supabase__apply_migration(name="0025_trending_v2", query=...)` + 파일 저장

---

## 3. 쿼리/타입 — `src/lib/queries.ts`

### 3.1 `TrendingKeyword` 타입 확장

```ts
export type TrendingKeyword = {
  trending_id: number;
  keyword: string;
  approx_traffic: string;        // 원문 "5천+"
  search_volume: number | null;  // 정렬용
  growth_rate: number | null;    // 증가율 %
  traffic_rank: number;
  started_at: string | null;
  started_ago_text: string | null;
  status: string | null;
  related_queries: string[] | null;
  matched_cluster_id: number | null;
  related_news: { title: string; url: string; source: string; published_ago?: string; thumbnail?: string }[] | null;
  ai_summary: string | null;
  title_suggestions: string[] | null;
  fetched_at: string;
};
```

### 3.2 `_getTrendingKeywords` — select 확장

`.select(...)`에 신규 컬럼 추가: `search_volume, growth_rate, started_at, started_ago_text, status, related_queries`.
`.eq("fetched_at", latest.fetched_at)` 정확 일치 로직 유지 (33차 중복 버그 수정 보존).

### 3.3 캐시 주기

`getTrendingKeywords` / `getTrendingWithCoverage` 의 `revalidate: 120` → **`60`** (3분 수집에 맞춰 신선도↑). 과부하 우려 시 90 유지.

### 3.4 `_getTrendingWithCoverage` — 보도 판정

기존 로직 유지 (클러스터 매칭 1순위 + 키워드 포함 2순위). 변경 없음.

### 3.5 신규: 우리관측 추이 (상세 패널 그래프용)

```ts
// 특정 키워드의 최근 N시간 search_volume 시계열 (3분 간격 수집분)
async function _getTrendingHistory(keyword: string, hours = 6): Promise<{ fetched_at: string; search_volume: number | null }[]>
```
- `trending_keyword` where `keyword = ?` and `fetched_at > now - hours` order by fetched_at asc
- 데이터 누적 전(초기 며칠)엔 점이 적어 빈 그래프 가능 — UI에서 "데이터 누적 중" 처리

---

## 4. 메인 UI — `src/app/trending/page.tsx` (C안)

### 4.1 레이아웃

- 2분할: **좌측 리스트(테이블)** + **우측 상세 패널**. 패널 닫힘 상태에선 리스트 전체 폭.
- 행 클릭 → 우측 패널 슬라이드 확장 + 리스트 폭 축소 (클라이언트 state). → **`"use client"` 컴포넌트 분리 필요** (현재 page는 서버 컴포넌트). 데이터는 서버에서 fetch 후 client 컴포넌트에 props 전달.

### 4.2 헤더

- 타이틀 "실시간 트렌드" + 업데이트 시각(`HH:MM 기준`) + "3분마다 갱신" 문구 (기존 "10분" 수정)
- **정렬 드롭다운**: 구글순위(기본, traffic_rank) / 신선도(started_at desc) / 증가율(growth_rate desc) / 검색량(search_volume desc)
- **필터 토글**: "미보도만" on/off

### 4.3 테이블 컬럼 (각 헤더에 ⓘ 툴팁)

| 컬럼 | 표시 | ⓘ 툴팁 |
|---|---|---|
| 순위 | `traffic_rank` | "구글이 집계한 실시간 트렌드 순위" |
| 키워드 | `keyword` | — |
| 검색량 | `approx_traffic` (`5천+`) | "구글 추정 검색 횟수 (대략값)" |
| 증가율 | `↑{growth_rate}%` | "직전 대비 검색량 급상승 비율. 높을수록 빠르게 뜨는 중" |
| 신선도 | 신호등 + `started_ago_text` | "트렌드가 처음 감지된 시점. 🟢 최근(2h 이내)·🟡 보통(2~4h)·🔴 오래됨" |
| 보도 | 배지 [미보도]/[보도됨] | "세계일보 보도 여부 (전체 발행 기사 기준 추정). 참고용" |

- **신선도 신호등 기준**: started_at 기준 경과시간 — `≤2h 🟢`, `≤4h 🟡`, `>4h 🔴`. (hours=4라 대부분 🟢🟡)
- **미보도 행 시각 강조**: 좌측 보더 빨강 or 미세 배경 (기자 시선 유도)
- 증가율 큰 값(예 ≥500%) 굵게/색 강조 옵션

### 4.4 스탯 카드 (상단, 기존 3개 유지 가능)

전체 / 미보도 / 보도됨 카운트.

---

## 5. 상세 패널 (우측 확장)

선택된 키워드 1건 표시. 첨부 이미지(구글 트렌드 패널)는 **레이아웃 참고만**.

구성 (위→아래):
1. **헤더** — 키워드 + 보도 배지 + 닫기(×)
2. **핵심 지표 줄** (각 ⓘ) — 검색량 `5천+` · 증가율 `↑1,000%` · 시작 `3시간 전` · 신선도 🟢
3. **📈 우리관측 추이 미니그래프** — `_getTrendingHistory` 의 search_volume 시계열 (SVG 라인, 최근 6h). 데이터 부족 시 "관측 데이터 누적 중" 안내. ⓘ "우리가 3분마다 수집한 검색량 추이 (구글 비공개 데이터)"
4. **🔥 AI 요약** — `ai_summary` (왜 급상승). 없으면 "생성 중"
5. **✎ 추천 기사 제목** — `title_suggestions` 리스트 + 각 복사 버튼
6. **관련 검색어 칩** — `related_queries` 칩 나열. ⓘ "함께 검색되는 연관어 (소제목·키워드 힌트)"
7. **관련 보도** — `related_news` (제목·출처·시각·썸네일·링크). ⓘ "구글이 노출한 관련 기사 (최대 3건). 어떤 매체가 어떤 앵글로 썼는지 참고"
8. **자사 기사** — `covered`면 `our_article_title`/`our_article_url` 링크, 미보도면 "아직 세계일보 미보도" 강조
9. **외부 바로가기** — 구글 탐색/검색 링크 (`trends.google.com/trends/explore?q={keyword}&geo=KR`, `google.com/search?q={keyword}`)

### 5.1 툴팁 컴포넌트

- 재사용 `<InfoTip text="...">` (lucide `Info` 아이콘 + hover시 작은 말풍선). Tailwind `group`/`group-hover` 또는 title 속성. 디자인 시스템 색(`muted`, `border`) 사용.

---

## 6. 보도/경쟁 판정 — 한계 명시 (검증 완료)

- **자사 보도 판정**: `cron-publications`가 세계일보 **전체 발행 기사**를 수집(48h 564건 확인) → 랭킹 누락과 무관. 단 한계:
  1. **제목 단순 포함 매칭** — 키워드가 기사 제목에 글자 그대로 있어야 매칭 (인물 별칭 등 누락 가능)
  2. **수집 시차** — 발행→네이버→수집(현 10분, →3분) 지연. 방금 쓴 기사는 잠깐 미보도로 보일 수 있음
  → 그래서 "참고 신호"로 표기, 패널에 매칭 기사 함께 노출해 기자가 확인
- **경쟁 N곳 보도 — 채택 안 함**:
  - 구글 관련뉴스: 키워드당 **정확히 3건 고정** (검증) → 변별력 없음
  - 자체 산출(경쟁사 `article`): 경쟁사는 `cron-ranking` **인기 랭킹 진입분만** 수집 → 랭킹 미진입 보도 누락 → 정확한 절대 수치 불가
  - 결론: 메인 지표에서 제외. 관련뉴스 3건은 패널 참고용으로만

---

## 7. crontab — `crontab`

```
# trends — 3분마다 (기존 */10 에서 변경)
*/3 * * * * root cd /app && python -m scripts.collect_trends >> /var/log/cron.log 2>&1
```
- 배포: `git push` → GitHub Actions 이미지 빌드 → `infra-mcp deploy_worker` 또는 직접 SSH로 NCP pull+재시작
- Dockerfile에 Playwright 브라우저 이미 포함(해외매체 수집기 기반) — 확인만

---

## 8. 작업 순서 (체크리스트)

1. [ ] **0025 마이그레이션** 작성·적용 (§2) — `apply_migration` + 파일 저장
2. [ ] **collect_trends.py 전환** (§1) — DOM 파싱, 정규화, 행클릭 뉴스, sync/async 분리
   - [ ] 로컬에서 `python -m scripts.collect_trends --dry-run` 검증 (15건 파싱·정규화 확인)
   - [ ] `--dry-run` 없이 1회 실수집 → DB 확인
3. [ ] **queries.ts** 타입·select·캐시·history 함수 (§3)
4. [ ] **page.tsx + client 컴포넌트** 메인 테이블(C안) + 정렬/필터 (§4)
5. [ ] **상세 패널** + 추이 그래프 + 툴팁 (§5)
6. [ ] **crontab */3** 변경 (§7)
7. [ ] 빌드 확인 (`npm run build` 또는 dev), 배포
8. [ ] CLAUDE.md 재개 지점·로드맵 갱신, 본 명세서 삭제 가능

### 검증 팁
- DOM 셀렉터가 깨지면: `headless=False`로 실제 화면 확인. td 인덱스 우선, 클래스 변동 대비 방어 파싱.
- AI 비용: 1시간 캐시로 3분 주기여도 호출 폭증 없음. 첫 전환 시 15건 일괄 생성만.
- 추이 그래프: 데이터가 며칠 쌓여야 의미. 초기엔 빈/짧은 그래프 정상.
