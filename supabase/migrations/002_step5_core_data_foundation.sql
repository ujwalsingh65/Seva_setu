-- Step 5 core operational data foundation.
-- The existing users table remains the Clerk-linked application identity source.
-- Browser clients do not access Supabase directly; backend service-role queries
-- bypass RLS and must be authorized by the backend before querying.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE event_registration_mode AS ENUM ('open', 'approval_required');

-- Align the existing identity table with the documented unique email and lookup indexes.
ALTER TABLE public.users
  ADD CONSTRAINT users_email_unique UNIQUE (email);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);

CREATE TABLE public.volunteer_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  photo_url TEXT,
  bio TEXT,
  home_geo GEOGRAPHY(POINT, 4326),
  max_distance_km NUMERIC(6, 2),
  causes TEXT[],
  emergency_available BOOLEAN NOT NULL DEFAULT false,
  profile_visibility BOOLEAN NOT NULL,
  history_visibility BOOLEAN NOT NULL,
  notification_preferences JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_volunteer_profiles_home_geo ON public.volunteer_profiles USING GIST (home_geo);

CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.volunteer_skills (
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  skill_id UUID NOT NULL REFERENCES public.skills (id) ON DELETE RESTRICT,
  level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (volunteer_id, skill_id)
);

CREATE INDEX idx_volunteer_skills_skill_id ON public.volunteer_skills (skill_id);

CREATE TABLE public.ngos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  causes TEXT[],
  region TEXT,
  geo GEOGRAPHY(POINT, 4326),
  contact JSONB,
  logo_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'rejected', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ngos_geo ON public.ngos USING GIST (geo);
CREATE INDEX idx_ngos_status ON public.ngos (status);

CREATE TABLE public.ngo_members (
  ngo_id UUID NOT NULL REFERENCES public.ngos (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'coordinator')),
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ngo_id, user_id)
);

CREATE INDEX idx_ngo_members_user_id ON public.ngo_members (user_id);

CREATE TABLE public.ngo_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id UUID NOT NULL REFERENCES public.ngos (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'rejected', 'ended')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_ngo_affiliations_ngo_id ON public.ngo_affiliations (ngo_id);
CREATE INDEX idx_ngo_affiliations_volunteer_id ON public.ngo_affiliations (volunteer_id);
CREATE UNIQUE INDEX idx_ngo_affiliations_unique_active
  ON public.ngo_affiliations (ngo_id, volunteer_id)
  WHERE status = 'active';

CREATE TABLE public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  issuer TEXT,
  expiry DATE,
  document_url TEXT,
  verified_by_ngo_id UUID REFERENCES public.ngos (id) ON DELETE RESTRICT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('self_declared', 'ngo_verified', 'expired', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certifications_volunteer_id ON public.certifications (volunteer_id);
CREATE INDEX idx_certifications_expiry ON public.certifications (expiry);

CREATE TABLE public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  weekday SMALLINT,
  start_time TIME,
  end_time TIME,
  available_date DATE,
  is_available BOOLEAN NOT NULL,
  recurrence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_weekday_range CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  CONSTRAINT availability_time_order CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time),
  CONSTRAINT availability_model_shape CHECK (
    (available_date IS NULL AND weekday IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
    OR
    (
      available_date IS NOT NULL
      AND weekday IS NULL
      AND (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL)
      )
    )
  )
);

CREATE INDEX idx_availability_volunteer_id ON public.availability (volunteer_id);
CREATE INDEX idx_availability_available_date ON public.availability (available_date);

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id UUID NOT NULL REFERENCES public.ngos (id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cause TEXT NOT NULL,
  venue TEXT NOT NULL,
  geo GEOGRAPHY(POINT, 4326),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'ngo_only')),
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'cancelled')),
  registration_mode event_registration_mode NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT events_capacity_positive CHECK (capacity > 0),
    CONSTRAINT events_time_order CHECK (start_at < end_at)
);

CREATE INDEX idx_events_ngo_id ON public.events (ngo_id);
CREATE INDEX idx_events_status ON public.events (status);
CREATE INDEX idx_events_start_at ON public.events (start_at);
CREATE INDEX idx_events_visibility ON public.events (visibility);
CREATE INDEX idx_events_cause ON public.events (cause);
CREATE INDEX idx_events_geo ON public.events USING GIST (geo);

CREATE TABLE public.event_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  headcount INTEGER NOT NULL,
  required_skill_ids UUID[] NOT NULL,
  required_cert_names TEXT[] NOT NULL,
  min_experience INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_requirements_headcount_positive CHECK (headcount > 0)
);

