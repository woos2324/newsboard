# 기자 문체 기반 기사 초안 작성 기능 — 통합 설계서

> 구글 트렌드 미보도 키워드 대응. 기자 로그인 → 본인 문체로 초안 자동 생성 → 검수.
> 본 문서는 외부 초안 설계(구 autowrite.md)를 newsboard 실제 코드베이스·OpenSearch 실측에
> 맞춰 전면 재작성한 **확정 설계서**다. 구 설계의 우수한 부분(팩트/프로파일 스키마, 프롬프트)은
> 흡수하고, 코드베이스 제약·데이터 현실에 맞춰 결정을 보강했다.

작성: 35차 세션 (2026-06-01) · 상태: **설계 확정, 구현 착수 대기**

---

## 1. 핵심 원칙

- **학습(기자 단위)과 팩트(이슈 단위)를 분리**한다.
- 타사 원문이 아니라 **추출된 팩트**를 근거로 쓴다 (저작권 리스크 회피).
- **학습은 회원가입과 분리**한다 — `reporter_id` 키로 프로파일을 미리 구워두고, 가입 시 연결.
- 팩트 추출은 **Lazy**(기자가 초안 화면 진입 시 + 캐싱) — 비용 최소화.
- 자사 기사 본문은 **OpenSearch API**에서 가져온다 (크롤링 아님).

---

## 2. 확정 결정사항 (요약)

| 항목 | 결정 | 근거 |
|---|---|---|
| 학습 데이터 원천 | **OpenSearch API** (NCP SES `web_articles_v2`) | 550만 건 아카이브, 본문·기자·발행일 완비. 크롤링 불필요 |
| 매칭 키 | **`reporter_id`** (이메일 ❌) | 같은 기자도 `reporter_email`이 더미(`sample@example.com`)로 오락가락. `reporter_id`는 항상 일관 |
| 프로파일 저장 키 | **`reporter_id`** (계정 비의존) | 오픈 전 선학습 → 가입 시 `profiles`에 연결 |
| 가입 연결 | `profiles.email` local part ↔ `reporter_id` | 로그인 이메일 `jh224@segye.com` = `reporter_id` `jh224` |
| 팩트 추출 시점 | **Lazy** (초안 진입 시 + 캐싱) | 기자가 실제 쓰는 키워드만 추출. Eager 전량은 99% 낭비 |
| 본문 수집 주기 | **백필 1회** + 분기 갱신(선택) | 문체는 스냅샷(대표 5~15건)이면 충분. 상시 cron 불필요 |
| 미보도 판정 | 기존 **트렌딩 클러스터 매칭** 신호 재사용 | `trending_keyword` 이미 자사 보도 여부 추적 중 |
| 관련뉴스 소스 | `trending_keyword.related_news` (JSONB, 이미 수집 중) | 키워드당 3건. 단 한국어·관련성 필터 필요 |
| 권한 | `reporter` 전용 | `roles.ts` 연동 |

---

## 3. OpenSearch 실측 검증 결과 (2026-06-01)

**접속**: `OPENSEARCH_URL` / `OPENSEARCH_USER` / `OPENSEARCH_PASS` / `OPENSEARCH_INDEX=web_articles_v2`
(`.env.local`. NCP 서버에서는 아직 미개방 → 현재 로컬에서만 접근 가능. **2단계 NCP 이전 시 ACG 개방 필요**)

**인덱스 필드** (`web_articles_v2`):

| 필드 | 타입 | 용도 |
|---|---|---|
| `article_id` | keyword | 기사 고유 ID |
| `title` / `summary` / `body` | text | 제목 / 요약 / **본문 전문** |
| `reporter` | text | 기자명 (예: 최승우) |
| `reporter_id` | keyword | **매칭 키** (예: jh224) |
| `reporter_email` | keyword | 이메일 (더미 오염 있음 — 보조용) |
| `section` | keyword | 지면/판형 (연성·경성 분류엔 부적합) |
| `published_at` / `updated_at` | date | 발행일 |
| `status` | keyword | `published` / `draft` / `deleted` |
| `url` | keyword | `/newsView/{article_id}` |
| `meche` | keyword | 매체 (세계일보 등) |
| `is_deleted` | boolean | 삭제 여부 |

**충실도 (최근 1년 기준, 전체 171,939건)**:
- `status=published`: 171,656건
- `reporter_id` / `reporter_email` 존재: 각 141,692건 (82.4%)
- `reporter_email` 중 더미(`sample@example.com`): 5,309건 → 실질 유효 이메일 79.3%
- **고유 기자: `reporter_id` 211명** (관리 가능 규모)
- 도메인: `@segye.com`(본지) + `@sportsworldi.com`(스포츠월드 자매지) + `@example.com`(더미)

