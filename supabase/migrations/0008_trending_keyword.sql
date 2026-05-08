CREATE TABLE IF NOT EXISTS trending_keyword (
  trending_id       BIGSERIAL PRIMARY KEY,
  keyword           TEXT        NOT NULL,
  approx_traffic    TEXT        NOT NULL,
  traffic_rank      INTEGER     NOT NULL,
  matched_cluster_id BIGINT,
  related_news      JSONB,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_fetched_at
  ON trending_keyword (fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_trending_cluster
  ON trending_keyword (matched_cluster_id)
  WHERE matched_cluster_id IS NOT NULL;
