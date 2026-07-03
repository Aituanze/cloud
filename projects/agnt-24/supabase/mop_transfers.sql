-- agnt.24 Layer 2 — Роль МОП + разрешение на перенос объекта
-- Выполнить в Supabase Dashboard → SQL Editor, ПОСЛЕ schema.sql и rls.sql.
--
-- Что делает:
--   1. Добавляет роль 'mop' в profiles (МОП = менеджер группы агентов внутри агентства).
--   2. Добавляет profiles.mop_id — какой МОП-группе принадлежит агент.
--   3. Разрешает тип объекта 'dacha' в properties.type (парсер даёт 5 категорий,
--      раньше схема принимала только 4 — см. TYPE_DB_MAP в agnt-24-app/js/app.js).
--   4. Закрывает дыру в RLS: раньше агент мог сам сменить properties.agent_id
--      через прямой UPDATE (политика проверяла только старую строку, не новую).
--      Теперь agent_id меняется ТОЛЬКО через approve_transfer() от МОП/админа.
--   5. Таблица transfer_requests — заявка на перенос объекта другому агенту,
--      с подтверждением от МОП/админа того же агентства.

-- ── 1–2. Роль и группа МОП ───────────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'mop', 'agent'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mop_id uuid REFERENCES profiles;

-- ── 3. Разрешить 'dacha' ─────────────────────────────────────────────────
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_type_check
  CHECK (type IN ('apt', 'house', 'land', 'commercial', 'dacha'));

-- ── 4. Закрыть самостоятельную смену agent_id ────────────────────────────
DROP POLICY IF EXISTS "Agent update own" ON properties;
CREATE POLICY "Agent update own" ON properties FOR UPDATE
  USING     (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());  -- новое значение строки тоже обязано остаться "своим"

-- ── 5. Заявки на перенос объекта ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_requests (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   uuid REFERENCES properties NOT NULL,
  from_agent_id uuid REFERENCES profiles NOT NULL,
  to_agent_id   uuid REFERENCES profiles NOT NULL,
  requested_by  uuid REFERENCES profiles NOT NULL,
  status        text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note          text,
  decided_by    uuid REFERENCES profiles,
  decided_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

-- Агент видит заявки, где он участник (отдаёт или получает объект)
CREATE POLICY "Participants read transfer" ON transfer_requests FOR SELECT
  USING (from_agent_id = auth.uid() OR to_agent_id = auth.uid() OR requested_by = auth.uid());

-- МОП/админ видят все заявки своего агентства (через свойство объекта)
CREATE POLICY "Mop reads agency transfers" ON transfer_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = transfer_requests.property_id
        AND p.agency_id = public.current_agency_id()
    )
    AND EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.id = auth.uid() AND me.role IN ('mop', 'admin')
    )
  );

-- Любой агент своего объекта может подать заявку на перенос
CREATE POLICY "Agent requests transfer" ON transfer_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND from_agent_id = auth.uid()
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.agent_id = auth.uid())
  );

-- ── RPC: подтвердить перенос (только МОП/админ того же агентства) ────────
CREATE OR REPLACE FUNCTION public.approve_transfer(request_id uuid, approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req      transfer_requests;
  prop     properties;
  my_role  text;
  my_agency uuid;
BEGIN
  SELECT role, agency_id INTO my_role, my_agency FROM profiles WHERE id = auth.uid();
  IF my_role NOT IN ('mop', 'admin') THEN
    RAISE EXCEPTION 'Только МОП или админ могут подтверждать перенос объекта';
  END IF;

  SELECT * INTO req FROM transfer_requests WHERE id = request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заявка не найдена или уже обработана';
  END IF;

  SELECT * INTO prop FROM properties WHERE id = req.property_id;
  IF prop.agency_id != my_agency THEN
    RAISE EXCEPTION 'Объект принадлежит другому агентству';
  END IF;

  IF approve THEN
    UPDATE properties SET agent_id = req.to_agent_id, updated_at = now() WHERE id = req.property_id;
    UPDATE transfer_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now() WHERE id = request_id;
  ELSE
    UPDATE transfer_requests SET status = 'rejected', decided_by = auth.uid(), decided_at = now() WHERE id = request_id;
  END IF;
END;
$$;
