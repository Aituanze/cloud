-- agnt.24 Layer 2 — Иерархия агентств + приглашения + KPI-поля
-- Выполнить в Supabase Dashboard → SQL Editor, ПОСЛЕ schema.sql/rls.sql/mop_transfers.sql.
--
-- Модель:
--   superadmin (ты) → создаёт агентство + приглашает руководителя (роль 'admin')
--   admin (руководитель агентства) → приглашает МОПов (роль 'mop')
--   mop → приглашает агентов (роль 'agent')
--
-- Приглашение = запись в invites (email, роль, токен) → ссылка вида
-- https://aituanze.github.io/cloud/?invite=ТОКЕН → приглашённый сам
-- регистрируется (signUp) и подтверждает через accept_invite().
-- Так безопаснее: создание живых аккаунтов с паролем нельзя делать
-- за пользователя без service_role ключа (его в клиенте быть не должно).

-- ── 1. Роль superadmin + KPI-поля агента (ручной бэкфилл истории) ────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'admin', 'mop', 'agent'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hired_at        date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deposits_manual integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS volume_manual   bigint  NOT NULL DEFAULT 0;
COMMENT ON COLUMN profiles.deposits_manual IS 'Задатки за всё время ДО начала работы в приложении — ручной бэкфилл, пока нет автосчёта по сделкам';
COMMENT ON COLUMN profiles.volume_manual   IS 'Вал (₸) за всё время ДО начала работы в приложении — ручной бэкфилл';

-- ── 2. Подписка + кто создал агентство ────────────────────────────────
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS subscription_status text
  DEFAULT 'test' CHECK (subscription_status IN ('test', 'active', 'suspended'));
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles;

-- ── 3. Эксклюзив / СНР на объекте ─────────────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS exclusivity text
  DEFAULT 'none' CHECK (exclusivity IN ('none', 'exclusive', 'snr'));
COMMENT ON COLUMN properties.exclusivity IS 'none — просто в работе, exclusive — подписан эксклюзивный договор, snr — собственник не рекламит (снял с публикации, работает без договора)';

-- ── 4. invites: разрешить роль 'mop' (была только admin/agent) ────────
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check
  CHECK (role IN ('admin', 'mop', 'agent'));

-- ── helper: я ли superadmin ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin');
$$;

-- ══════════════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════════════

-- ── agencies: закрыть свободное самосоздание, разрешить только superadmin ──
DROP POLICY IF EXISTS "Auth user insert agency" ON agencies;
CREATE POLICY "Superadmin creates agency" ON agencies FOR INSERT
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmin reads all agencies" ON agencies FOR SELECT
  USING (public.is_superadmin());
CREATE POLICY "Superadmin updates agency" ON agencies FOR UPDATE
  USING (public.is_superadmin());

-- ── profiles: superadmin видит всех (для иерархии агентств) ───────────
CREATE POLICY "Superadmin reads all profiles" ON profiles FOR SELECT
  USING (public.is_superadmin());

-- ── invites: кто может звать кого ──────────────────────────────────────
-- admin зовёт mop/agent в свою агентство, mop зовёт только agent,
-- superadmin зовёт admin (руководителя) в только что созданное агентство.
CREATE POLICY "Hierarchy invites" ON invites FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND (
      public.is_superadmin() AND role = 'admin'
      OR (
        agency_id = public.current_agency_id()
        AND (
          (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' AND role IN ('mop', 'agent')
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'mop' AND role = 'agent'
        )
      )
    )
  );

CREATE POLICY "Agency leaders read invites" ON invites FOR SELECT
  USING (
    public.is_superadmin()
    OR (
      agency_id = public.current_agency_id()
      AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'mop')
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- RPC
-- ══════════════════════════════════════════════════════════════════════

-- Прочитать приглашение по токену (до логина — вызывается анонимно со страницы регистрации)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token text)
RETURNS TABLE(email text, role text, agency_id uuid, agency_name text, status text, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT i.email, i.role, i.agency_id, a.name, i.status, i.expires_at
  FROM invites i JOIN agencies a ON a.id = i.agency_id
  WHERE i.token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- Принять приглашение — вызывается СРАЗУ после auth.signUp() тем же пользователем.
-- Создаёт profiles-запись с ролью/агентством из инвайта, помечает инвайт принятым.
CREATE OR REPLACE FUNCTION public.accept_invite(p_token text, p_name text, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv          invites;
  my_email     text;
  inviter_role text;
  new_mop_id   uuid;
BEGIN
  SELECT * INTO inv FROM invites WHERE token = p_token AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Приглашение не найдено или уже использовано';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'Срок приглашения истёк';
  END IF;

  SELECT email INTO my_email FROM auth.users WHERE id = auth.uid();
  IF my_email IS DISTINCT FROM inv.email THEN
    RAISE EXCEPTION 'Приглашение выдано на другой email';
  END IF;

  -- Если приглашал МОП — новый агент привязывается к нему как к своему МОПу
  SELECT role INTO inviter_role FROM profiles WHERE id = inv.invited_by;
  new_mop_id := CASE WHEN inv.role = 'agent' AND inviter_role = 'mop' THEN inv.invited_by ELSE NULL END;

  INSERT INTO profiles (id, agency_id, role, mop_id, name, phone, hired_at)
  VALUES (auth.uid(), inv.agency_id, inv.role, new_mop_id, p_name, p_phone, CURRENT_DATE)
  ON CONFLICT (id) DO UPDATE SET agency_id = inv.agency_id, role = inv.role, mop_id = new_mop_id, name = p_name, phone = p_phone;

  UPDATE invites SET status = 'accepted' WHERE id = inv.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invite(text, text, text) TO authenticated;

-- Superadmin: создать агентство + сразу пригласить руководителя одним вызовом
CREATE OR REPLACE FUNCTION public.create_agency(
  p_name text, p_subscription text, p_director_email text, p_director_name text
)
RETURNS invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_agency agencies;
  new_invite invites;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Только superadmin может создавать агентства';
  END IF;

  INSERT INTO agencies (name, subscription_status, created_by)
  VALUES (p_name, p_subscription, auth.uid())
  RETURNING * INTO new_agency;

  INSERT INTO invites (agency_id, email, role, invited_by)
  VALUES (new_agency.id, p_director_email, 'admin', auth.uid())
  RETURNING * INTO new_invite;

  RETURN new_invite;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_agency(text, text, text, text) TO authenticated;
