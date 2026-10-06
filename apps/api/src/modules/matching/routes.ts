/**
 * Step 8 — Explainable weighted matching API.
 *
 * GET /api/v1/ngos/:ngoId/events/:eventId/matches?limit=20
 *
 * Security chain (the backend is the boundary): requireAuth →
 * authorizeNgoMember (Step 7 helper) → event must belong to the requesting
 * NGO (else 404, indistinguishable from a missing event) → event must be
 * published (else 409, same rule as the application endpoint).
 *
 * Performance: exactly six Supabase queries per request (event,
 * requirements, skills, candidates, applications, participation outcomes) —
 * never one per volunteer. Scoring, filtering, and ranking happen in memory
 * via matchingService.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { EVENT_STATUSES, USER_STATUSES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, badInput, databaseError, routeParam } from '../core/routes.js';
import {
  computeMatch,
  filterEligibleCandidates,
  rankScoredMatches,
} from './matchingService.js';
import { summarizeReliabilityForMatching } from '../reliability/reliabilityService.js';
import type { ReliabilityMatchSummary } from '../reliability/reliabilityTypes.js';
import type {
  ApplicationStatusRow,
  EventMatchContext,
  SkillNameLookup,
  VolunteerCandidate,
} from './matchingTypes.js';

const router = Router();

export const DEFAULT_MATCH_LIMIT = 20;
export const MAX_MATCH_LIMIT = 50;

export const matchLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_MATCH_LIMIT)
  .default(DEFAULT_MATCH_LIMIT);

/**
 * Fails safely: an event that does not exist and an event that belongs to
 * another NGO are indistinguishable to the caller (404 EVENT_NOT_FOUND).
 * Matching is only offered for published events, mirroring the registration
 * rules the applications endpoint enforces.
 */
export function assertMatchingEvent<T extends { ngo_id: string; status: string }>(
  event: T | null | undefined,
  ngoId: string,
): asserts event is T {
  if (!event || event.ngo_id !== ngoId) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }
  if (event.status !== EVENT_STATUSES.PUBLISHED) {
    throw new AppError('This event is not open for matching.', 409, 'EVENT_NOT_OPEN');
  }
}

router.get('/ngos/:ngoId/events/:eventId/matches', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const parsedLimit = matchLimitSchema.safeParse(req.query.limit);
    if (!parsedLimit.success) throw badInput(parsedLimit.error);
    const limit = parsedLimit.data;

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, ngo_id, status, geo, start_at, end_at')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    assertMatchingEvent(event, ngoId);

    const { data: requirements, error: requirementsError } = await supabaseAdmin
      .from('event_requirements')
      .select('required_skill_ids, required_cert_names, min_experience')
      .eq('event_id', eventId);
    if (requirementsError) throw databaseError(requirementsError);

    const { data: skills, error: skillsError } = await supabaseAdmin
      .from('skills')
      .select('id, name')
      .eq('active', true);
    if (skillsError) throw databaseError(skillsError);
    const skillNames: SkillNameLookup = {};
    for (const skill of skills ?? []) skillNames[skill.id] = skill.name;

    // One candidate query for the whole platform: visible profiles joined to
    // active users, with skills/certifications/availability embedded. Relation
    // and column names match migration 002 verbatim. (Live-DB behavior is
    // PENDING verification like all Step 4–7 endpoints — no real credentials.)
    // The select string is a single literal ('+', not template, concatenation
    // widens to `string` and defeats supabase-js's type-level parser), and
    // `skills:` aliases the volunteer_skills relation so rows match the
    // VolunteerCandidate.skills field the matching service reads.
    const { data: candidateRows, error: candidatesError } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('user_id, name, photo_url, bio, causes, home_geo, max_distance_km, users!inner(status), skills:volunteer_skills(skill_id), certifications(name, verification_status, expiry), availability(weekday, start_time, end_time, available_date, is_available)')
      .eq('profile_visibility', true)
      .eq('users.status', USER_STATUSES.ACTIVE);
    if (candidatesError) throw databaseError(candidatesError);
    const candidates = (candidateRows ?? []) as VolunteerCandidate[];

    const { data: applications, error: applicationsError } = await supabaseAdmin
      .from('applications')
      .select('volunteer_id, status')
      .eq('event_id', eventId);
    if (applicationsError) throw databaseError(applicationsError);

    // Step 9: one batch query over all candidates' participation outcomes —
    // never one reliability query per candidate.
    const candidateIds = candidates.map((candidate) => candidate.user_id);
    const reliabilityByVolunteer = new Map<string, ReliabilityMatchSummary>();
    if (candidateIds.length > 0) {
      const { data: participationRows, error: participationError } = await supabaseAdmin
        .from('participations')
        .select('volunteer_id, status, cancellation_source')
        .in('volunteer_id', candidateIds);
      if (participationError) throw databaseError(participationError);
      const grouped = new Map<string, Array<{ status: string; cancellation_source: string | null }>>();
      for (const row of participationRows ?? []) {
        const bucket = grouped.get(row.volunteer_id) ?? [];
        bucket.push({ status: row.status, cancellation_source: row.cancellation_source });
        grouped.set(row.volunteer_id, bucket);
      }
      for (const [volunteerId, rows] of grouped) {
        reliabilityByVolunteer.set(volunteerId, summarizeReliabilityForMatching(rows));
      }
    }
    for (const candidate of candidates) {
      candidate.reliability = reliabilityByVolunteer.get(candidate.user_id) ?? null;
    }

    // Multiple requirement rows (per-role) are unioned: all required skills,
    // all required certifications, and the highest experience bar apply.
    const requirementRows = requirements ?? [];
    const context: EventMatchContext = {
      event_id: eventId,
      geo: event.geo ?? null,
      start_at: event.start_at,
      end_at: event.end_at,
      required_skill_ids: [...new Set(requirementRows.flatMap((row) => row.required_skill_ids ?? []))],
      required_cert_names: [...new Set(requirementRows.flatMap((row) => row.required_cert_names ?? []))],
      min_experience: Math.max(0, ...requirementRows.map((row) => row.min_experience ?? 0)),
    };

    const eligible = filterEligibleCandidates(candidates, (applications ?? []) as ApplicationStatusRow[]);
    const scored = eligible.map((candidate) => computeMatch(candidate, context, skillNames));
    const matches = rankScoredMatches(scored)
      .slice(0, limit)
      .map((entry) => entry.match);

    res.json({
      success: true,
      data: {
        event_id: eventId,
        total_candidates: eligible.length,
        matches,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as matchingRouter };
