-- 0020: PV 수집 확장 — device/section/시간 차원 추가
-- article_pv_snapshot에 time_dimension 컬럼 추가
ALTER TABLE article_pv_snapshot
  ADD COLUMN IF NOT EXISTS time_dimension VARCHAR NOT NULL DEFAULT 'daily';

ALTER TABLE article_pv_snapshot
  DROP CONSTRAINT IF EXISTS article_pv_snapshot_data_date_rank_device_category_key;

ALTER TABLE article_pv_snapshot
  DROP CONSTRAINT IF EXISTS article_pv_snapshot_unique;

ALTER TABLE article_pv_snapshot
  ADD CONSTRAINT article_pv_snapshot_unique
  UNIQUE (data_date, time_dimension, rank, device, category);

-- daily_cv_snapshot 신규 테이블 (visitV2/cv — 섹션·디바이스별 실제 총 PV)
CREATE TABLE IF NOT EXISTS daily_cv_snapshot (
  daily_cv_id    BIGSERIAL PRIMARY KEY,
  data_date      DATE        NOT NULL,
  time_dimension VARCHAR     NOT NULL DEFAULT 'daily',
  device         VARCHAR     NOT NULL DEFAULT 'all',
  section        VARCHAR     NOT NULL DEFAULT 'all',
  pv             BIGINT      NOT NULL,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_cv_snapshot_unique
    UNIQUE (data_date, time_dimension, device, section)
);

ALTER TABLE daily_cv_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read daily_cv_snapshot"
  ON daily_cv_snapshot FOR SELECT TO anon USING (true);

CREATE POLICY "service all daily_cv_snapshot"
  ON daily_cv_snapshot FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_daily_cv_date_dim
  ON daily_cv_snapshot (data_date, time_dimension);
