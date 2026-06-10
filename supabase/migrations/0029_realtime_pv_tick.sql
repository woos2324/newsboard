-- 0029: 실시간 PV tick — 오늘의 누적 조회수 시계열 (10분 간격 스냅샷)
-- 네이버는 '오늘의 시간대별 PV'를 제공하지 않음(userV2/time?startDate=today → 500).
-- 대신 /api/today 의 오늘 누적 총조회수를 주기적으로 저장해, 그 차이로
-- '오늘 경과 시간대 추이'를 우리가 직접 구축한다.
CREATE TABLE IF NOT EXISTS realtime_pv_tick (
  tick_id     BIGSERIAL   PRIMARY KEY,
  data_date   DATE        NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,                 -- 네이버 utime(KST) 기준 수집 시각
  device      VARCHAR     NOT NULL DEFAULT 'all',   -- all / pc / mobile
  cum_pv      BIGINT      NOT NULL,                 -- 그 시각까지의 오늘 누적 PV
  CONSTRAINT realtime_pv_tick_unique UNIQUE (data_date, captured_at, device)
);

ALTER TABLE realtime_pv_tick ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read realtime_pv_tick"
  ON realtime_pv_tick FOR SELECT TO anon USING (true);

CREATE POLICY "service all realtime_pv_tick"
  ON realtime_pv_tick FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_realtime_pv_tick_date_device
  ON realtime_pv_tick (data_date, device, captured_at);
