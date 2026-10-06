/**
 * Step 12 — Engagement & retention analytics API.
 *
 *   GET /api/v1/volunteers/me/engagement
 *   GET /api/v1/ngos/:ngoId/analytics/engagement
 *
 * Deterministic analytics over Step 9 participation records. No LLM, no
 * fabricated metrics. Volunteers see only their own record; NGO analytics
 * are restricted to the NGO's own events via the standard auth chain.
 */
import { Router } from 'express';
import { USER_ROLES } from '@sevasetu/constants';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, databaseError, routeParam } from '../core/routes.js';
import { buildNgoEngagement, buildVolunteerEngagement, type EngagementRecord } from './analyticsService.js';

const router = Router();

async function fetchVolunteerRows(volunteerIds: string[] | null, ngoId: string | null): Promise<EngagementRecord[]> {
  let eventIds: string[] | null = null;
  if (ngoId !== null) {
    const { data: events, error: eventsError } = await supabaseAdmin.from('events').select('id').eq('ngo_id', ngoId);
    if (eventsError) throw databaseError(eventsError);
    eventIds = (events ?? []).map((row) => row.id);
    if (eventIds.length === 0) return [];
  }

  let query = supabaseAdmin
    .from('participations')
    .select('volunteer_id, event_id, status, cancellation_source, participation_hours, event:events(start_at, event_type, title)');
  if (volunteerIds !== null) {
    if (volunteerIds.length === 0) return [];
    query = query.in('volunteer_id', volunteerIds);
  }
  if (eventIds !== null) query = query.in('event_id', eventIds);
  const { data, error } = await query;
  if (error) throw databaseError(error);

  return (data ?? []).map((row) => {
    const event = row.event as unknown as { start_at: string; event_type: string | null; title: string | null } | null;
    return {
      volunteer_id: row.volunteer_id,
      event_id: row.event_id,
      status: row.status,
      cancellation_source: row.cancellation_source,
      participation_hours: row.participation_hours as number | null,
      event_start_at: event?.start_at ?? '',
      event_type: event?.event_type ?? null,
      event_title: event?.title ?? null,
    };
  });
}

router.get('/volunteers/me/engagement', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const rows = await fetchVolunteerRows([req.auth!.appUserId], null);
    res.json({ success: true, data: buildVolunteerEngagement(req.auth!.appUserId, rows, Date.now()) });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/analytics/engagement', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const rows = await fetchVolunteerRows(null, ngoId);
    res.json({ success: true, data: buildNgoEngagement(rows, Date.now()) });
  } catch (error) {
    next(error);
  }
});

export { router as analyticsRouter };
