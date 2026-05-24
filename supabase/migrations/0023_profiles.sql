-- 사용자 프로필 + 역할 기반 접근 제어 (30차)
-- auth.users 1:1, role/approved 로 메뉴 접근 + 승인 게이트
CREATE TABLE profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      VARCHAR     NOT NULL,
  name       VARCHAR     NOT NULL,
  role       VARCHAR     NOT NULL
               CHECK (role IN ('superadmin','admin','business','reporter'))
               DEFAULT 'reporter',
  approved   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role     ON profiles(role);
CREATE INDEX idx_profiles_approved ON profiles(approved);

-- updated_at 자동 갱신 trigger
CREATE OR REPLACE FUNCTION set_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_profiles_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 본인 row 조회만 허용 (Middleware/Server Component 에서 사용)
CREATE POLICY "self read"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- service role 전체 접근 (Server Action / cron / admin 화면 mutation)
CREATE POLICY "service role full access"
  ON profiles
  USING (true)
  WITH CHECK (true);
