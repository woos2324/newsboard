-- service role full access 정책 제거
-- service_role 키는 RLS를 자동 bypass하므로 이 정책이 불필요하고,
-- {public} 역할에 적용되어 anon 사용자도 전체 접근 가능한 보안 취약점이었음
DROP POLICY IF EXISTS "service role full access" ON profiles;
