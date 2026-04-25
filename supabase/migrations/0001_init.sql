-- Newsboard — AI 기반 미디어 모니터링 대시보드
-- 초기 스키마. ERD 문서 documents/4)ERD.md 기반.

-- =============================================================
-- 1. MediaCompany
-- =============================================================
CREATE TABLE IF NOT EXISTS media_company (
  media_company_id   BIGSERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  normalized_name    VARCHAR(100) NOT NULL UNIQUE,
  naver_media_id     VARCHAR(50)  UNIQUE,
  homepage_url       TEXT,
  is_our_company     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 2. Article
-- =============================================================
CREATE TABLE IF NOT EXISTS article (
  article_id           BIGSERIAL PRIMARY KEY,
  media_company_id     BIGINT       NOT NULL REFERENCES media_company(media_company_id) ON DELETE RESTRICT,
  external_article_id  VARCHAR(100),
  title                TEXT         NOT NULL,
  url                  TEXT         NOT NULL UNIQUE,
  body                 TEXT,
  category             VARCHAR(50),
  author_name          VARCHAR(100),
  published_at         TIMESTAMPTZ,
  collected_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  content_hash         VARCHAR(64),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_media_published
  ON article (media_company_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_category_published
  ON article (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_content_hash
  ON article (content_hash);

-- =============================================================
-- 3. RankingNewsSnapshot
-- =============================================================
CREATE TABLE IF NOT EXISTS ranking_news_snapshot (
  ranking_snapshot_id  BIGSERIAL PRIMARY KEY,
  media_company_id     BIGINT       NOT NULL REFERENCES media_company(media_company_id) ON DELETE CASCADE,
  snapshot_at          TIMESTAMPTZ  NOT NULL,
  source               VARCHAR(50)  NOT NULL,
  category             VARCHAR(50),
  collection_status    VARCHAR(30)  NOT NULL DEFAULT 'success'
    CHECK (collection_status IN ('success', 'partial', 'failed')),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_media_time
  ON ranking_news_snapshot (media_company_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_time_category
  ON ranking_news_snapshot (snapshot_at DESC, category);

-- =============================================================
-- 4. RankingNewsItem
-- =============================================================
CREATE TABLE IF NOT EXISTS ranking_news_item (
  ranking_item_id      BIGSERIAL PRIMARY KEY,
  ranking_snapshot_id  BIGINT NOT NULL REFERENCES ranking_news_snapshot(ranking_snapshot_id) ON DELETE CASCADE,
  article_id           BIGINT NOT NULL REFERENCES article(article_id) ON DELETE CASCADE,
  rank_position        INTEGER NOT NULL,
  score                NUMERIC(10, 4),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ranking_snapshot_id, rank_position)
);

CREATE INDEX IF NOT EXISTS idx_ranking_item_snapshot_rank
  ON ranking_news_item (ranking_snapshot_id, rank_position);

-- =============================================================
-- 5. SubscriberSnapshot
-- =============================================================
CREATE TABLE IF NOT EXISTS subscriber_snapshot (
  subscriber_snapshot_id BIGSERIAL PRIMARY KEY,
  media_company_id       BIGINT NOT NULL REFERENCES media_company(media_company_id) ON DELETE CASCADE,
  snapshot_date          DATE   NOT NULL,
  subscriber_count       INTEGER NOT NULL,
  daily_delta            INTEGER,
  seven_day_delta        INTEGER,
  source                 VARCHAR(50) NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (media_company_id, snapshot_date, source)
);

CREATE INDEX IF NOT EXISTS idx_subscriber_media_date
  ON subscriber_snapshot (media_company_id, snapshot_date DESC);

-- =============================================================
-- 6. CommentMetric
-- =============================================================
CREATE TABLE IF NOT EXISTS comment_metric (
  comment_metric_id  BIGSERIAL PRIMARY KEY,
  article_id         BIGINT NOT NULL REFERENCES article(article_id) ON DELETE CASCADE,
  measured_at        TIMESTAMPTZ NOT NULL,
  comment_count      INTEGER NOT NULL,
  like_count         INTEGER,
  reply_count        INTEGER,
  engagement_score   NUMERIC(12, 4),
  source             VARCHAR(50) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_article_time
  ON comment_metric (article_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_time_score
  ON comment_metric (measured_at DESC, engagement_score DESC);

-- =============================================================
-- 7. IssueCluster
-- =============================================================
CREATE TABLE IF NOT EXISTS issue_cluster (
  issue_cluster_id     BIGSERIAL PRIMARY KEY,
  cluster_key          VARCHAR(128) NOT NULL UNIQUE,
  representative_title TEXT         NOT NULL,
  keywords             TEXT[],
  summary              TEXT,
  cluster_date         DATE         NOT NULL,
  confidence_score     NUMERIC(5, 4),
  model_version        VARCHAR(50)  NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_cluster_date
  ON issue_cluster (cluster_date DESC);
CREATE INDEX IF NOT EXISTS idx_issue_cluster_keywords_gin
  ON issue_cluster USING GIN (keywords);

-- =============================================================
-- 8. IssueClusterArticle
-- =============================================================
CREATE TABLE IF NOT EXISTS issue_cluster_article (
  issue_cluster_article_id BIGSERIAL PRIMARY KEY,
  issue_cluster_id         BIGINT NOT NULL REFERENCES issue_cluster(issue_cluster_id) ON DELETE CASCADE,
  article_id               BIGINT NOT NULL REFERENCES article(article_id) ON DELETE CASCADE,
  similarity_score         NUMERIC(5, 4),
  is_representative        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_cluster_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_article_similarity
  ON issue_cluster_article (issue_cluster_id, similarity_score DESC);

-- =============================================================
-- 9. User (내부 계정)
-- =============================================================
-- 예약어 충돌 피하려 테이블명 app_user 로 저장
CREATE TABLE IF NOT EXISTS app_user (
  user_id       BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(50)  NOT NULL
    CHECK (role IN ('journalist', 'editor', 'decision_maker', 'analyst', 'admin')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_user_role ON app_user (role);

-- =============================================================
-- 10. MissedIssueAlert
-- =============================================================
CREATE TABLE IF NOT EXISTS missed_issue_alert (
  missed_issue_alert_id    BIGSERIAL PRIMARY KEY,
  issue_cluster_id         BIGINT NOT NULL REFERENCES issue_cluster(issue_cluster_id) ON DELETE CASCADE,
  target_media_company_id  BIGINT NOT NULL REFERENCES media_company(media_company_id) ON DELETE CASCADE,
  alert_status             VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (alert_status IN ('open', 'reviewing', 'resolved', 'ignored')),
  competitor_article_count INTEGER NOT NULL,
  priority_score           NUMERIC(10, 4),
  reason                   TEXT,
  reviewed_by_user_id      BIGINT REFERENCES app_user(user_id) ON DELETE SET NULL,
  detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missed_alert_status_time
  ON missed_issue_alert (alert_status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_alert_priority
  ON missed_issue_alert (priority_score DESC);

-- =============================================================
-- 11. AISummary
-- =============================================================
CREATE TABLE IF NOT EXISTS ai_summary (
  ai_summary_id       BIGSERIAL PRIMARY KEY,
  issue_cluster_id    BIGINT REFERENCES issue_cluster(issue_cluster_id) ON DELETE SET NULL,
  created_by_user_id  BIGINT REFERENCES app_user(user_id) ON DELETE SET NULL,
  summary_type        VARCHAR(30) NOT NULL
    CHECK (summary_type IN ('daily', 'weekly', 'issue', 'competitor')),
  summary_date        DATE        NOT NULL,
  title               TEXT        NOT NULL,
  content             TEXT        NOT NULL,
  source_metadata     JSONB,
  model_version       VARCHAR(50) NOT NULL,
  quality_score       NUMERIC(5, 4),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_summary_type_date
  ON ai_summary (summary_type, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_summary_metadata_gin
  ON ai_summary USING GIN (source_metadata);

-- =============================================================
-- updated_at 자동 갱신 트리거
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'media_company', 'article', 'issue_cluster', 'ai_summary', 'app_user'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;
       CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t
    );
  END LOOP;
END $$;
