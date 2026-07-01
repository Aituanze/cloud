-- Добавить недостающие INSERT-политики + отключить email-подтверждение
-- Запустить в Supabase Dashboard → SQL Editor

-- 1. Любой авторизованный пользователь может создать агентство
CREATE POLICY "Auth user insert agency" ON agencies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Любой авторизованный пользователь может обновить своё агентство
CREATE POLICY "Agency admin update" ON agencies FOR UPDATE
  USING (id IN (SELECT agency_id FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Отключить email-подтверждение для авторизации без задержки
-- (сделать через Dashboard: Authentication → Providers → Email → выключить "Confirm email")
-- Или через SQL (только для Supabase self-hosted):
-- UPDATE auth.config SET enable_signup_auto_confirm = true;
