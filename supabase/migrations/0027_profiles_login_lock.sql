-- 0027_profiles_login_lock
-- 로그인 5회 실패 시 계정 잠금 (관리자 수동 해제까지 무기한)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
