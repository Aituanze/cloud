-- agnt.24 — КРИТИЧНЫЙ фикс: самоповышение до superadmin в обход инвайтов
-- Выполнить в Supabase Dashboard → SQL Editor СРОЧНО (эксплуатируется уже сейчас).
--
-- Найдено live negative-тестом 2026-07-08: политики "Own profile insert" /
-- "Own profile update" (rls.sql) проверяют только владельца строки
-- (id = auth.uid()), но НЕ проверяют значения role/agency_id. Из-за этого
-- ЛЮБОЙ анонимный посетитель может: 1) Sb.auth.signUp() с произвольным email
-- (инвайт не нужен), 2) .from('profiles').insert({id, role:'superadmin'})
-- напрямую — и стать настоящим superadmin, минуя всю систему инвайтов.
-- Дальше он реально может звать accept_invite/create_agency, читать все
-- agencies/profiles (RLS-политики "Superadmin ..." их пускают).
-- Подтверждено живым тестом: insert прошёл без ошибки, после чего
-- create_agency() у "чужого" аккаунта тоже отработал успешно (создал
-- реальную агентство+invite). Тестовые данные удалены тем же тестом.
--
-- Фикс: profiles создаются/меняются либо через SECURITY DEFINER RPC
-- (accept_invite — уже и так в обход RLS), либо владельцем строки, но
-- БЕЗ права менять свою же role/agency_id напрямую через self-insert/update.

DROP POLICY IF EXISTS "Own profile insert" ON profiles;
CREATE POLICY "Own profile insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND role = 'agent' AND agency_id IS NULL);

DROP POLICY IF EXISTS "Own profile update" ON profiles;
CREATE POLICY "Own profile update" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role      = (SELECT p.role      FROM profiles p WHERE p.id = auth.uid())
    AND agency_id IS NOT DISTINCT FROM (SELECT p.agency_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ── VERIFY (прогнать под своим боевым логином) ──────────────────────────
-- 1) Обычный агент/МОП/админ по-прежнему может обновлять своё имя/телефон:
--    UPDATE profiles SET name = name WHERE id = auth.uid();  -- должно пройти
-- 2) Попытка сменить себе роль теперь должна упасть с "row-level security policy":
--    UPDATE profiles SET role = 'superadmin' WHERE id = auth.uid();
