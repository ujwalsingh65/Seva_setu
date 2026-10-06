/**
 * Step 11 — Rapid Emergency Mobilization API.
 *
 *   POST   /api/v1/ngos/:ngoId/emergencies
 *   GET    /api/v1/ngos/:ngoId/emergencies
 *   GET    /api/v1/ngos/:ngoId/emergencies/:emergencyId
 *   POST   /api/v1/ngos/:ngoId/emergencies/:emergencyId/mobilize
 *   GET    /api/v1/ngos/:ngoId/emergencies/:emergencyId/mobilization
 *   POST   /api/v1/ngos/:ngoId/emergencies/:emergencyId/cancel
 *   GET    /api/v1/volunteers/me/emergency-invitations
 *   POST   /api/v1/volunteers/me/emergency-invitations/:invitationId/accept
 *   POST   /api/v1/volunteers/me/emergency-invitations/:invitationId/decline
 *   GET    /api/v1/notifications/me
 *
 * Delivery is in-app only — no SMS/email/push provider exists. Invitation
 * acceptance always revalidates hard constraints and capacity.
 */
import { Router } from 'express';
import { z } from 'zod';
import { EVENT_STATUSES, USER_ROLES, USER_STATUSES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, badInput, databaseError, pointToEwkt, routeParam } from '../core/routes.js';
import { VOLUNTEER_PUBLIC_COLUMNS, projectVolunteerInfo } from '../core/volunteerInfo.js';
import {
  computeEmergencyStaffingStatus,
  isValidInvitationTransition,
  rankEmergencyCandidates,
  selectNextBackup,
  splitPrimaryAndBackup,
} from './emergencyService.js';
import {
  candidateCoversShift,
  candidateHasRequiredCertifications,
  candidateHasRequiredSkills,
} from '../scheduling/schedulingService.js';
import type { SchedulingCandidate, SchedulingShift } from '../scheduling/schedulingService.js';
import { summarizeReliabilityForMatching } from '../reliability/reliabilityService.js';
import { zonedParts } from '../matching/matchingService.js';

const router = Router();

const CANDIDATE_SELECT =
  'user_id, name, photo_url, bio, causes, home_geo, max_distance_km, users!inner(status), skills:volunteer_skills(skill_id), certifications(name, verification_status, expiry), availability(weekday, start_time, end_time, available_date, is_available)';

const requirementInputSchema = z.object({
  role: z.string().min(2).max(80),
  headcount: z.number().int().positive().max(100),
  required_skill_ids: z.array(z.string().uuid()).default([]),
  required_cert_names: z.array(z.string()).default([]),
});

const createEmergencySchema = z.object({
  ngo_id: z.string().uuid(),
  title: z.string().min(3).max(150),
  description: z.string().min(10),
  cause: z.string().min(2).default('emergency'),
  venue: z.string().min(2),
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  response_deadline: z.string().datetime().optional(),
  max_distance_km: z.number().positive().max(9999).optional(),
  requirements: z.array(requirementInputSchema).min(1).max(20),
}).strict().refine((value) => Date.parse(value.start_at) < Date.parse(value.end_at), {
  message: 'Event end must be after event start',
  path: ['end_at'],
});

async function notify(userId: string, type: string, payload: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('notifications').insert({ user_id: userId, type, payload });
  if (error) throw databaseError(error);
}

async function loadEmergency(ngoId: string, eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!data || data.ngo_id !== ngoId || data.event_type !== 'emergency') {
    throw new AppError('Emergency not found for this NGO.', 404, 'EMERGENCY_NOT_FOUND');
  }
  return data;
}

async function loadRequirements(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('event_requirements')
    .select('id, role, headcount, required_skill_ids, required_cert_names, min_experience')
    .eq('event_id', eventId);
  if (error) throw databaseError(error);
  return data ?? [];
}

