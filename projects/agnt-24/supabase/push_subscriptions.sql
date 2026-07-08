-- agnt.24 — Web Push подписки агентов.
-- Выполнить в Supabase Dashboard → SQL Editor (после schema.sql/rls.sql).
--
-- Контекст: нативные push-уведомления (BACKLOG.md, «Возможности из
-- исследования 2026-07-01» — ilvo работает только в браузере, это незакрытая
-- ниша). Клиент подписывается через Web Push API (js/push-notifications.js),
-- эндпоинт браузера + ключи шифрования сохраняются сюда. Отправка — Edge
-- Function supabase/functions/send-push (нужен отдельный деплой, см. её шапку).
--
-- Триггер уже вшит: buyer-feed.js вызывает Sb.triggerPush() сразу после
-- Sb.createLead() — агент получает push «Новый лид» в момент, когда
-- покупатель раскрыл его контакт.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile ON push_subscriptions (profile_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own push subscriptions select" ON push_subscriptions;
CREATE POLICY "Own push subscriptions select" ON push_subscriptions FOR SELECT
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Own push subscriptions insert" ON push_subscriptions;
CREATE POLICY "Own push subscriptions insert" ON push_subscriptions FOR INSERT
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Own push subscriptions update" ON push_subscriptions;
CREATE POLICY "Own push subscriptions update" ON push_subscriptions FOR UPDATE
  USING     (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Own push subscriptions delete" ON push_subscriptions;
CREATE POLICY "Own push subscriptions delete" ON push_subscriptions FOR DELETE
  USING (profile_id = auth.uid());

-- send-push — Edge Function использует service_role ключ (обходит RLS
-- напрямую, читает подписки любого профиля), отдельная политика для чтения
-- чужих подписок не нужна.
