-- agnt.24 — Удаление тестовых аккаунтов/агентств после E2E-теста иерархии (2026-07-04)
-- Выполнить в Supabase Dashboard → SQL Editor. Удаляет тестовое агентство «TAgnt»
-- (директор/МОП/агент из сквозного теста) и оставшееся от первой неудачной попытки
-- «TEST Claud Boss», вместе с их invites/properties/profiles/auth-пользователями.
--
-- ВАЖНО: не трогает боевые аккаунты — фильтр строго по email/названию агентства ниже.
-- Перед прогоном раздела DELETE — проверить блок PREVIEW, что список ожидаемый.

-- ── PREVIEW: что будет удалено ─────────────────────────────────────────
SELECT a.id, a.name, p.id AS profile_id, p.role, u.email
FROM agencies a
LEFT JOIN profiles p ON p.agency_id = a.id
LEFT JOIN auth.users u ON u.id = p.id
WHERE a.name IN ('TAgnt', 'TEST Claud Boss')
   OR u.email IN ('aitu@inbox.ru', 'mop-e2e@example.com', 'agent-e2e@example.com');

-- ── DELETE: в порядке зависимостей (properties/invites → auth.users → agencies) ──
DELETE FROM properties
WHERE agency_id IN (SELECT id FROM agencies WHERE name IN ('TAgnt', 'TEST Claud Boss'));

DELETE FROM invites
WHERE agency_id IN (SELECT id FROM agencies WHERE name IN ('TAgnt', 'TEST Claud Boss'));

-- auth.users каскадно удаляет profiles (ON DELETE CASCADE в schema.sql)
DELETE FROM auth.users
WHERE email IN ('aitu@inbox.ru', 'mop-e2e@example.com', 'agent-e2e@example.com');

DELETE FROM agencies
WHERE name IN ('TAgnt', 'TEST Claud Boss');

-- ── VERIFY: должно вернуть 0 строк ─────────────────────────────────────
SELECT count(*) AS leftover
FROM agencies a
LEFT JOIN auth.users u ON u.email IN ('aitu@inbox.ru', 'mop-e2e@example.com', 'agent-e2e@example.com')
WHERE a.name IN ('TAgnt', 'TEST Claud Boss') OR u.id IS NOT NULL;
