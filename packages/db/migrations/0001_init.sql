CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  category text NOT NULL,
  suburb text NOT NULL,
  rate_cents integer NOT NULL,
  rate_basis text NOT NULL DEFAULT 'hourly' CHECK (rate_basis IN ('hourly','fixed')),
  rating_avg numeric(2,1) NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  description text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','accepted','declined','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- atomic guarantee: no overlapping accepted/completed bookings per provider
  CONSTRAINT no_overlap EXCLUDE USING gist (
    provider_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('accepted','completed'))
);

CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  from_status text,
  to_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS providers_browse_idx ON providers (approved, category, suburb);
CREATE INDEX IF NOT EXISTS bookings_provider_idx ON bookings (provider_id, status);