ALTER TABLE public.event_requirements
  ADD CONSTRAINT event_requirements_event_id_id_unique UNIQUE (event_id, id);

CREATE INDEX idx_event_requirements_event_id ON public.event_requirements (event_id);

CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  headcount INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT shifts_headcount_positive CHECK (headcount > 0),
    CONSTRAINT shifts_time_order CHECK (start_at < end_at),
    CONSTRAINT shifts_requirement_belongs_to_event_fkey
      FOREIGN KEY (event_id, requirement_id)
      REFERENCES public.event_requirements (event_id, id)
      ON DELETE RESTRICT
);

CREATE INDEX idx_shifts_event_id ON public.shifts (event_id);
CREATE INDEX idx_shifts_requirement_id ON public.shifts (requirement_id);
CREATE INDEX idx_shifts_start_at ON public.shifts (start_at);

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('interested', 'accepted', 'waitlisted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT applications_event_volunteer_unique UNIQUE (event_id, volunteer_id)
);

CREATE INDEX idx_applications_event_id ON public.applications (event_id);
CREATE INDEX idx_applications_volunteer_id ON public.applications (volunteer_id);

-- Keep all documented mutable-row timestamps current on direct backend writes.
CREATE TRIGGER volunteer_profiles_updated_at
  BEFORE UPDATE ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ngos_updated_at
  BEFORE UPDATE ON public.ngos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ngo_members_updated_at
  BEFORE UPDATE ON public.ngo_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER certifications_updated_at
  BEFORE UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Serialize accepted registrations per event so concurrent requests cannot
-- overrun capacity. Other application statuses do not consume capacity.
CREATE OR REPLACE FUNCTION public.enforce_application_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_capacity INTEGER;
  accepted_count BIGINT;
BEGIN
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT capacity
    INTO event_capacity
    FROM public.events
    WHERE id = NEW.event_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO accepted_count
    FROM public.applications
    WHERE event_id = NEW.event_id
      AND status = 'accepted'
      AND id IS DISTINCT FROM NEW.id;

  IF accepted_count >= event_capacity THEN
    RAISE EXCEPTION 'Event capacity reached'
      USING ERRCODE = '23514', CONSTRAINT = 'applications_capacity_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_enforce_capacity
  BEFORE INSERT OR UPDATE OF event_id, status ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_application_capacity();

CREATE OR REPLACE FUNCTION public.enforce_event_capacity_not_below_accepted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  accepted_count BIGINT;
BEGIN
  SELECT count(*)
    INTO accepted_count
    FROM public.applications
    WHERE event_id = NEW.id
      AND status = 'accepted';

  IF NEW.capacity < accepted_count THEN
    RAISE EXCEPTION 'Capacity cannot be lower than accepted applications'
      USING ERRCODE = '23514', CONSTRAINT = 'events_capacity_at_least_accepted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_capacity_at_least_accepted
  BEFORE UPDATE OF capacity ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_capacity_not_below_accepted();

-- Supabase RLS is defense-in-depth in this backend-mediated architecture.
-- No anon/authenticated policies are granted: browser access to these tables is not
-- part of the architecture. Backend authorization runs before service-role queries;
-- service_role bypasses RLS. In particular, do not assume app.current_clerk_user_id
-- is populated or use this setting as an identity bridge.
DROP POLICY IF EXISTS users_select_own ON public.users;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngo_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ngo_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.users,
  public.volunteer_profiles,
  public.skills,
  public.volunteer_skills,
  public.certifications,
  public.availability,
  public.ngos,
  public.ngo_members,
  public.ngo_affiliations,
  public.events,
  public.event_requirements,
  public.shifts,
  public.applications
FROM anon, authenticated;

COMMENT ON TABLE public.volunteer_profiles IS 'Volunteer-owned profile. Precise home_geo must not be exposed directly to other users.';
COMMENT ON COLUMN public.ngos.contact IS 'Private by default. Do not expose arbitrary JSON contents through public profile APIs.';
COMMENT ON TABLE public.availability IS 'Recurring weekly windows and date-specific exceptions. Date-specific exceptions override recurring availability for that date.';
COMMENT ON TABLE public.applications IS 'Capacity is consumed only by accepted applications; other documented application statuses do not consume capacity.';
COMMENT ON TABLE public.users IS 'Backend-mediated identity and application authorization. RLS does not protect service-role queries.';
