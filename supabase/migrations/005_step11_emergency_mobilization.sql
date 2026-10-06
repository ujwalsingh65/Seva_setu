-- Step 11 — rapid emergency mobilization.
-- Emergencies are events (type='emergency') so they reuse Step 5–10
-- requirements/shifts/roster_assignments/participation. New tables cover
-- only what did not exist: ranked candidates, invitations, notifications.

ALTER TABLE public.events
  ADD COLUMN event_type TEXT NOT NULL DEFAULT 'standard' CHECK (event_type IN ('standard', 'emergency')),
  ADD COLUMN urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN response_deadline TIMESTAMPTZ,
  ADD COLUMN max_distance_km NUMERIC(6, 2);

CREATE INDEX idx_events_event_type ON public.events (event_type);

-- One ranked candidate row per volunteer per emergency (at most one bucket).
CREATE TABLE public.emergency_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL REFERENCES public.event_requirements (id) ON DELETE RESTRICT,
  bucket TEXT NOT NULL CHECK (bucket IN ('primary', 'backup')),
  rank INTEGER NOT NULL CHECK (rank > 0),
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT emergency_candidates_event_volunteer_unique UNIQUE (event_id, volunteer_id)
);

CREATE INDEX idx_emergency_candidates_event_id ON public.emergency_candidates (event_id);

-- Invitation lifecycle. One invitation per volunteer per emergency.
CREATE TABLE public.emergency_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL REFERENCES public.event_requirements (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  replacement_for UUID REFERENCES public.emergency_invitations (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT emergency_invitations_event_volunteer_unique UNIQUE (event_id, volunteer_id)
);

CREATE INDEX idx_emergency_invitations_event_id ON public.emergency_invitations (event_id);
CREATE INDEX idx_emergency_invitations_volunteer_id ON public.emergency_invitations (volunteer_id);
CREATE INDEX idx_emergency_invitations_status ON public.emergency_invitations (status);

CREATE TRIGGER emergency_invitations_updated_at
  BEFORE UPDATE ON public.emergency_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- In-app notification records (no external provider is configured; delivery is in-app only).
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

-- Capacity enforcement for ANY assignment insert/update (including emergencies):
-- a shift can never hold more non-cancelled assignments than its headcount.
-- The shifts row lock serializes concurrent accepts for the same shift.
CREATE OR REPLACE FUNCTION public.enforce_shift_assignment_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shift_headcount INTEGER;
  current_count BIGINT;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT headcount INTO shift_headcount
  FROM public.shifts
  WHERE id = NEW.shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count
  FROM public.roster_assignments
  WHERE shift_id = NEW.shift_id
    AND status <> 'cancelled'
    AND id IS DISTINCT FROM NEW.id;

  IF current_count >= shift_headcount THEN
    RAISE EXCEPTION 'Shift capacity reached'
      USING ERRCODE = '23514', CONSTRAINT = 'roster_assignments_capacity_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER roster_assignments_capacity_check
  BEFORE INSERT OR UPDATE OF shift_id, status ON public.roster_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_shift_assignment_capacity();

ALTER TABLE public.emergency_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.emergency_candidates FROM anon, authenticated;
REVOKE ALL ON TABLE public.emergency_invitations FROM anon, authenticated;
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;

COMMENT ON TABLE public.emergency_candidates IS 'Deterministic ranked mobilization pool per emergency; backups are promoted only after a primary declines/expires.';
COMMENT ON TABLE public.emergency_invitations IS 'Emergency invitation lifecycle (pending → accepted/declined/expired/cancelled). Acceptance revalidates capacity + eligibility.';
COMMENT ON TABLE public.notifications IS 'In-app notifications only; no SMS/push/email provider is configured in this deployment.';
