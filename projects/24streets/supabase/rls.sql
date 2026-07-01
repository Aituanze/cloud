-- 24streets Layer 2 — Row Level Security
-- Выполнить ПОСЛЕ schema.sql в Supabase Dashboard → SQL Editor

ALTER TABLE agencies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events    ENABLE ROW LEVEL SECURITY;

-- ── agencies: только участники своего агентства ──────────────────────────
CREATE POLICY "Agency members read" ON agencies FOR SELECT
  USING (id IN (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- ── profiles: коллеги по агентству ───────────────────────────────────────
CREATE POLICY "Same agency profiles read" ON profiles FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Own profile insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Own profile update" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ── properties ────────────────────────────────────────────────────────────
-- Активные объекты — читают все (анон покупатели)
CREATE POLICY "Public read active" ON properties FOR SELECT
  USING (status = 'active');

-- Все объекты своего агентства — читают агенты
CREATE POLICY "Agent read own agency" ON properties FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM profiles WHERE id = auth.uid()));

-- Добавить объект — только агент
CREATE POLICY "Agent insert" ON properties FOR INSERT
  WITH CHECK (agent_id = auth.uid());

-- Редактировать — только свои объекты
CREATE POLICY "Agent update own" ON properties FOR UPDATE
  USING (agent_id = auth.uid());

-- ── buyer_profiles: только своя запись ───────────────────────────────────
CREATE POLICY "Own buyer profile" ON buyer_profiles FOR ALL
  USING (id = auth.uid());

-- ── leads: только свои агенты + системная вставка ────────────────────────
CREATE POLICY "Agent own leads" ON leads FOR ALL
  USING (agent_id = auth.uid());

CREATE POLICY "System insert lead" ON leads FOR INSERT
  WITH CHECK (true);

-- ── lead_events ───────────────────────────────────────────────────────────
CREATE POLICY "Agent lead events" ON lead_events FOR SELECT
  USING (lead_id IN (SELECT id FROM leads WHERE agent_id = auth.uid()));

CREATE POLICY "Agent insert lead event" ON lead_events FOR INSERT
  WITH CHECK (true);

-- ── Storage: property-photos ──────────────────────────────────────────────
CREATE POLICY "Public photo read" ON storage.objects FOR SELECT
  USING (bucket_id = 'property-photos');

CREATE POLICY "Agent photo upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'property-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Agent photo delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'property-photos' AND auth.uid() IS NOT NULL);
