-- agnt.24 — Уборка после live negative-теста иерархии/RLS 2026-07-08
-- Тест оставил цепочку FK без ON DELETE CASCADE:
--   invites.invited_by -> profiles
--   agencies.created_by -> profiles
--   profiles.agency_id -> agencies
-- Прямой DELETE FROM auth.users / profiles падает с 23503.
--
-- Порядок: листья → invites/properties → обнулить created_by/mop_id →
-- profiles → agencies → auth.users.
--
-- ВАЖНО: перед DELETE проверить PREVIEW — фильтр строго по email-паттерну теста.
-- Выполнять в Supabase Dashboard → SQL Editor под service_role (postgres).

-- ── PREVIEW: тестовые пользователи ────────────────────────────────────────
SELECT id, email, created_at FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com';

-- ── PREVIEW: тестовые агентства ───────────────────────────────────────────
WITH test_users AS (
  SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'
)
SELECT a.id, a.name, a.created_by, u.email AS creator_email
FROM agencies a
LEFT JOIN auth.users u ON u.id = a.created_by
WHERE a.created_by IN (SELECT id FROM test_users)
   OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM test_users));

-- ── PREVIEW: что на них ещё ссылается ─────────────────────────────────────
WITH test_users AS (
  SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'
),
test_agencies AS (
  SELECT DISTINCT a.id
  FROM agencies a
  WHERE a.created_by IN (SELECT id FROM test_users)
     OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM test_users))
)
SELECT 'agencies'      AS tbl, count(*) FROM agencies      WHERE id IN (SELECT id FROM test_agencies)
UNION ALL
SELECT 'invites',             count(*) FROM invites        WHERE agency_id IN (SELECT id FROM test_agencies)
                            OR invited_by IN (SELECT id FROM test_users)
UNION ALL
SELECT 'properties',          count(*) FROM properties     WHERE agency_id IN (SELECT id FROM test_agencies)
                            OR agent_id IN (SELECT id FROM test_users)
UNION ALL
SELECT 'leads',               count(*) FROM leads          WHERE agent_id IN (SELECT id FROM test_users)
UNION ALL
SELECT 'lead_events',         count(*) FROM lead_events    WHERE created_by IN (SELECT id FROM test_users)
UNION ALL
SELECT 'profiles',            count(*) FROM profiles       WHERE id IN (SELECT id FROM test_users);

-- ── DELETE: зависимости → profiles → agencies → auth.users ────────────────
-- ⚠️ Запускать ВЕСЬ блок от BEGIN до COMMIT одним Run (не по частям!).
BEGIN;

DELETE FROM lead_events
WHERE created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
   OR lead_id IN (
     SELECT l.id FROM leads l
     JOIN properties p ON p.id = l.property_id
     WHERE p.agency_id IN (
       SELECT DISTINCT a.id FROM agencies a
       WHERE a.created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
          OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'))
     )
   );

DELETE FROM leads
WHERE agent_id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
   OR property_id IN (
     SELECT id FROM properties WHERE agency_id IN (
       SELECT DISTINCT a.id FROM agencies a
       WHERE a.created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
          OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'))
     )
   );

DELETE FROM properties
WHERE agency_id IN (
    SELECT DISTINCT a.id FROM agencies a
    WHERE a.created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
       OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'))
  )
   OR agent_id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

DELETE FROM invites
WHERE agency_id IN (
    SELECT DISTINCT a.id FROM agencies a
    WHERE a.created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com')
       OR a.id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'))
       OR (NOT EXISTS (SELECT 1 FROM profiles p WHERE p.agency_id = a.id)
           AND a.subscription_status = 'test')
  )
   OR invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

UPDATE profiles SET mop_id = NULL
WHERE mop_id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

UPDATE profiles SET agency_id = NULL
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

DELETE FROM agencies
WHERE created_by IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

DELETE FROM agencies a
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.agency_id = a.id)
  AND a.subscription_status = 'test';

DELETE FROM profiles
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com');

DELETE FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com';

COMMIT;

-- ── VERIFY: должно вернуть 0 ─────────────────────────────────────────────
SELECT count(*) AS leftover_users FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com';

WITH test_users AS (
  SELECT id FROM auth.users WHERE email LIKE 'e2e-negtest-%@example.com'
)
SELECT count(*) AS leftover_agencies
FROM agencies
WHERE created_by IN (SELECT id FROM test_users)
   OR id IN (SELECT agency_id FROM profiles WHERE id IN (SELECT id FROM test_users));