**검증 쿼리 패턴**:
```json
// status=published + reporter_id 보유 + 기간
{"query": {"bool": {"must": [
  {"term": {"status": "published"}},
  {"exists": {"field": "reporter_id"}},
  {"range": {"published_at": {"gte": "2025-06-01"}}}
]}}}
```

---

## 4. 매칭 키가 `reporter_id`인 이유 (결정 근거)

같은 기자 기사인데 `reporter_email`이 기사마다 정상/더미로 갈린다:

```
이주희:  id=jh224     email=jh224@segye.com        ← 정상
최승우:  id=loonytuna email=sample@example.com     ← 더미 (연예/온라인 콘텐츠)
ehdgus1211: 어떤 기사는 ehdgus1211@segye.com, 어떤 기사는 sample@example.com
```

- `reporter_email`로 그룹핑 → **한 기자가 "정상 그룹 + 더미 그룹" 둘로 파편화**
- `reporter_id`로 그룹핑 → **한 기자로 온전히 통합**
- `reporter_id`는 이메일 local part와 일치 → 로그인 이메일과 매칭 가능
- 더미 이메일 기자(loonytuna 등 연예/어뷰징 계정)는 가입 안 할 가능성 높아 자연 제외

→ **학습 그룹핑·매칭 모두 `reporter_id`를 정규 키로 사용**한다.

---

## 5. 전체 아키텍처

```
[학습 단계 — 오픈 전 1회, 계정 무관]
  OpenSearch (reporter_id별 대표기사 5~15건)
     → 문체 프로파일 생성 (gpt-4o)
     → reporter_style_profile (key: reporter_id) 저장

[가입 단계]
  기자 가입 (profiles.email = jh224@segye.com)
     → local part(jh224) ↔ reporter_id 매칭
     → reporter_style_profile.user_id 연결

[생성 단계 — 런타임]
  기자 로그인 → 미보도 트렌드 키워드 선택
     → related_news 3건 본문 Lazy 크롤링 (캐시 확인)
     → 팩트 추출 (gpt-4o-mini, article_fact 캐싱)
     → [팩트 + 본인 문체 프로파일 + few-shot 샘플] → 초안 생성 (gpt-4o)
     → article_draft 저장 → 검수 UI (문장↔근거 팩트 매핑) → 발행
```

---

## 6. 데이터 모델 (신규 3 테이블 + 기존 재사용)

### 신규 테이블

```
reporter_style_profile          # 기자 문체 프로파일 (계정 비의존)
  - id              BIGSERIAL PK
  - reporter_id     VARCHAR UNIQUE NOT NULL   # OpenSearch reporter_id (정규 키)
  - reporter_name   VARCHAR                   # 표시용 (최신 기사 기준)
  - user_id         UUID NULL REFERENCES profiles(user_id)  # 가입 시 연결
  - profile         JSONB                     # 문체 프로파일 (§8 스키마)
  - sample_articles JSONB                     # few-shot용 자사 기사 일부 (저작물, 보관 OK)
  - article_count   INT                       # 학습에 쓴 기사 수
  - generated_at    TIMESTAMPTZ
  - model           VARCHAR                   # 생성 모델 (감사용)

article_fact                    # 키워드별 추출 팩트 (Lazy 캐싱)
  - id            BIGSERIAL PK
  - keyword       VARCHAR NOT NULL
  - source_url    VARCHAR NOT NULL            # related_news URL
  - source_name   VARCHAR                     # 출처 매체
  - facts         JSONB                       # 팩트 (§7 스키마)
  - extracted_at  TIMESTAMPTZ
  - UNIQUE(keyword, source_url)               # 캐시 키
  # raw_body 미저장 — 타사 원문은 팩트만 남기고 폐기 (저작권)

article_draft                   # 생성된 초안
  - id            BIGSERIAL PK
  - user_id       UUID REFERENCES profiles(user_id)
  - reporter_id   VARCHAR
  - keyword       VARCHAR
  - title         VARCHAR
  - content       TEXT
  - used_facts    JSONB                       # 사용 팩트 추적 (문장↔근거 매핑)
  - status        VARCHAR CHECK (status IN ('draft','reviewing','published'))
  - created_at    TIMESTAMPTZ
  - updated_at    TIMESTAMPTZ
```

### 기존 재사용 (신규 테이블 불필요)

| 기존 자산 | 역할 |
|---|---|
| `trending_keyword` (+`related_news` JSONB) | 키워드 + 관련뉴스 3건. 미보도 신호(클러스터 매칭) |
| `profiles` (role=reporter) | 로그인·권한. `email` local part로 reporter_id 연결 |
| AI 캐시(1시간) 인프라 | 팩트/초안 호출 비용 절감에 활용 |

