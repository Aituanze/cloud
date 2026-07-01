-- 24streets Layer 2 — Schema
-- Выполнить в Supabase Dashboard → SQL Editor

CREATE TABLE agencies (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  city       text DEFAULT 'Алматы',
  logo_url   text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE profiles (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  agency_id  uuid REFERENCES agencies,
  role       text NOT NULL CHECK (role IN ('admin', 'agent')),
  name       text NOT NULL,
  phone      text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE invites (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id   uuid REFERENCES agencies NOT NULL,
  email       text,
  role        text DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  status      text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by  uuid REFERENCES profiles,
  token       text UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at  timestamptz DEFAULT now() + interval '7 days',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE properties (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id        uuid REFERENCES agencies NOT NULL,
  agent_id         uuid REFERENCES profiles NOT NULL,
  source_krisha_id text,
  type             text CHECK (type IN ('apt', 'house', 'land', 'commercial')),
  district         text,
  address          text,
  price            bigint,
  price_label      text,
  area             numeric,
  rooms            integer,
  floor            integer,
  floors           integer,
  building_type    text,
  description      text,
  owner_name       text,
  owner_phone      text,
  photos           text[],
  status           text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  published_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE buyer_profiles (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  phone      text UNIQUE NOT NULL,
  name       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE leads (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES properties NOT NULL,
  agent_id    uuid REFERENCES profiles NOT NULL,
  buyer_id    uuid REFERENCES buyer_profiles,
  buyer_phone text,
  stage       text DEFAULT 'new'
    CHECK (stage IN ('new','contacted','showing','deposit','deal','lost')),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE lead_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     uuid REFERENCES leads NOT NULL,
  stage_from  text,
  stage_to    text NOT NULL,
  note        text,
  created_by  uuid REFERENCES profiles,
  created_at  timestamptz DEFAULT now()
);

-- Storage bucket для фото объектов
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true);
