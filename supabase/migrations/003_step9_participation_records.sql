-- Step 9 — participation records for explainable reliability.
-- Attendance is operational history, not public data. Applications/roster
-- remain intent/assignment; this table records actual recorded outcomes.

CREATE TABLE public.participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('attended', 'late', 'no_show', 'cancelled')),
  -- Cancellation attribution: volunteer-cancelled events are evaluated,
  -- NGO/event/system cancellations must never penalize the volunteer.
  cancellation_source TEXT CHECK (cancellation_source IN ('volunteer', 'ngo', 'event', 'system')),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  participation_hours NUMERIC(6, 2) CHECK (participation_hours IS NULL OR participation_hours >= 0),
  recorded_by UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participations_event_volunteer_unique UNIQUE (event_id, volunteer_id),
  CONSTRAINT participations_cancellation_source_shape CHECK (
    (status = 'cancelled' AND cancellation_source IS NOT NULL)
    OR (status <> 'cancelled' AND cancellation_source IS NULL)
  ),
  CONSTRAINT participations_check_out_after_check_in CHECK (
    check_in_at IS NULL OR check_out_at IS NULL OR check_out_at > check_in_at
  )
);

CREATE INDEX idx_participations_event_id ON public.participations (event_id);
CREATE INDEX idx_participations_volunteer_id ON public.participations (volunteer_id);
CREATE INDEX idx_participations_status ON public.participations (status);

-- A participation outcome requires a real application trail for the same
-- event+volunteer. The route further restricts recording to volunteers who
-- were accepted (or cancelled an active application).
CREATE OR REPLACE FUNCTION public.enforce_participation_accepted_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.applications
    WHERE event_id = NEW.event_id
      AND volunteer_id = NEW.volunteer_id
      AND status IN ('accepted', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Participation requires an accepted (or cancelled after acceptance) application for the same event'
      USING ERRCODE = '23514', CONSTRAINT = 'participations_accepted_application_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER participations_accepted_application_check
  BEFORE INSERT OR UPDATE OF event_id, volunteer_id, status ON public.participations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_participation_accepted_application();

CREATE TRIGGER participations_updated_at
  BEFORE UPDATE ON public.participations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS stays defense-in-depth; the backend authorizes before service-role access.
ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.participations FROM anon, authenticated;

COMMENT ON TABLE public.participations IS 'Recorded participation outcomes per event+volunteer. Reliability is derived only from these rows; accepted applications or roster presence alone are never proof of attendance.';
COMMENT ON COLUMN public.participations.cancellation_source IS 'Who caused the cancellation. volunteer → counts against cancellation factor; ngo/event/system → excluded from volunteer scoring.';
