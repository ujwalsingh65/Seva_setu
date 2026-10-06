-- Step 10 — roster assignments (draft/confirmed lifecycle).
-- `shifts` (Step 5) already models per-requirement time slots; this table
-- finally persists WHICH volunteers are assigned to WHICH shift.

CREATE TABLE public.roster_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts (id) ON DELETE RESTRICT,
  volunteer_id UUID NOT NULL REFERENCES public.volunteer_profiles (user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  explanation TEXT,
  created_by UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roster_assignments_shift_volunteer_unique UNIQUE (shift_id, volunteer_id)
);

CREATE INDEX idx_roster_assignments_event_id ON public.roster_assignments (event_id);
CREATE INDEX idx_roster_assignments_shift_id ON public.roster_assignments (shift_id);
CREATE INDEX idx_roster_assignments_volunteer_id ON public.roster_assignments (volunteer_id);
CREATE INDEX idx_roster_assignments_status ON public.roster_assignments (status);

-- An assignment's event must match its shift's event: the backend never
-- trusts browser-supplied ids, and this keeps rows internally consistent.
CREATE OR REPLACE FUNCTION public.enforce_assignment_event_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shift_event UUID;
BEGIN
  SELECT event_id INTO shift_event FROM public.shifts WHERE id = NEW.shift_id;
  IF shift_event IS NULL OR shift_event <> NEW.event_id THEN
    RAISE EXCEPTION 'Assignment event does not match the shift event'
      USING ERRCODE = '23514', CONSTRAINT = 'roster_assignments_event_match_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER roster_assignments_event_match_check
  BEFORE INSERT OR UPDATE OF event_id, shift_id ON public.roster_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignment_event_match();

CREATE TRIGGER roster_assignments_updated_at
  BEFORE UPDATE ON public.roster_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.roster_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roster_assignments FROM anon, authenticated;

COMMENT ON TABLE public.roster_assignments IS 'Generated + reviewed volunteer shift assignments. Drafts are replaced on regeneration; confirmed rows are never auto-deleted. Browsers never touch this table directly.';
