/**
 * Step 10 — Automated Shift & Roster Generator API.
 *
 *   POST   /api/v1/ngos/:ngoId/events/:eventId/roster/generate
 *   GET    /api/v1/ngos/:ngoId/events/:eventId/schedule
 *   POST   /api/v1/ngos/:ngoId/events/:eventId/roster/confirm
 *   PATCH  /api/v1/ngos/:ngoId/events/:eventId/roster/assignments/:assignmentId
 *   DELETE /api/v1/ngos/:ngoId/events/:eventId/roster/assignments/:assignmentId
 *   GET    /api/v1/volunteers/me/schedule
 *
 * Draft lifecycle: generate creates/replaces DRAFT assignments only.
 * Confirmed assignments are never touched by regeneration. Confirmation
 * promotes drafts. Assignments integrate with Step 7's view-only roster
 * (accepted applications), Step 8 matching, and Step 9 reliability.
 */
import { Router } from 'express';
import { z } from 'zod';
import { APPLICATION_STATUSES, USER_ROLES, USER_STATUSES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, badInput, databaseError, routeParam } from '../core/routes.js';
import { VOLUNTEER_PUBLIC_COLUMNS, projectVolunteerInfo } from '../core/volunteerInfo.js';
import {
  candidateCoversShift,
  candidateHasRequiredCertifications,
  candidateHasRequiredSkills,
  intervalsOverlap,
  scheduleEvent,
  type SchedulingCandidate,
  type SchedulingShift,
} from './schedulingService.js';
import { zonedParts } from '../matching/matchingService.js';
import { summarizeReliabilityForMatching } from '../reliability/reliabilityService.js';

const router = Router();

const CANDIDATE_SELECT =
  'user_id, name, photo_url, bio, causes, home_geo, max_distance_km, users!inner(status), skills:volunteer_skills(skill_id), certifications(name, verification_status, expiry), availability(weekday, start_time, end_time, available_date, is_available)';

async function loadEventForNgo(ngoId: string, eventId: string) {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('id, ngo_id, title, geo, start_at, end_at, status')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!event || event.ngo_id !== ngoId) {
    throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');
  }
  return event;
}

async function loadRequirements(ngoEventId: string) {
  const { data, error } = await supabaseAdmin
    .from('event_requirements')
    .select('id, role, headcount, required_skill_ids, required_cert_names, min_experience')
    .eq('event_id', ngoEventId);
  if (error) throw databaseError(error);
  return data ?? [];
}

/** Shifts for the event; if none exist, materialize one full-event shift per requirement. */
async function ensureShifts(event: { id: string; start_at: string; end_at: string }, requirements: Array<{ id: string; role: string; headcount: number; required_skill_ids: string[]; required_cert_names: string[] }>) {
  const { data: existing, error } = await supabaseAdmin
    .from('shifts')
    .select('id, requirement_id, start_at, end_at, headcount')
    .eq('event_id', event.id);
  if (error) throw databaseError(error);
  if ((existing ?? []).length > 0) return existing!;

  if (requirements.length === 0) return [];
  const rows = requirements.map((requirement) => ({
    event_id: event.id,
    requirement_id: requirement.id,
    start_at: event.start_at,
    end_at: event.end_at,
    headcount: requirement.headcount,
  }));
  const { data: created, error: insertError } = await supabaseAdmin
    .from('shifts')
    .insert(rows)
    .select('id, requirement_id, start_at, end_at, headcount');
  if (insertError) throw databaseError(insertError);
  return created ?? [];
}