> 구 설계의 `trend_keyword`/`related_article`/`reporter` 신규 테이블은 **만들지 않는다** — 우리 기존 스키마와 중복.

---

## 7. 팩트 추출 스키마 + 프롬프트

### 스키마 (구 설계 채용 + source 필드 유지)

```json
{
  "summary": "한 줄 요약",
  "who": ["관련 인물·기관"],
  "what": "핵심 사건",
  "when": "시점",
  "where": "장소",
  "figures": [{"label": "수치 항목", "value": "값", "source": "출처매체"}],
  "quotes": [{"speaker": "발언자", "text": "발언 요지", "source": "출처매체"}],
  "background": "맥락 정보",
  "source_articles": ["매체명1", "매체명2", "매체명3"]
}
```

> `figures`·`quotes`의 `source`가 검수의 핵심 — 기자가 "이 인용/수치 우리가 직접 확인했나"를 즉시 점검.

### 프롬프트 (모델: gpt-4o-mini)

```
[역할]
아래 기사 본문들에서 사실 요소만 구조화해 추출하라. 의견·해석·수식어는
제외하고, 검증 가능한 사실만 담아라.

[규칙]
- 본문에 없는 내용 추가 금지.
- 모든 수치·인용에 어느 매체에서 왔는지 source를 붙여라.
- 한국어 기사가 아니거나 키워드와 무관한 본문은 무시하라.
- 출력은 아래 JSON 스키마만. 다른 텍스트 없이 JSON만 반환.

[JSON 스키마]
{fact_schema}

[키워드] {keyword}
[기사 본문] {article_bodies}
```

---

## 8. 문체 프로파일 스키마 + 프롬프트

### 스키마 (구 설계 채용)

```json
{
  "lead_style": "연성: 장면 묘사형 / 경성: 스트레이트형",
  "avg_sentence_length": "짧은 단문 / 만연체",
  "tone": "건조·객관 / 분석적 / 현장감",
  "structure": "역피라미드 / 내러티브",
  "number_handling": "수치 처리·병기 방식",
  "comparison_pattern": "과거 대비 변화 제시 여부",
  "quote_handling": "인용 배치·처리 방식",
  "ending_style": "마무리 패턴",
  "frequent_expressions": ["자주 쓰는 표현"],
  "notes": "기타 특징(제목 패턴 등)"
}
```

> **연성/경성 분기**: `section`이 지면 기반이라 자동 분류 불가 → 초기엔 **단일 프로파일**로 시작,
> M5 고도화에서 AI가 기사 유형을 판단해 유형별 프로파일로 확장.

### 프로파일 생성 프롬프트 (모델: gpt-4o, 기자당 1회)

```
[역할]
아래는 한 기자가 쓴 기사 N건이다. 이 기자의 문체 특성을 분석해 JSON으로 정리하라.
개별 기사 내용이 아니라 '어떻게 쓰는가'(문장·구조·톤·수치처리·인용·마무리)에 집중하라.

[출력] 아래 스키마만, JSON only.
{style_schema}

[기사 모음] {reporter_articles}
```

---

## 9. 초안 생성 프롬프트 (모델: gpt-4o)

```
[역할]
당신은 기자의 초안 작성을 돕는 보조 도구입니다. 아래 '사실 정보'만을
근거로 기사 초안을 작성하되, 지정된 기자의 문체를 따릅니다.

[엄수 규칙]
- 제공된 '사실 정보'에 없는 내용을 지어내지 마라. 추측·창작 금지.
- 원문 표현을 베끼지 말고, 사실을 기자 문체로 새로 서술하라.
- 확인이 필요한 인용·수치는 [확인필요] 표시를 남겨라.
- 사실 근거가 약한 문장은 쓰지 마라. 출력은 초안 본문만.

[기자 문체 프로파일] {style_profile_json}
[문체 참고 예시 — 톤·구성만 참고, 표현 복제 금지] {few_shot_sample_articles}
[사실 정보] {extracted_facts_json}

[작성 지침]
- 분량: {목표 글자수/문단 수}
- 리드 → 역피라미드(또는 프로파일 명시 구조)로 전개.
- 인용은 사실 정보의 quotes만 사용, 발언자 명확 표기.
```

---

## 10. 마일스톤

**M1 — 학습 데이터 수집 + 매핑 인프라**
- OpenSearch 클라이언트(`scripts/lib/opensearch.py`): `status=published` + `reporter_id` 보유 기사 조회
- `reporter_id`별 대표 기사 N건 수집 (최근순/섹션 다양성 고려)
- `profiles.email` local part ↔ `reporter_id` 연결 헬퍼
- ⚠ NCP 미개방 → 현재 로컬 전용. NCP 이전 시 ACG 개방 필요

