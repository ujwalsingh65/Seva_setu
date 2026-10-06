/**
 * Step 9 — Participation recording + explainable reliability API.
 *
 *   GET  /api/v1/volunteers/me/reliability
 *   GET  /api/v1/volunteers/me/participation
 *   GET  /api/v1/volunteers/:volunteerId/reliability   (self, or NGO staff with
 *                                                       an operational tie)
 *   GET  /api/v1/ngos/:ngoId/events/:eventId/participation
 *   PUT  /api/v1/ngos/:ngoId/events/:eventId/participation
 *
 * Authorization chain is identical to Steps 5-8: requireAuth → role check →
 * authorizeNgoMember → event ownership. The browser never talks to Supabase.
 * There is deliberately NO public reliability endpoint.
 */
import { Router } from 'express';
import { APPLICATION_STATUSES, USER_ROLES } from '@sevasetu/constants';
import { recordParticipationSchema } from '@sevasetu/validation';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import {
  authorizeNgoMember,
  badInput,
  databaseError,
  routeParam,
} from '../core/routes.js';
import { projectVolunteerInfo, VOLUNTEER_PUBLIC_COLUMNS } from '../core/volunteerInfo.js';
import { computeReliability } from './reliabilityService.js';
import type { ParticipationOutcomeLike } from './reliabilityService.js';

const router = Router();

const PARTICIPATION_COLUMNS =
  'id, event_id, volunteer_id, status, cancellation_source, check_in_at, check_out_at, participation_hours, recorded_by, created_at, updated_at';

// ---------------------------------------------------------------------------
// Pure authorization predicates (unit-tested in reliability.test.ts)
// ---------------------------------------------------------------------------

/** Volunteers may only read themselves; NGO staff only with an operational tie. */
export function canViewVolunteerReliability(input: {
  appUserId: string;
  volunteerId: string;
  ngoStaffHasVolunteer: boolean;
}): boolean {
  if (input.appUserId === input.volunteerId) return true;
  return input.ngoStaffHasVolunteer;
}

/** Only accepted (or volunteer-cancelled-after-acceptance) applications are recordable. */
export function isRecordableApplicationStatus(status: string): boolean {
  return status === APPLICATION_STATUSES.ACCEPTED || status === APPLICATION_STATUSES.CANCELLED;
}

// ---------------------------------------------------------------------------
// Volunteer self-service
// ---------------------------------------------------------------------------

async function fetchOutcomesForVolunteer(volunteerId: string) {
  const { data, error } = await supabaseAdmin
    .from('participations')
    .select('status, cancellation_source')
    .eq('volunteer_id', volunteerId);
  if (error) throw databaseError(error);
  return (data ?? []) as ParticipationOutcomeLike[];
}

