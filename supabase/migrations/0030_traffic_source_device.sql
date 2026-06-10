-- 0030: 유입경로 device별 분리 — 네이버 /api/today 는 device(전체/PC/모바일)별 referer 를 제공.
-- 기존 행은 'all' 로 기본값. 실시간 수집은 all/pc/mobile 각각 저장.
ALTER TABLE traffic_source_daily ADD COLUMN IF NOT EXISTS device VARCHAR NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS idx_traffic_source_date_device ON traffic_source_daily (data_date, device);
