ALTER TABLE trending_keyword
  ADD COLUMN IF NOT EXISTS search_volume    INTEGER,      -- 정규화 검색량 (정렬용). "5천+"→5000
  ADD COLUMN IF NOT EXISTS growth_rate      INTEGER,      -- 증가율 %. "1,000%"→1000
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ,  -- 역산된 시작 시각
  ADD COLUMN IF NOT EXISTS started_ago_text TEXT,         -- 원문 "3시간 전"
  ADD COLUMN IF NOT EXISTS status           TEXT,         -- "활성" 등
  ADD COLUMN IF NOT EXISTS related_queries  TEXT[];       -- 관련 검색어 배열
