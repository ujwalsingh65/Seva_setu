/**
 * Step 14 — Karma / Verified Community Impact API.
 *
 *   GET /api/v1/volunteers/me/karma
 *   GET /api/v1/volunteers/:volunteerId/karma   (self, or NGO staff with an
 *                                                operational tie via Step 9's
 *                                                canViewVolunteerReliability)
 *
 * Karma is derived from Step 9 participation evidence — volunteers and NGOs
 * can never edit it. No public leaderboard.
 */
import { Router } from 'express';
import { USER_ROLES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { databaseError, routeParam } from '../core/routes.js';
import { canViewVolunteerReliability } from '../reliability/routes.js';
import { calculateVolunteerKarma, type KarmaParticipationEvidence } from './karmaService.js';

const router = Router();

async function loadKarmaEvidence(volunteerId: string): Promise<KarmaParticipationEvidence[]> {
  const { data, error } = await supabaseAdmin
    .from('participations')
    .select('event_id, status, cancellation_source, participation_hours, event:events(start_at, event_type, title)')
    .eq('volunteer_id', volunteerId);
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => {
    const event = row.event as unknown as { start_at: string; event_type: string | null; title: string | null } | null;
    return {
      event_id: row.event_id,
      status: row.status,
      cancellation_source: row.cancellation_source,
      participation_hours: row.participation_hours as number | null,
      event_type: event?.event_type ?? null,
      event_start_at: event?.start_at ?? null,
      event_title: event?.title ?? null,
    };
  });
}

async function ngoStaffHasVolunteer(appUserId: string, volunteerId: string): Promise<boolean> {
  const { data: memberships, error } = await supabaseAdmin
    .from('ngo_members')
    .select('ngo_id')
    .eq('user_id', appUserId);
  if (error) throw databaseError(error);
  const ngoIds = (memberships ?? []).map((row) => row.ngo_id);
  if (ngoIds.length === 0) return false;
  const { data: events, error: eventsError } = await supabaseAdmin.from('events').select('id').in('ngo_id', ngoIds);
  if (eventsError) throw databaseError(eventsError);
  const eventIds = (events ?? []).map((row) => row.id);
  if (eventIds.length === 0) return false;
  const { data: applications, error: applicationsError } = await supabaseAdmin
    .from('applications')
    .select('id')
    .eq('volunteer_id', volunteerId)
    .in('event_id', eventIds)
    .limit(1);
  if (applicationsError) throw databaseError(applicationsError);
  return (applications ?? []).length > 0;
}

router.get('/volunteers/me/karma', requireAuth, async (req, res, next) => {
  try {
    if (req.auth!.appRole !== USER_ROLES.VOLUNTEER) {
      throw new AppError('Volunteer access required.', 403, 'FORBIDDEN');
    }
    const evidence = await loadKarmaEvidence(req.auth!.appUserId);
    res.json({ success: true, data: calculateVolunteerKarma(evidence) });
  } catch (error) {
    next(error);
  }
});

router.get('/volunteers/:volunteerId/karma', requireAuth, async (req, res, next) => {
  try {
    const volunteerId = routeParam(req, 'volunteerId');
    let ngoStaffHasVolunteerFlag = false;
    if (req.auth!.appUserId !== volunteerId) {
      if (req.auth!.appRole !== USER_ROLES.NGO_ADMIN && req.auth!.appRole !== USER_ROLES.NGO_COORDINATOR) {
        throw new AppError('You are not authorized to view this record.', 403, 'FORBIDDEN');
      }
      ngoStaffHasVolunteerFlag = await ngoStaffHasVolunteer(req.auth!.appUserId, volunteerId);
    }
    if (!canViewVolunteerReliability({ appUserId: req.auth!.appUserId, volunteerId, ngoStaffHasVolunteer: ngoStaffHasVolunteerFlag })) {
      throw new AppError('You are not authorized to view this record.', 403, 'FORBIDDEN');
    }
    const evidence = await loadKarmaEvidence(volunteerId);
    res.json({ success: true, data: calculateVolunteerKarma(evidence) });
  } catch (error) {
    next(error);
  }
});

export { router as karmaRouter };