async function loadCandidates(eventId: string): Promise<SchedulingCandidate[]> {
  const { data: accepted, error: applicationsError } = await supabaseAdmin
    .from('applications')
    .select('volunteer_id')
    .eq('event_id', eventId)
    .eq('status', APPLICATION_STATUSES.ACCEPTED);
  if (applicationsError) throw databaseError(applicationsError);
  const volunteerIds = (accepted ?? []).map((row) => row.volunteer_id);
  if (volunteerIds.length === 0) return [];

  const { data: rows, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .select(CANDIDATE_SELECT)
    .in('user_id', volunteerIds)
    .eq('users.status', USER_STATUSES.ACTIVE);
  if (error) throw databaseError(error);
  const candidates = (rows ?? []) as Array<Omit<SchedulingCandidate, 'reliability'>>;

  // One batch query for Step 9 reliability summaries — no N+1.
  const { data: outcomes, error: outcomesError } = await supabaseAdmin
    .from('participations')
    .select('volunteer_id, status, cancellation_source')
    .in('volunteer_id', volunteerIds);
  if (outcomesError) throw databaseError(outcomesError);
  const grouped = new Map<string, Array<{ status: string; cancellation_source: string | null }>>();
  for (const row of outcomes ?? []) {
    const bucket = grouped.get(row.volunteer_id) ?? [];
    bucket.push({ status: row.status, cancellation_source: row.cancellation_source });
    grouped.set(row.volunteer_id, bucket);
  }
  return candidates.map((candidate) => ({
    ...candidate,
    reliability: summarizeReliabilityForMatching(grouped.get(candidate.user_id) ?? []),
  }));
}

async function loadBusyIntervals(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('roster_assignments')
    .select('volunteer_id, status, event_id, shift:shifts(start_at, end_at)')
    .in('status', ['draft', 'confirmed']);
  if (error) throw databaseError(error);
  const busy: Array<{ volunteer_id: string; start_at: string; end_at: string }> = [];
  for (const row of data ?? []) {
    // This event's drafts are about to be replaced; its confirmed rows stay.
    if (row.event_id === eventId && row.status === 'draft') continue;
    const shift = row.shift as unknown as { start_at: string; end_at: string } | null;
    if (shift) busy.push({ volunteer_id: row.volunteer_id, start_at: shift.start_at, end_at: shift.end_at });
  }
  return busy;
}

function toSchedulingShifts(
  shifts: Array<{ id: string; requirement_id: string; start_at: string; end_at: string; headcount: number }>,
  requirements: Array<{ id: string; role: string; required_skill_ids: string[]; required_cert_names: string[] }>,
): SchedulingShift[] {
  const requirementById = new Map(requirements.map((row) => [row.id, row]));
  const result: SchedulingShift[] = [];
  for (const shift of shifts) {
    const requirement = requirementById.get(shift.requirement_id);
    if (!requirement) continue;
    result.push({
      id: shift.id,
      requirement_id: shift.requirement_id,
      role: requirement.role,
      headcount: shift.headcount,
      start_at: shift.start_at,
      end_at: shift.end_at,
      required_skill_ids: requirement.required_skill_ids ?? [],
      required_cert_names: requirement.required_cert_names ?? [],
    });
  }
  return result;
}

router.post('/ngos/:ngoId/events/:eventId/roster/generate', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const event = await loadEventForNgo(ngoId, eventId);
    const requirements = await loadRequirements(eventId);
    if (requirements.length === 0) {
      throw new AppError('Event does not have scheduling requirements.', 409, 'NO_REQUIREMENTS');
    }
    const shifts = await ensureShifts(event, requirements);
    if (shifts.length === 0) {
      throw new AppError('No shifts could be derived for this event.', 409, 'NO_SHIFTS');
    }
    const schedulingShifts = toSchedulingShifts(shifts, requirements);
    const candidates = await loadCandidates(eventId);
    const busy = await loadBusyIntervals(eventId);

    const { data: skills, error: skillsError } = await supabaseAdmin
      .from('skills')
      .select('id, name')
      .eq('active', true);
    if (skillsError) throw databaseError(skillsError);
    const skillNames: Record<string, string> = {};
    for (const skill of skills ?? []) skillNames[skill.id] = skill.name;

    const result = scheduleEvent({
      eventId,
      eventStartAt: event.start_at,
      eventEndAt: event.end_at,
      eventGeo: event.geo,
      shifts: schedulingShifts,
      candidates,
      skillNames,
      busy,
    });

    // Idempotent regeneration: replace THIS event's drafts only. Confirmed
    // assignments are never deleted by an ordinary regeneration.
    const { error: deleteError } = await supabaseAdmin
      .from('roster_assignments')
      .delete()
      .eq('event_id', eventId)
      .eq('status', 'draft');
    if (deleteError) throw databaseError(deleteError);

    if (result.assignments.length > 0) {
      const rows = result.assignments.map((assignment) => ({
        event_id: eventId,
        shift_id: assignment.shift_id,
        volunteer_id: assignment.volunteer_id,
        status: 'draft' as const,
        explanation: assignment.explanation,
        created_by: req.auth!.appUserId,
      }));
      const { error: insertError } = await supabaseAdmin.from('roster_assignments').insert(rows);
      if (insertError) throw databaseError(insertError);
    }

    res.json({
      success: true,
      data: {
        event_id: eventId,
        generated: result.assignments.length,
        gaps: result.gaps,
        rejected_shifts: result.rejected_shifts,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/events/:eventId/schedule', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const event = await loadEventForNgo(ngoId, eventId);

    const requirements = await loadRequirements(eventId);
    const { data: shifts, error: shiftsError } = await supabaseAdmin
      .from('shifts')
      .select('id, requirement_id, start_at, end_at, headcount')
      .eq('event_id', eventId)
      .order('start_at', { ascending: true });
    if (shiftsError) throw databaseError(shiftsError);

    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('roster_assignments')
      .select(`id, event_id, shift_id, volunteer_id, status, explanation, created_at, updated_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', eventId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });
    if (assignmentsError) throw databaseError(assignmentsError);

    const requirementById = new Map(requirements.map((row) => [row.id, row]));
    const byShift = new Map<string, typeof assignments>();
    for (const assignment of assignments ?? []) {
      const bucket = byShift.get(assignment.shift_id) ?? [];
      bucket.push(assignment);
      byShift.set(assignment.shift_id, bucket);
    }

    res.json({
      success: true,
      data: {
        event: { id: event.id, title: event.title, start_at: event.start_at, end_at: event.end_at, status: event.status },
        shifts: (shifts ?? []).map((shift) => {
          const rows = byShift.get(shift.id) ?? [];
          return {
            id: shift.id,
            start_at: shift.start_at,
            end_at: shift.end_at,
            headcount: shift.headcount,
            role: requirementById.get(shift.requirement_id)?.role ?? null,
            assigned_count: rows.length,
            unfilled: Math.max(0, shift.headcount - rows.length),
            assignments: rows.map((row) => ({
              ...row,
              volunteer: projectVolunteerInfo(row.volunteer),
            })),
          };
        }),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ngos/:ngoId/events/:eventId/roster/confirm', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    await loadEventForNgo(ngoId, eventId);

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ status: 'confirmed' })
      .eq('event_id', eventId)
      .eq('status', 'draft')
      .select('id');
    if (error) throw databaseError(error);
    res.json({ success: true, data: { confirmed: (data ?? []).length } });
  } catch (error) {
    next(error);
  }
});

const assignmentPatchSchema = z
  .object({ volunteer_id: z.string().uuid() })
  .strict();

router.patch('/ngos/:ngoId/events/:eventId/roster/assignments/:assignmentId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    const assignmentId = routeParam(req, 'assignmentId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    await loadEventForNgo(ngoId, eventId);

    const parsed = assignmentPatchSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('roster_assignments')
      .select('id, event_id, shift_id, volunteer_id, status')
      .eq('id', assignmentId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (assignmentError) throw databaseError(assignmentError);
    if (!assignment || assignment.status === 'cancelled') {
      throw new AppError('Assignment not found.', 404, 'ASSIGNMENT_NOT_FOUND');
    }

    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('id, event_id, requirement_id, start_at, end_at')
      .eq('id', assignment.shift_id)
      .maybeSingle();
    if (shiftError) throw databaseError(shiftError);
    if (!shift) throw new AppError('Shift not found.', 404, 'SHIFT_NOT_FOUND');

    const requirements = await loadRequirements(eventId);
    const requirement = requirements.find((row) => row.id === shift.requirement_id);
    if (!requirement) throw new AppError('Scheduling requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');

    // The replacement volunteer must satisfy every hard scheduling gate.
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from('volunteer_profiles')
      .select(CANDIDATE_SELECT)
      .eq('user_id', parsed.data.volunteer_id)
      .limit(1);
    if (profileError) throw databaseError(profileError);
    if (!profileRows || profileRows.length === 0) {
      throw new AppError('Volunteer profile not found.', 404, 'VOLUNTEER_NOT_FOUND');
    }
    const candidate = profileRows[0] as Omit<SchedulingCandidate, 'reliability'>;

    const { data: acceptedRow, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select('id')
      .eq('event_id', eventId)
      .eq('volunteer_id', candidate.user_id)
      .eq('status', APPLICATION_STATUSES.ACCEPTED)
      .maybeSingle();
    if (acceptedError) throw databaseError(acceptedError);
    if (!acceptedRow) {
      throw new AppError('Volunteer is not accepted for this event.', 409, 'VOLUNTEER_NOT_ELIGIBLE');
    }

    if (!candidateHasRequiredSkills(candidate, requirement.required_skill_ids ?? [])) {
      throw new AppError('Volunteer lacks a required skill.', 409, 'SKILL_MISMATCH');
    }
    const shiftDate = zonedParts(shift.start_at).date;
    if (!candidateHasRequiredCertifications(candidate, requirement.required_cert_names ?? [], shiftDate)) {
      throw new AppError('Volunteer lacks a required verified certification.', 409, 'CERTIFICATION_MISMATCH');
    }
    if (!candidateCoversShift(
        candidate,
        {
          id: shift.id,
          requirement_id: shift.requirement_id,
          role: requirement.role,
          headcount: 1,
          start_at: shift.start_at,
          end_at: shift.end_at,
          required_skill_ids: requirement.required_skill_ids ?? [],
          required_cert_names: requirement.required_cert_names ?? [],
        },
      )
    ) {
      throw new AppError('Volunteer is unavailable during this shift.', 409, 'VOLUNTEER_UNAVAILABLE');
    }

    // Conflict = the new volunteer already has a non-cancelled assignment
    // overlapping this shift, excluding the row being edited.
    const { data: otherAssignments, error: otherError } = await supabaseAdmin
      .from('roster_assignments')
      .select('id, volunteer_id, status, shift:shifts(start_at, end_at)')
      .eq('volunteer_id', candidate.user_id)
      .in('status', ['draft', 'confirmed'])
      .neq('id', assignmentId);
    if (otherError) throw databaseError(otherError);
    const selfOverlap = (otherAssignments ?? []).some((row) => {
      const other = row.shift as unknown as { start_at: string; end_at: string } | null;
      return other && intervalsOverlap(other.start_at, other.end_at, shift.start_at, shift.end_at);
    });
    if (selfOverlap) {
      throw new AppError('Volunteer already has an overlapping assignment.', 409, 'ASSIGNMENT_CONFLICT');
    }

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ volunteer_id: candidate.user_id, explanation: 'Manually reassigned; eligibility re-validated.' })
      .eq('id', assignmentId)
      .eq('event_id', eventId)
      .select('id, event_id, shift_id, volunteer_id, status, explanation, created_at, updated_at')
      .single();
    if (error) throw databaseError(error);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/ngos/:ngoId/events/:eventId/roster/assignments/:assignmentId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    const assignmentId = routeParam(req, 'assignmentId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    await loadEventForNgo(ngoId, eventId);

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ status: 'cancelled' })
      .eq('id', assignmentId)
      .eq('event_id', eventId)
      .neq('status', 'cancelled')
      .select('id')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Assignment not found.', 404, 'ASSIGNMENT_NOT_FOUND');
    res.json({ success: true, data: { id: data.id, status: 'cancelled' } });
  } catch (error) {
    next(error);
  }
});

// Volunteers see their own assigned shifts (never other volunteers' details).
router.get('/volunteers/me/schedule', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('id, event_id, shift_id, status, shift:shifts(start_at, end_at, requirement_id)')
      .eq('volunteer_id', req.auth!.appUserId)
      .in('status', ['draft', 'confirmed']);
    if (error) throw databaseError(error);

    const eventIds = [...new Set((data ?? []).map((row) => row.event_id))];
    const requirementIds = [
      ...new Set(
        (data ?? [])
          .map((row) => (row.shift as unknown as { requirement_id: string } | null)?.requirement_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const events = eventIds.length
      ? await supabaseAdmin.from('events').select('id, title, venue, start_at, end_at').in('id', eventIds)
      : { data: [], error: null };
    if (events.error) throw databaseError(events.error);
    const requirements = requirementIds.length
      ? await supabaseAdmin.from('event_requirements').select('id, role').in('id', requirementIds)
      : { data: [], error: null };
    if (requirements.error) throw databaseError(requirements.error);
    const eventById = new Map((events.data ?? []).map((row) => [row.id, row]));
    const roleById = new Map((requirements.data ?? []).map((row) => [row.id, row.role]));

    const rows = (data ?? [])
      .map((row) => {
        const shift = row.shift as unknown as { start_at: string; end_at: string; requirement_id: string } | null;
        const event = eventById.get(row.event_id);
        if (!shift || !event) return null;
        return {
          assignment_id: row.id,
          status: row.status,
          role: roleById.get(shift.requirement_id) ?? null,
          shift_start: shift.start_at,
          shift_end: shift.end_at,
          event: { id: event.id, title: event.title, venue: event.venue, start_at: event.start_at, end_at: event.end_at },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => Date.parse(a.shift_start) - Date.parse(b.shift_start));

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

export { router as schedulingRouter };
