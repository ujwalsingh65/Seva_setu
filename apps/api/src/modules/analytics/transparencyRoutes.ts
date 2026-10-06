/**
 * Step 15 — NGO Transparency & Activity Profile endpoint.
 *
 *   GET /api/v1/ngos/:ngoId/transparency
 *
 * Approved organization fields + evidence-backed aggregate activity derived
 * from Step 9 participation semantics. No trust score, no ratings, no raw
 * participation rows, no titles for non-public events.
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { databaseError, routeParam } from '../core/routes.js';
import { buildNgoTransparency, type TransparencyEvidence } from './transparencyService.js';

const router = Router();

router.get('/ngos/:ngoId/transparency', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const { data: ngo, error } = await supabaseAdmin
      .from('ngos')
      .select('id, name, description, causes, region, geo, logo_url, status, created_at, updated_at')
      .eq('id', ngoId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!ngo) {
      res.status(404).json({ success: false, error: { code: 'NGO_NOT_FOUND', message: 'NGO profile not found.' } });
      return;
    }

    const { data: events, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id, title, event_type, status, visibility, start_at')
      .eq('ngo_id', ngoId);
    if (eventsError) throw databaseError(eventsError);
    const eventIds = (events ?? []).map((row) => row.id);
    const eventById = new Map((events ?? []).map((row) => [row.id, row]));

    let evidence: TransparencyEvidence[] = [];
    if (eventIds.length > 0) {
      const { data: participations, error: participationError } = await supabaseAdmin
        .from('participations')
        .select('event_id, volunteer_id, status, cancellation_source, participation_hours')
        .in('event_id', eventIds);
      if (participationError) throw databaseError(participationError);
      evidence = (participations ?? []).map((row) => {
        const event = eventById.get(row.event_id);
        return {
          event_id: row.event_id,
          volunteer_id: row.volunteer_id,
          status: row.status,
          cancellation_source: row.cancellation_source,
          participation_hours: row.participation_hours as number | null,
          event_type: event?.event_type ?? null,
          event_status: event?.status ?? null,
          event_visibility: event?.visibility ?? null,
          event_title: event?.title ?? null,
          event_start_at: event?.start_at ?? null,
        };
      });
    }

    const transparency = buildNgoTransparency(evidence);
    res.json({
      success: true,
      data: {
        organization: ngo,
        transparency: {
          activity_source: transparency.activity_source,
          service_hours_status: transparency.service_hours_status,
          verification_note:
            'Activity figures are derived from verified SevaSetu participation records. Organization details are self-reported by the NGO and not independently verified by SevaSetu.',
        },
        activity: {
          completed_events: transparency.completed_events,
          verified_participations: transparency.verified_participations,
          unique_volunteers: transparency.unique_volunteers,
          verified_service_hours: transparency.verified_service_hours,
          emergency_events_supported: transparency.emergency_events_supported,
          returning_volunteers: transparency.returning_volunteers,
        },
        recent_events: transparency.recent_events,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as transparencyRouter };