**M2 — 문체 프로파일 일괄 생성 (오픈 전 선학습)**
- `reporter_id`별 프로파일(gpt-4o) + few-shot 샘플 → `reporter_style_profile` 저장
- 211명 일괄 생성 (1회성). 가입 안 한 기자도 미리 구워둠

**M3 — 미보도 키워드 → 팩트 추출 (Lazy)**
- 미보도 활성 트렌드 키워드 목록 (클러스터 미매칭 신호)
- `related_news` 3건 본문 크롤링 + 한국어/관련성 필터 → 팩트 추출 → `article_fact` 캐싱

**M4 — 초안 생성 + 검수 UI (reporter 전용)**
- 초안 생성 API(팩트 + 프로파일 + few-shot → gpt-4o)
- 검수 화면: 초안 + 문장↔근거 팩트 매핑 + "AI 초안·데스크 검수 필수" 배지
- `roles.ts`에 신규 경로 추가

**M5 — 고도화**
- 연성/경성 유형별 프로파일 분기, 프로파일 분기 갱신 배치, 생성 이력 피드백 루프

---

## 11. 저작권 · 보안 · 권한

- **자사 기사**(OpenSearch): 우리 저작물 → 본문·샘플 보관 OK
- **타사 기사**(related_news): 팩트만 추출·저장, **raw_body 미보관** (저작권)
- 초안엔 항상 **"AI 생성 초안 · 사실관계 검증 필요"** 배지, 무단 발행 방지
- 접근 권한: `reporter` 전용 (`roles.ts`)
- OpenSearch 자격증명은 `.env.local` / GitHub Secrets / NCP env 로만 관리

---

## 12. 판단 사항 (결정 아카이브)

1. **매칭 키 = `reporter_id`** (이메일 ❌) — 이메일은 더미 오염으로 한 기자가 파편화. id는 일관.
2. **학습은 가입과 분리** — `reporter_id` 키로 선학습 → 가입 시 연결. 오픈 즉시 전원 사용 가능.
3. **본문은 OpenSearch API** — 크롤링 대비 안정·합법·고속. 550만 건 확보.
4. **팩트는 Lazy 추출** — Eager 전량은 안 쓸 팩트 99% 생산 낭비. 속도 페널티(첫 진입 10~20초)는 로딩으로 흡수.
5. **상시 수집 불필요** — 문체는 스냅샷. 백필 1회 + 분기 갱신(선택).
6. **연성/경성은 M5로 연기** — `section`이 지면 기반이라 자동 분류 불가. 초기 단일 프로파일.
7. **신규 테이블 최소화** — 구 설계의 trend_keyword/related_article/reporter는 기존 자산과 중복이라 미생성.

---

## 13. 미해결 / 리스크

- ⚠ **OpenSearch NCP 미개방** — 현재 로컬 전용. M1 운영 전 NCP ACG 개방 필요
- ⚠ **자매지(sportsworldi.com) 범위** — 일단 전원 학습 후 가입자만 사용 (별도 필터 불요)
- ⚠ **related_news 노이즈** — "게임"에 NBA 영문기사 등 오분류 + 제목 파싱 찌꺼기(`\n어제`). 팩트 추출 전 필터 필수
- ⚠ **인용문 유사성** — 발언 인용은 사실이라 무방하나 "직접 확보 여부" 검수 필수 (팩트 source로 점검)
- ⚠ **비용** — 프로파일 생성 211명×gpt-4o 1회성 / 초안·팩트는 Lazy라 사용량 비례

---

## 부록 A. 시연 참고 (구 설계 검증 — 김현주 기자)

> 구 설계 단계에서 수동 시연으로 검증된 결과. 본 설계의 프로파일·초안 품질 기준 참고용.

**문체 프로파일 (발췌)**: 단문 위주·수치 촘촘·전문가 1명 인용 마무리·제목 따옴표 후킹.

**생성 초안 (국민연금, 팩트+프로파일만으로 재작성)**:
> **부부가 함께 받아도 월 120만원…노후 받침대로는 부족한 국민연금**
> 부부가 나란히 국민연금을 받는 가구가 빠르게 늘고 있다. 하지만 두 사람 몫을 합쳐도
> 노후 생활을 지탱하기엔 부족하다는 조사 결과가 나왔다. (…)

**검증 시사점**: 본문 추출 정상 / 문체 재현 양호 / 인용 source 검수 필요 / 유형별 분기 시 재현도 향상.
