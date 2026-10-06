/**
 * Step 16 — Event Intelligence Agent endpoint.
 *
 *   POST /api/v1/ngos/:ngoId/events/:eventId/intelligence
 *
 * Security chain: requireAuth → authorizeNgoMember → event ownership.
 * The deterministic context is built first; the provider (LLM when
 * configured, else the rules provider) only explains facts. Structured
 * output is always validated. No autonomous actions are taken.
 */
import { Router } from 'express';
import { APPLICATION_STATUSES, USER_STATUSES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, databaseError, routeParam } from '../core/routes.js';
import {
  buildContextFingerprint,
  type EventIntelligenceContext,
} from './intelligenceService.js';
import { runIntelligenceAnalysis } from './intelligenceProvider.js';
import { buildIntelligenceTools } from './intelligenceTools.js';
import {
  candidateCoversShift,
  candidateHasRequiredCertifications,
  candidateHasRequiredSkills,
} from '../scheduling/schedulingService.js';

const router = Router();

const CANDIDATE_SELECT =
  'user_id, name, photo_url, bio, causes, home_geo, max_distance_km, users!inner(status), skills:volunteer_skills(skill_id), certifications(name, verification_status, expiry), availability(weekday, start_time, end_time, available_date, is_available)';

async function buildContext(ngoId: string, eventId: string): Promise<EventIntelligenceContext> {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('id, ngo_id, title, status, event_type, urgency, start_at, end_at, response_deadline')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!event || event.ngo_id !== ngoId) {
    throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');
  }

  const { data: requirements, error: reqError } = await supabaseAdmin
    .from('event_requirements')
    .select('id, role, headcount, required_skill_ids, required_cert_names')
    .eq('event_id', eventId);
  if (reqError) throw databaseError(reqError);

  const { data: shifts, error: shiftError } = await supabaseAdmin
    .from('shifts')
    .select('id, requirement_id, start_at, end_at, headcount')
    .eq('event_id', eventId);
  if (shiftError) throw databaseError(shiftError);

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from('roster_assignments')
    .select('id, volunteer_id, status, shift:shifts(start_at, end_at)')
    .eq('event_id', eventId)
    .in('status', ['draft', 'confirmed']);
  if (assignmentError) throw databaseError(assignmentError);

  const confirmedAssignments = (assignments ?? []).filter((row) => row.status === 'confirmed').length;

  // Conflict scan: a volunteer with another confirmed overlapping commitment.
  let schedulingConflicts = 0;
  if ((assignments ?? []).length > 0) {
    const volunteerIds = [...new Set((assignments ?? []).map((row) => row.volunteer_id))];
    const { data: others, error: othersError } = await supabaseAdmin
      .from('roster_assignments')
      .select('volunteer_id, event_id, shift:shifts(start_at, end_at)')
      .in('volunteer_id', volunteerIds)
      .eq('status', 'confirmed')
      .neq('event_id', eventId);
    if (othersError) throw databaseError(othersError);
    for (const row of assignments ?? []) {
      const shift = row.shift as unknown as { start_at: string; end_at: string } | null;
      if (!shift) continue;
      const overlapping = (others ?? []).some((other) => {
        const o = other.shift as unknown as { start_at: string; end_at: string } | null;
        return (
          other.volunteer_id === row.volunteer_id &&
          o !== null &&
          Date.parse(o.start_at) < Date.parse(shift.end_at) &&
          Date.parse(shift.start_at) < Date.parse(o.end_at)
        );
      });
      if (overlapping) schedulingConflicts += 1;
    }
  }

  // Emergency state (only when this is an emergency event).
  let emergency: EventIntelligenceContext['emergency'] = null;
  if (event.event_type === 'emergency') {
    const confirmed = confirmedAssignments;
    const { data: inv, error: invError } = await supabaseAdmin
      .from('emergency_invitations')
      .select('status')
      .eq('event_id', eventId);
    if (invError) throw databaseError(invError);
    const pending = (inv ?? []).filter((row) => row.status === 'pending').length;
    const { data: backupsRows, error: backupsError } = await supabaseAdmin
      .from('emergency_candidates')
      .select('id')
      .eq('event_id', eventId)
      .eq('bucket', 'backup');
    if (backupsError) throw databaseError(backupsError);
    const totalRequired = (requirements ?? []).reduce((sum, row) => sum + row.headcount, 0);
    emergency = {
      response_deadline: event.response_deadline,
      required: totalRequired,
      confirmed,
      pending,
      backups: (backupsRows ?? []).length,
      minutes_to_deadline: event.response_deadline
        ? Math.max(0, Math.round((Date.parse(event.response_deadline) - Date.now()) / 60000))
        : null,
    };
  }

  // Candidate pool for eligibility counts: accepted applicants (standard),
  // or all active visible volunteers (emergency).
  let poolIds: string[] | null = null;
  if (event.event_type !== 'emergency') {
    const { data: accepted, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select('volunteer_id')
      .eq('event_id', eventId)
      .eq('status', APPLICATION_STATUSES.ACCEPTED);
    if (acceptedError) throw databaseError(acceptedError);
    poolIds = (accepted ?? []).map((row) => row.volunteer_id);
  }

  let pool: Array<Record<string, unknown>> = [];
  {
    let query = supabaseAdmin.from('volunteer_profiles').select(CANDIDATE_SELECT).eq('users.status', USER_STATUSES.ACTIVE);
    if (poolIds !== null) {
      if (poolIds.length === 0) pool = [];
      else query = query.in('user_id', poolIds);
    } else {
      query = query.eq('profile_visibility', true);
    }
    const { data, error: poolError } = await query;
    if (poolError) throw databaseError(poolError);
    pool = (data ?? []) as Array<Record<string, unknown>>;
  }

  const requirementInsights = (requirements ?? []).map((requirement) => {
    let eligible = 0;
    let certified = 0;
    const shift = (shifts ?? []).find((row) => row.requirement_id === requirement.id);
    const shiftLike = shift
      ? { id: shift.id, requirement_id: requirement.id, role: requirement.role, headcount: shift.headcount, start_at: shift.start_at, end_at: shift.end_at, required_skill_ids: requirement.required_skill_ids ?? [], required_cert_names: requirement.required_cert_names ?? [] }
      : { id: 'event', requirement_id: requirement.id, role: requirement.role, headcount: requirement.headcount, start_at: event.start_at, end_at: event.end_at, required_skill_ids: requirement.required_skill_ids ?? [], required_cert_names: requirement.required_cert_names ?? [] };
    for (const candidate of pool) {
      const c = candidate as unknown as Parameters<typeof candidateHasRequiredSkills>[0];
      const skillsOk = candidateHasRequiredSkills(c, requirement.required_skill_ids ?? []);
      const certsOk = candidateHasRequiredCertifications(c, requirement.required_cert_names ?? [], event.start_at.slice(0, 10));
      const availableOk = candidateCoversShift(c, shiftLike);
      if (skillsOk && availableOk) {
        eligible += 1;
        if (certsOk) certified += 1;
      }
    }
    return {
      role: requirement.role,
      headcount: requirement.headcount,
      required_skills: (requirement.required_skill_ids ?? []).length,
      required_certifications: (requirement.required_cert_names ?? []).length,
      eligible_candidates: eligible,
      certified_candidates: certified,
      has_certification_requirement: (requirement.required_cert_names ?? []).length > 0,
    };
  });

  const requiredHeadcount = (requirements ?? []).reduce((sum, row) => sum + row.headcount, 0);
  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      event_type: event.event_type,
      urgency: event.urgency,
      start_at: event.start_at,
      end_at: event.end_at,
      response_deadline: event.response_deadline,
    },
    requirements_defined: (requirements ?? []).length > 0,
    shifts_defined: (shifts ?? []).length > 0,
    required_headcount: requiredHeadcount,
    confirmed_assignments: confirmedAssignments,
    pending_invitations: emergency?.pending ?? 0,
    unfilled_positions: Math.max(0, requiredHeadcount - confirmedAssignments),
    requirements: requirementInsights,
    scheduling_conflicts: schedulingConflicts,
    emergency,
  };
}

router.post('/ngos/:ngoId/events/:eventId/intelligence', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const context = await buildContext(ngoId, eventId);
    const tools = buildIntelligenceTools(ngoId, eventId);
    const analysis = await runIntelligenceAnalysis({ context, tools });
    res.json({ success: true, data: { provider: analysis.provider, fallback: analysis.fallback, tools_used: analysis.toolsUsed, ...analysis.result, context_summary: { confirmed: context.confirmed_assignments, required: context.required_headcount, unfilled: context.unfilled_positions, conflicts: context.scheduling_conflicts }, fingerprint: buildContextFingerprint(context) } });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/events/:eventId/intelligence/fingerprint', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const context = await buildContext(ngoId, eventId);
    res.json({ success: true, data: { fingerprint: buildContextFingerprint(context) } });
  } catch (error) {
    next(error);
  }
});

export { router as intelligenceRouter };