router.get(
  '/volunteers/me/reliability',
  requireAuth,
  requireRole(USER_ROLES.VOLUNTEER),
  async (req, res, next) => {
    try {
      const outcomes = await fetchOutcomesForVolunteer(req.auth!.appUserId);
      res.json({ success: true, data: { volunteer_id: req.auth!.appUserId, ...computeReliability(outcomes) } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/volunteers/me/participation',
  requireAuth,
  requireRole(USER_ROLES.VOLUNTEER),
  async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('participations')
        .select(PARTICIPATION_COLUMNS)
        .eq('volunteer_id', req.auth!.appUserId)
        .order('created_at', { ascending: false });
      if (error) throw databaseError(error);
      res.json({ success: true, data: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/volunteers/:volunteerId/reliability', requireAuth, async (req, res, next) => {
  try {
    const volunteerId = routeParam(req, 'volunteerId');
    let ngoStaffHasVolunteer = false;
    if (req.auth!.appUserId !== volunteerId) {
      if (req.auth!.appRole !== USER_ROLES.NGO_ADMIN && req.auth!.appRole !== USER_ROLES.NGO_COORDINATOR) {
        throw new AppError('You are not authorized to view this reliability record.', 403, 'FORBIDDEN');
      }
      // Operational tie: the volunteer must have an application in one of the
      // requester's NGOs' events.
      const { data: memberships, error: memberError } = await supabaseAdmin
        .from('ngo_members')
        .select('ngo_id')
        .eq('user_id', req.auth!.appUserId);
      if (memberError) throw databaseError(memberError);
      const ngoIds = (memberships ?? []).map((row) => row.ngo_id);
      if (ngoIds.length > 0) {
        const { data: events, error: eventsError } = await supabaseAdmin
          .from('events')
          .select('id')
          .in('ngo_id', ngoIds);
        if (eventsError) throw databaseError(eventsError);
        const eventIds = (events ?? []).map((row) => row.id);
        if (eventIds.length > 0) {
          const { data: applications, error: applicationsError } = await supabaseAdmin
            .from('applications')
            .select('id')
            .eq('volunteer_id', volunteerId)
            .in('event_id', eventIds)
            .limit(1);
          if (applicationsError) throw databaseError(applicationsError);
          ngoStaffHasVolunteer = (applications ?? []).length > 0;
        }
      }
    }
    if (!canViewVolunteerReliability({ appUserId: req.auth!.appUserId, volunteerId, ngoStaffHasVolunteer })) {
      throw new AppError('You are not authorized to view this reliability record.', 403, 'FORBIDDEN');
    }
    const outcomes = await fetchOutcomesForVolunteer(volunteerId);
    res.json({ success: true, data: { volunteer_id: volunteerId, ...computeReliability(outcomes) } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// NGO event participation
// ---------------------------------------------------------------------------

router.get('/ngos/:ngoId/events/:eventId/participation', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .eq('ngo_id', ngoId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!event) throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');

    const { data: accepted, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select(`id, event_id, volunteer_id, status, created_at, updated_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', eventId)
      .in('status', [APPLICATION_STATUSES.ACCEPTED, APPLICATION_STATUSES.CANCELLED])
      .order('created_at', { ascending: true });
    if (acceptedError) throw databaseError(acceptedError);

    const { data: records, error: recordsError } = await supabaseAdmin
      .from('participations')
      .select(PARTICIPATION_COLUMNS)
      .eq('event_id', eventId);
    if (recordsError) throw databaseError(recordsError);
    const byVolunteer = new Map((records ?? []).map((row) => [row.volunteer_id, row]));

    res.json({
      success: true,
      data: {
        event,
        volunteers: (accepted ?? []).map((row) => ({
          ...row,
          volunteer: projectVolunteerInfo(row.volunteer),
          participation: byVolunteer.get(row.volunteer_id) ?? null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/ngos/:ngoId/events/:eventId/participation', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const parsed = recordParticipationSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, ngo_id, status')
      .eq('id', eventId)
      .eq('ngo_id', ngoId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!event) throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');

    // Every outcome must reference a volunteer whose application puts them in
    // this event's roster (accepted, or cancelled after being admitted).
    const volunteerIds = [...new Set(parsed.data.outcomes.map((outcome) => outcome.volunteer_id))];
    const { data: applications, error: applicationsError } = await supabaseAdmin
      .from('applications')
      .select('volunteer_id, status')
      .eq('event_id', eventId)
      .in('volunteer_id', volunteerIds);
    if (applicationsError) throw databaseError(applicationsError);
    const statusByVolunteer = new Map((applications ?? []).map((row) => [row.volunteer_id, row.status]));
    for (const volunteerId of volunteerIds) {
      const status = statusByVolunteer.get(volunteerId);
      if (!status || !isRecordableApplicationStatus(status)) {
        throw new AppError(
          'Participation can only be recorded for volunteers accepted into this event.',
          409,
          'VOLUNTEER_NOT_ELIGIBLE',
        );
      }
    }

    const rows = parsed.data.outcomes.map((outcome) => ({
      event_id: eventId,
      volunteer_id: outcome.volunteer_id,
      status: outcome.status,
      cancellation_source: outcome.status === 'cancelled' ? outcome.cancellation_source! : null,
      check_in_at: outcome.check_in_at ?? null,
      check_out_at: outcome.check_out_at ?? null,
      participation_hours: outcome.participation_hours ?? null,
      recorded_by: req.auth!.appUserId,
    }));

    const { data, error } = await supabaseAdmin
      .from('participations')
      .upsert(rows, { onConflict: 'event_id,volunteer_id' })
      .select(PARTICIPATION_COLUMNS);
    if (error) throw databaseError(error);
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    next(error);
  }
});

export { router as reliabilityRouter };