async function ensureEmergencyShifts(event: { id: string; start_at: string; end_at: string }, requirements: Array<{ id: string; role: string; headcount: number }>) {
  const { data: existing, error } = await supabaseAdmin
    .from('shifts')
    .select('id, requirement_id, start_at, end_at, headcount')
    .eq('event_id', event.id);
  if (error) throw databaseError(error);
  if ((existing ?? []).length > 0) return existing!;
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

async function loadAllCandidates() {
  const { data, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .select(CANDIDATE_SELECT)
    .eq('profile_visibility', true)
    .eq('users.status', USER_STATUSES.ACTIVE);
  if (error) throw databaseError(error);
  return (data ?? []) as Array<Omit<SchedulingCandidate, 'reliability'>>;
}

async function attachReliability(rows: Array<Omit<SchedulingCandidate, 'reliability'>>): Promise<SchedulingCandidate[]> {
  const ids = rows.map((row) => row.user_id);
  if (ids.length === 0) return [];
  const { data: outcomes, error } = await supabaseAdmin
    .from('participations')
    .select('volunteer_id, status, cancellation_source')
    .in('volunteer_id', ids);
  if (error) throw databaseError(error);
  const grouped = new Map<string, Array<{ status: string; cancellation_source: string | null }>>();
  for (const row of outcomes ?? []) {
    const bucket = grouped.get(row.volunteer_id) ?? [];
    bucket.push({ status: row.status, cancellation_source: row.cancellation_source });
    grouped.set(row.volunteer_id, bucket);
  }
  return rows.map((row) => ({ ...row, reliability: summarizeReliabilityForMatching(grouped.get(row.user_id) ?? []) }));
}

async function loadBusyIntervals() {
  const { data, error } = await supabaseAdmin
    .from('roster_assignments')
    .select('volunteer_id, status, shift:shifts(start_at, end_at)')
    .in('status', ['draft', 'confirmed']);
  if (error) throw databaseError(error);
  const busy: Array<{ volunteer_id: string; start_at: string; end_at: string }> = [];
  for (const row of data ?? []) {
    const shift = row.shift as unknown as { start_at: string; end_at: string } | null;
    if (shift) busy.push({ volunteer_id: row.volunteer_id, start_at: shift.start_at, end_at: shift.end_at });
  }
  return busy;
}

/** Lazily expire stale pending invitations; then promote the next backup for each. */
async function sweepExpiredInvitations(eventId: string) {
  const { data: expired, error } = await supabaseAdmin
    .from('emergency_invitations')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id, event_id, requirement_id, volunteer_id');
  if (error) throw databaseError(error);
  for (const row of expired ?? []) {
    await promoteBackup(eventId, row.requirement_id, row.id);
  }
  return expired ?? [];
}

async function promoteBackup(eventId: string, requirementId: string, replacementFor: string) {
  const { data: candidates, error } = await supabaseAdmin
    .from('emergency_candidates')
    .select('volunteer_id, bucket, rank')
    .eq('event_id', eventId)
    .eq('requirement_id', requirementId)
    .eq('bucket', 'backup')
    .order('rank', { ascending: true });
  if (error) throw databaseError(error);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('emergency_invitations')
    .select('volunteer_id')
    .eq('event_id', eventId);
  if (existingError) throw databaseError(existingError);
  const invited = new Set((existing ?? []).map((row) => row.volunteer_id));
  const next = selectNextBackup((candidates ?? []).map((row) => ({ volunteer_id: row.volunteer_id, invited: invited.has(row.volunteer_id) })));
  if (!next) return null;

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('response_deadline, start_at')
    .eq('id', eventId)
    .single();
  if (eventError) throw databaseError(eventError);
  const expiresAt = event.response_deadline ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from('emergency_invitations')
    .insert({
      event_id: eventId,
      requirement_id: requirementId,
      volunteer_id: next.volunteer_id,
      status: 'pending',
      expires_at: expiresAt,
      replacement_for: replacementFor,
    })
    .select('id, volunteer_id')
    .single();
  if (invitationError) throw databaseError(invitationError);
  await notify(next.volunteer_id, 'EMERGENCY_INVITATION', {
    event_id: eventId,
    invitation_id: invitation.id,
    message: 'You have been invited as a backup for an emergency operation.',
  });
  return invitation;
}

async function emergencyStaffing(eventId: string) {
  const requirements = await loadRequirements(eventId);
  const required = requirements.reduce((sum, row) => sum + row.headcount, 0);
  const { data: assignments, error } = await supabaseAdmin
    .from('roster_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed');
  if (error) throw databaseError(error);
  const confirmed = (assignments ?? []).length;
  const { data: invitationRows, error: invitationsError } = await supabaseAdmin
    .from('emergency_invitations')
    .select('status')
    .eq('event_id', eventId);
  if (invitationsError) throw databaseError(invitationsError);
  const pending = (invitationRows ?? []).filter((row) => row.status === 'pending').length;
  const { data: backupRows, error: backupError } = await supabaseAdmin
    .from('emergency_candidates')
    .select('id')
    .eq('event_id', eventId)
    .eq('bucket', 'backup');
  if (backupError) throw databaseError(backupError);
  return {
    required,
    confirmed,
    pending,
    backups: (backupRows ?? []).length,
    unfilled: Math.max(0, required - confirmed),
    staffing_status: computeEmergencyStaffingStatus(required, confirmed),
  };
}

// ---------------------------------------------------------------------------
// NGO endpoints
// ---------------------------------------------------------------------------

router.post('/ngos/:ngoId/emergencies', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const parsed = createEmergencySchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    if (parsed.data.ngo_id !== ngoId) {
      throw new AppError('Emergency NGO does not match the authorized NGO.', 403, 'FORBIDDEN');
    }

    const totalCapacity = parsed.data.requirements.reduce((sum, row) => sum + row.headcount, 0);
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert({
        ngo_id: ngoId,
        title: parsed.data.title,
        description: parsed.data.description,
        cause: parsed.data.cause,
        venue: parsed.data.venue,
        geo: pointToEwkt(parsed.data.geo),
        start_at: parsed.data.start_at,
        end_at: parsed.data.end_at,
        visibility: 'ngo_only',
        capacity: totalCapacity,
        status: EVENT_STATUSES.PUBLISHED,
        registration_mode: 'approval_required',
        created_by: req.auth!.appUserId,
        event_type: 'emergency',
        urgency: parsed.data.urgency,
        response_deadline: parsed.data.response_deadline ?? null,
        max_distance_km: parsed.data.max_distance_km ?? null,
      })
      .select('id')
      .single();
    if (error) throw databaseError(error);

    const requirementRows = parsed.data.requirements.map((row) => ({
      event_id: event.id,
      role: row.role,
      headcount: row.headcount,
      required_skill_ids: row.required_skill_ids,
      required_cert_names: row.required_cert_names,
      min_experience: 0,
    }));
    const { error: reqError } = await supabaseAdmin.from('event_requirements').insert(requirementRows);
    if (reqError) throw databaseError(reqError);

    res.status(201).json({ success: true, data: { id: event.id, required: totalCapacity } });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/emergencies', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('id, title, venue, start_at, end_at, urgency, response_deadline, status, created_at')
      .eq('ngo_id', ngoId)
      .eq('event_type', 'emergency')
      .order('created_at', { ascending: false });
    if (error) throw databaseError(error);
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/emergencies/:emergencyId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const emergencyId = routeParam(req, 'emergencyId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const event = await loadEmergency(ngoId, emergencyId);
    await sweepExpiredInvitations(emergencyId);
    const staffing = await emergencyStaffing(emergencyId);
    res.json({ success: true, data: { emergency: event, staffing } });
  } catch (error) {
    next(error);
  }
});

router.post('/ngos/:ngoId/emergencies/:emergencyId/mobilize', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const emergencyId = routeParam(req, 'emergencyId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const event = await loadEmergency(ngoId, emergencyId);
    if (event.status !== EVENT_STATUSES.PUBLISHED) {
      throw new AppError('This emergency is not open for mobilization.', 409, 'EMERGENCY_NOT_OPEN');
    }
    await sweepExpiredInvitations(emergencyId);

    const requirements = await loadRequirements(emergencyId);
    if (requirements.length === 0) {
      throw new AppError('Emergency has no staffing requirements.', 409, 'NO_REQUIREMENTS');
    }
    const shifts = await ensureEmergencyShifts(event, requirements);
    const candidates = await attachReliability(await loadAllCandidates());
    const busy = await loadBusyIntervals();
    const shiftByRequirement = new Map(shifts.map((shift) => [shift.requirement_id, shift]));

    const { data: skills, error: skillsError } = await supabaseAdmin.from('skills').select('id, name').eq('active', true);
    if (skillsError) throw databaseError(skillsError);
    const skillNames: Record<string, string> = {};
    for (const skill of skills ?? []) skillNames[skill.id] = skill.name;

    // Idempotent: rebuild the ranked pool; never duplicate invitations.
    await supabaseAdmin.from('emergency_candidates').delete().eq('event_id', emergencyId);
    await supabaseAdmin
      .from('emergency_invitations')
      .delete()
      .eq('event_id', emergencyId)
      .eq('status', 'pending');

    const candidateRows: Array<{ event_id: string; volunteer_id: string; requirement_id: string; bucket: 'primary' | 'backup'; rank: number; match_score: number; explanation: string }> = [];
    const invitations: Array<{ event_id: string; requirement_id: string; volunteer_id: string; status: 'pending'; expires_at: string }> = [];
    const expiresAt = event.response_deadline ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();

    for (const requirement of requirements) {
      const shift = shiftByRequirement.get(requirement.id);
      if (!shift) continue;
      const schedulingShift: SchedulingShift = {
        id: shift.id,
        requirement_id: requirement.id,
        role: requirement.role,
        headcount: shift.headcount,
        start_at: shift.start_at,
        end_at: shift.end_at,
        required_skill_ids: requirement.required_skill_ids ?? [],
        required_cert_names: requirement.required_cert_names ?? [],
      };
      const ranked = rankEmergencyCandidates({
        shift: schedulingShift,
        candidates,
        busy,
        shiftDate: zonedParts(shift.start_at).date,
        maxDistanceKm: event.max_distance_km ?? null,
        eventGeo: event.geo,
        eventStartAt: event.start_at,
        eventEndAt: event.end_at,
        eventId: emergencyId,
        skillNames,
      });
      const { primary, backup } = splitPrimaryAndBackup(ranked, requirement.headcount, Math.min(3, requirement.headcount));
      primary.forEach((entry, index) => {
        candidateRows.push({
          event_id: emergencyId,
          volunteer_id: entry.volunteer_id,
          requirement_id: requirement.id,
          bucket: 'primary',
          rank: index + 1,
          match_score: entry.match_score,
          explanation: entry.explanation,
        });
        invitations.push({
          event_id: emergencyId,
          requirement_id: requirement.id,
          volunteer_id: entry.volunteer_id,
          status: 'pending',
          expires_at: expiresAt,
        });
      });
      backup.forEach((entry, index) => {
        candidateRows.push({
          event_id: emergencyId,
          volunteer_id: entry.volunteer_id,
          requirement_id: requirement.id,
          bucket: 'backup',
          rank: index + 1,
          match_score: entry.match_score,
          explanation: entry.explanation,
        });
      });
    }

    if (candidateRows.length === 0) {
      throw new AppError('No eligible volunteers found for this emergency.', 409, 'NO_ELIGIBLE_VOLUNTEERS');
    }

    const { error: candidateError } = await supabaseAdmin.from('emergency_candidates').insert(candidateRows);
    if (candidateError) throw databaseError(candidateError);

    if (invitations.length > 0) {
      const { error: invitationError } = await supabaseAdmin.from('emergency_invitations').insert(invitations);
      if (invitationError) throw databaseError(invitationError);
      for (const invitation of invitations) {
        await notify(invitation.volunteer_id, 'EMERGENCY_INVITATION', {
          event_id: emergencyId,
          message: `Emergency mobilization: ${event.title} (respond by ${expiresAt}).`,
        });
      }
    }

    res.json({
      success: true,
      data: {
        event_id: emergencyId,
        primary_invitations: invitations.length,
        backups: candidateRows.filter((row) => row.bucket === 'backup').length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/emergencies/:emergencyId/mobilization', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const emergencyId = routeParam(req, 'emergencyId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    await loadEmergency(ngoId, emergencyId);
    await sweepExpiredInvitations(emergencyId);

    const { data: invitations, error } = await supabaseAdmin
      .from('emergency_invitations')
      .select(`id, requirement_id, volunteer_id, status, invited_at, expires_at, responded_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', emergencyId)
      .order('invited_at', { ascending: true });
    if (error) throw databaseError(error);
    const { data: backups, error: backupError } = await supabaseAdmin
      .from('emergency_candidates')
      .select(`id, requirement_id, volunteer_id, rank, match_score, explanation, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', emergencyId)
      .eq('bucket', 'backup')
      .order('rank', { ascending: true });
    if (backupError) throw databaseError(backupError);

    res.json({
      success: true,
      data: {
        invitations: (invitations ?? []).map((row) => ({ ...row, volunteer: projectVolunteerInfo(row.volunteer) })),
        backups: (backups ?? []).map((row) => ({ ...row, volunteer: projectVolunteerInfo(row.volunteer) })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ngos/:ngoId/emergencies/:emergencyId/cancel', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const emergencyId = routeParam(req, 'emergencyId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    await loadEmergency(ngoId, emergencyId);

    await supabaseAdmin
      .from('events')
      .update({ status: EVENT_STATUSES.CANCELLED })
      .eq('id', emergencyId);
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from('emergency_invitations')
      .update({ status: 'cancelled' })
      .eq('event_id', emergencyId)
      .eq('status', 'pending')
      .select('volunteer_id');
    if (pendingError) throw databaseError(pendingError);
    const { error: assignmentError } = await supabaseAdmin
      .from('roster_assignments')
      .update({ status: 'cancelled' })
      .eq('event_id', emergencyId)
      .in('status', ['draft', 'confirmed']);
    if (assignmentError) throw databaseError(assignmentError);
    for (const row of pending ?? []) {
      await notify(row.volunteer_id, 'EMERGENCY_CANCELLED', { event_id: emergencyId });
    }
    res.json({ success: true, data: { id: emergencyId, status: 'cancelled' } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Volunteer + notification endpoints
// ---------------------------------------------------------------------------

router.get('/volunteers/me/emergency-invitations', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data: expiredSweep, error: sweepError } = await supabaseAdmin
      .from('emergency_invitations')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('volunteer_id', req.auth!.appUserId)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('event_id, requirement_id, id');
    if (sweepError) throw databaseError(sweepError);
    for (const row of expiredSweep ?? []) {
      await promoteBackup(row.event_id, row.requirement_id, row.id);
    }

    const { data, error } = await supabaseAdmin
      .from('emergency_invitations')
      .select('id, event_id, requirement_id, status, invited_at, expires_at, responded_at')
      .eq('volunteer_id', req.auth!.appUserId)
      .order('invited_at', { ascending: false });
    if (error) throw databaseError(error);

    const eventIds = [...new Set((data ?? []).map((row) => row.event_id))];
    const requirementIds = [...new Set((data ?? []).map((row) => row.requirement_id))];
    const events = eventIds.length
      ? await supabaseAdmin.from('events').select('id, title, venue, start_at, end_at, urgency, ngo_id').in('id', eventIds)
      : { data: [], error: null };
    if (events.error) throw databaseError(events.error);
    const requirements = requirementIds.length
      ? await supabaseAdmin.from('event_requirements').select('id, role').in('id', requirementIds)
      : { data: [], error: null };
    if (requirements.error) throw databaseError(requirements.error);
    const eventById = new Map((events.data ?? []).map((row) => [row.id, row]));
    const roleById = new Map((requirements.data ?? []).map((row) => [row.id, row.role]));

    res.json({
      success: true,
      data: (data ?? []).map((row) => ({
        ...row,
        role: roleById.get(row.requirement_id) ?? null,
        emergency: eventById.get(row.event_id) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/volunteers/me/emergency-invitations/:invitationId/accept', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const invitationId = routeParam(req, 'invitationId');
    const { data: invitation, error } = await supabaseAdmin
      .from('emergency_invitations')
      .select('id, event_id, requirement_id, volunteer_id, status, expires_at')
      .eq('id', invitationId)
      .eq('volunteer_id', req.auth!.appUserId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!invitation) throw new AppError('Invitation not found.', 404, 'INVITATION_NOT_FOUND');

    if (invitation.status === 'pending' && Date.parse(invitation.expires_at) < Date.now()) {
      await supabaseAdmin.from('emergency_invitations').update({ status: 'expired' }).eq('id', invitationId);
      await promoteBackup(invitation.event_id, invitation.requirement_id, invitationId);
      throw new AppError('This invitation has expired.', 409, 'INVITATION_EXPIRED');
    }
    if (!isValidInvitationTransition(invitation.status as never, 'accepted')) {
      throw new AppError('This invitation can no longer be accepted.', 409, 'INVITATION_NOT_ACTIONABLE');
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, ngo_id, title, start_at, end_at, geo, status, event_type, max_distance_km')
      .eq('id', invitation.event_id)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!eventRow || eventRow.event_type !== 'emergency') {
      throw new AppError('Emergency not found.', 404, 'EMERGENCY_NOT_FOUND');
    }
    if (eventRow.status === EVENT_STATUSES.CANCELLED || eventRow.status === EVENT_STATUSES.COMPLETED) {
      throw new AppError('This emergency is no longer active.', 409, 'EMERGENCY_CLOSED');
    }

    const requirements = await loadRequirements(invitation.event_id);
    const requirement = requirements.find((row) => row.id === invitation.requirement_id);
    if (!requirement) throw new AppError('Requirement not found.', 404, 'REQUIREMENT_NOT_FOUND');

    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from('volunteer_profiles')
      .select(CANDIDATE_SELECT)
      .eq('user_id', req.auth!.appUserId)
      .limit(1);
    if (profileError) throw databaseError(profileError);
    if (!profileRows || profileRows.length === 0) {
      throw new AppError('Create a volunteer profile before responding.', 403, 'PROFILE_REQUIRED');
    }
    const candidate = profileRows[0] as Omit<SchedulingCandidate, 'reliability'>;
    const shift = (await ensureEmergencyShifts(eventRow, requirements)).find((row) => row.requirement_id === requirement.id);
    if (!shift) throw new AppError('Shift unavailable for this requirement.', 409, 'SHIFT_UNAVAILABLE');

    const schedulingShift: SchedulingShift = {
      id: shift.id,
      requirement_id: requirement.id,
      role: requirement.role,
      headcount: shift.headcount,
      start_at: shift.start_at,
      end_at: shift.end_at,
      required_skill_ids: requirement.required_skill_ids ?? [],
      required_cert_names: requirement.required_cert_names ?? [],
    };

    // Revalidate hard constraints NOW — eligibility is not permanent.
    if (!candidateHasRequiredSkills(candidate, schedulingShift.required_skill_ids)) {
      throw new AppError('You no longer meet the required skills.', 409, 'SKILL_MISMATCH');
    }
    if (!candidateHasRequiredCertifications(candidate, schedulingShift.required_cert_names, zonedParts(shift.start_at).date)) {
      throw new AppError('You no longer hold the required verified certification.', 409, 'CERTIFICATION_MISMATCH');
    }
    if (!candidateCoversShift(candidate, schedulingShift)) {
      throw new AppError('You are not available during this emergency window.', 409, 'VOLUNTEER_UNAVAILABLE');
    }

    const { data: busyRows, error: busyError } = await supabaseAdmin
      .from('roster_assignments')
      .select('volunteer_id, status, shift:shifts(start_at, end_at)')
      .eq('volunteer_id', req.auth!.appUserId)
      .in('status', ['draft', 'confirmed']);
    if (busyError) throw databaseError(busyError);
    const hasConflict = (busyRows ?? []).some((row) => {
      const other = row.shift as unknown as { start_at: string; end_at: string } | null;
      return other && Date.parse(other.start_at) < Date.parse(shift.end_at) && Date.parse(shift.start_at) < Date.parse(other.end_at);
    });
    if (hasConflict) {
      throw new AppError('You now have a conflicting confirmed assignment.', 409, 'ASSIGNMENT_CONFLICT');
    }

    const { error: assignmentError } = await supabaseAdmin.from('roster_assignments').insert({
      event_id: invitation.event_id,
      shift_id: shift.id,
      volunteer_id: req.auth!.appUserId,
      status: 'confirmed',
      explanation: 'Emergency invitation accepted.',
      created_by: req.auth!.appUserId,
    });
    if (assignmentError) throw databaseError(assignmentError); // capacity trigger → SHIFT_CAPACITY_REACHED

    const { error: updateError } = await supabaseAdmin
      .from('emergency_invitations')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('status', 'pending');
    if (updateError) throw databaseError(updateError);

    res.json({ success: true, data: { invitation_id: invitationId, status: 'accepted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/volunteers/me/emergency-invitations/:invitationId/decline', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const invitationId = routeParam(req, 'invitationId');
    const { data: invitation, error } = await supabaseAdmin
      .from('emergency_invitations')
      .select('id, event_id, requirement_id, volunteer_id, status')
      .eq('id', invitationId)
      .eq('volunteer_id', req.auth!.appUserId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!invitation) throw new AppError('Invitation not found.', 404, 'INVITATION_NOT_FOUND');
    if (!isValidInvitationTransition(invitation.status as never, 'declined')) {
      throw new AppError('This invitation can no longer be declined.', 409, 'INVITATION_NOT_ACTIONABLE');
    }

    await supabaseAdmin
      .from('emergency_invitations')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', invitationId);
    await promoteBackup(invitation.event_id, invitation.requirement_id, invitationId);
    res.json({ success: true, data: { invitation_id: invitationId, status: 'declined' } });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id, type, payload, created_at, read_at')
      .eq('user_id', req.auth!.appUserId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw databaseError(error);
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    next(error);
  }
});

export { router as emergencyRouter };
