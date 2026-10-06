/**
 * Explainable weighted matching service (Step 8).
 *
 * ALGORITHM — deterministic, transparent, no ML, no LLM:
 *   1. Six factors are scored 0-100 against the event's requirements:
 *      skills, certifications, availability, experience, proximity, reliability.
 *   2. Each factor reports its configured weight (points) and a status:
 *      'full' | 'partial' | 'none' | 'not_assessable'.
 *   3. Factors that cannot be assessed from real data (experience and
 *      reliability in v1 — no schema support yet; proximity/availability when
 *      the inputs are missing) are EXCLUDED from the volunteer's total, which
 *      is renormalized over the assessable factors only. Nothing is ever
 *      fabricated to fill a gap.
 *   4. Ranking is deterministic: score desc, reliability desc, smaller
 *      distance, then volunteer_id asc.
 *
 * PRIVACY: results carry only the Step 7 volunteer whitelist
 * (id/name/photo_url/bio/causes). Distances and coordinates stay internal
 * (ScoredMatch.tieBreak) and are never serialized.
 *
 * MISSING DATA (documented fallbacks):
 *   - experience: 'not_assessable' — event_requirements.min_experience has no
 *     volunteer-side numeric counterpart (volunteer_skills.level is free text).
 *   - reliability: 'not_assessable' — no attendance/history table exists yet.
 *   - proximity: 'not_assessable' when either home or event geo is missing.
 *   - availability: 'not_assessable' when the volunteer has no availability
 *     rows, or only unrelated date exceptions (no weekly pattern on file).
 */
import { APPLICATION_STATUSES } from '@sevasetu/constants';
import {
  DEFAULT_MATCHING_WEIGHTS,
  NEARBY_DISTANCE_KM,
  PLATFORM_TIMEZONE,
  type MatchingWeights,
} from '@sevasetu/matching-config';
import type {
  ApplicationStatusRow,
  CandidateAvailabilityRow,
  CandidateCertificationRow,
  EventMatchContext,
  ListFactor,
  MatchFactors,
  MatchResult,
  ScoredMatch,
  SkillCertFactor,
  SkillNameLookup,
  VolunteerCandidate,
} from './matchingTypes.js';

const EARTH_RADIUS_KM = 6371;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function scoreSkills(
  volunteerSkillIds: string[],
  requiredSkillIds: string[],
  skillNames: SkillNameLookup,
  weight: number = DEFAULT_MATCHING_WEIGHTS.skills,
): SkillCertFactor {
  if (requiredSkillIds.length === 0) {
    // No requirements = neutral/full per the event's own semantics.
    return { score: 100, weight, status: 'full', matched: [], missing: [] };
  }
  const owned = new Set(volunteerSkillIds);
  const matchedIds = requiredSkillIds.filter((id) => owned.has(id));
  const missingIds = requiredSkillIds.filter((id) => !owned.has(id));
  const nameOf = (id: string) => skillNames[id] ?? id;
  return {
    score: Math.round((matchedIds.length / requiredSkillIds.length) * 100),
    weight,
    status:
      matchedIds.length === requiredSkillIds.length ? 'full' : matchedIds.length === 0 ? 'none' : 'partial',
    matched: matchedIds.map(nameOf).sort(),
    missing: missingIds.map(nameOf).sort(),
  };
}

// ---------------------------------------------------------------------------
// Certifications — only ngo_verified and unexpired certifications ever count.
// ---------------------------------------------------------------------------

function certificationSatisfies(
  cert: CandidateCertificationRow,
  requiredName: string,
  eventDate: string,
): boolean {
  if (cert.name !== requiredName) return false;
  if (cert.verification_status !== 'ngo_verified') return false;
  if (cert.expiry !== null && cert.expiry < eventDate) return false;
  return true;
}

export function scoreCertifications(
  volunteerCertifications: CandidateCertificationRow[],
  requiredCertNames: string[],
  eventDate: string,
  weight: number = DEFAULT_MATCHING_WEIGHTS.certifications,
): SkillCertFactor {
  if (requiredCertNames.length === 0) {
    return { score: 100, weight, status: 'full', matched: [], missing: [] };
  }
  const matched = requiredCertNames.filter((name) =>
    volunteerCertifications.some((cert) => certificationSatisfies(cert, name, eventDate)),
  );
  const missing = requiredCertNames.filter((name) => !matched.includes(name));
  return {
    score: Math.round((matched.length / requiredCertNames.length) * 100),
    weight,
    status: matched.length === requiredCertNames.length ? 'full' : matched.length === 0 ? 'none' : 'partial',
    matched: [...matched].sort(),
    missing: [...missing].sort(),
  };
}

// ---------------------------------------------------------------------------
// Availability — date-specific exceptions override recurring weekly windows
// (Step 5 decision). All wall-clock math happens in PLATFORM_TIMEZONE so the
// result is deterministic regardless of server timezone.
// ---------------------------------------------------------------------------

interface ZonedParts {
  weekday: number; // 0 = Sunday
  date: string; // 'YYYY-MM-DD'
  minutes: number; // minutes since midnight
}

/** Deterministic wall-clock parts of an ISO instant in PLATFORM_TIMEZONE. */
export function zonedParts(iso: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLATFORM_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAYS.indexOf(get('weekday') as (typeof WEEKDAYS)[number]);
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10) % 24; // hour12:false can emit '24'
  return { weekday, date, minutes: hour * 60 + parseInt(get('minute'), 10) };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

export function scoreAvailability(
  availability: CandidateAvailabilityRow[],
  eventStartAt: string,
  eventEndAt: string,
  weight: number = DEFAULT_MATCHING_WEIGHTS.availability,
): ListFactor {
  if (availability.length === 0) {
    return { score: 0, weight, status: 'not_assessable', detail: 'No availability information on file.' };
  }

  const start = zonedParts(eventStartAt);
  const end = zonedParts(eventEndAt);
  const coversEvent = (row: CandidateAvailabilityRow): boolean => {
    if (row.start_time === null || row.end_time === null) {
      // All-day exception (both times null) covers any time; anything else here
      // is malformed and does not cover.
      return row.start_time === null && row.end_time === null;
    }
    return timeToMinutes(row.start_time) <= start.minutes && timeToMinutes(row.end_time) >= end.minutes;
  };

  const sameDayExceptions = availability.filter((row) => row.available_date === start.date);
  if (sameDayExceptions.length > 0) {
    // An explicit "not available" exception wins over everything else.
    if (sameDayExceptions.some((row) => !row.is_available)) {
      return { score: 0, weight, status: 'none', detail: 'Marked unavailable for this date.' };
    }
    const covered = sameDayExceptions.some((row) => row.is_available && coversEvent(row));
    return covered
      ? { score: 100, weight, status: 'full', detail: 'Available (date exception).' }
      : { score: 0, weight, status: 'none', detail: 'Not available at the event time.' };
  }

  const weekly = availability.filter(
    (row) => row.available_date === null && row.weekday === start.weekday && row.is_available,
  );
  if (weekly.some(coversEvent)) {
    return { score: 100, weight, status: 'full', detail: 'Available in the recurring weekly window.' };
  }

  const hasWeeklyPattern = availability.some((row) => row.available_date === null && row.weekday !== null);
  return hasWeeklyPattern
    ? { score: 0, weight, status: 'none', detail: 'Not available at the event time.' }
    : { score: 0, weight, status: 'not_assessable', detail: 'No recurring availability on file.' };
}

// ---------------------------------------------------------------------------
// Proximity — haversine in memory; only safe labels leave this module.
// ---------------------------------------------------------------------------

const POINT_PATTERN = /POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/;

/** Parses 'SRID=4326;POINT(lng lat)' (or bare 'POINT(lng lat)') into {lng, lat}. */
export function parseGeoPoint(value: unknown): { lng: number; lat: number } | null {
  if (typeof value !== 'string') return null;
  const match = POINT_PATTERN.exec(value);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return { lng, lat };
}

function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDiff = toRadians(b.lat - a.lat);
  const lngDiff = toRadians(b.lng - a.lng);
  const h =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lngDiff / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function distanceBetweenKm(homeGeo: unknown, eventGeo: unknown): number | null {
  const home = parseGeoPoint(homeGeo);
  const venue = parseGeoPoint(eventGeo);
  if (!home || !venue) return null;
  return haversineKm(home, venue);
}

export function scoreProximity(
  distanceKm: number | null,
  maxDistanceKm: number | null,
  weight: number = DEFAULT_MATCHING_WEIGHTS.proximity,
): ListFactor {
  if (distanceKm === null) {
    return {
      score: 0,
      weight,
      status: 'not_assessable',
      detail: 'Location information is not available for this match.',
    };
  }
  if (maxDistanceKm !== null && distanceKm <= maxDistanceKm) {
    return { score: 100, weight, status: 'full', label: 'Within preferred range' };
  }
  if (distanceKm <= NEARBY_DISTANCE_KM) {
    return { score: 100, weight, status: 'full', label: 'Nearby' };
  }
  return { score: 0, weight, status: 'none', label: 'Farther away' };
}

// ---------------------------------------------------------------------------
// Experience and reliability — schema-gap fallbacks, never fabricated.
// ---------------------------------------------------------------------------

export function scoreExperience(weight: number = DEFAULT_MATCHING_WEIGHTS.experience): ListFactor {
  return {
    score: 0,
    weight,
    status: 'not_assessable',
    detail: 'Volunteer experience is not tracked in a comparable form yet.',
  };
}

export function scoreReliability(weight: number = DEFAULT_MATCHING_WEIGHTS.reliability): ListFactor {
  return {
    score: 0,
    weight,
    status: 'not_assessable',
    detail: 'Attendance history is not tracked yet, so reliability cannot be scored.',
  };
}

// ---------------------------------------------------------------------------
// Aggregation, ranking, eligibility
// ---------------------------------------------------------------------------

export function computeMatch(
  candidate: VolunteerCandidate,
  context: EventMatchContext,
  skillNames: SkillNameLookup,
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS,
): ScoredMatch {
  const eventDate = zonedParts(context.start_at).date;
  const distanceKm = distanceBetweenKm(candidate.home_geo, context.geo);

  const factors: MatchFactors = {
    skills: scoreSkills(
      candidate.skills.map((row) => row.skill_id),
      context.required_skill_ids,
      skillNames,
      weights.skills,
    ),
    certifications: scoreCertifications(
      candidate.certifications,
      context.required_cert_names,
      eventDate,
      weights.certifications,
    ),
    availability: scoreAvailability(candidate.availability, context.start_at, context.end_at, weights.availability),
    experience: scoreExperience(weights.experience),
    proximity: scoreProximity(distanceKm, candidate.max_distance_km, weights.proximity),
    reliability: scoreReliability(weights.reliability),
  };

  // Total is normalized over the factors that could actually be assessed, so
  // missing data neither punishes nor flatters the volunteer.
  const assessable = Object.values(factors).filter((factor) => factor.status !== 'not_assessable');
  const totalWeight = assessable.reduce((sum, factor) => sum + factor.weight, 0);
  const earned = assessable.reduce((sum, factor) => sum + (factor.score / 100) * factor.weight, 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  return {
    match: {
      volunteer_id: candidate.user_id,
      score,
      volunteer: {
        id: candidate.user_id,
        name: candidate.name,
        photo_url: candidate.photo_url,
        bio: candidate.bio,
        causes: candidate.causes,
      },
      factors,
    },
    tieBreak: { reliability: factors.reliability.score, distanceKm },
  };
}

/**
 * Deterministic ranking: score desc, then reliability desc, then smaller
 * distance, then volunteer_id asc. Never random.
 */
export function rankScoredMatches(scored: ScoredMatch[]): ScoredMatch[] {
  return [...scored].sort(
    (a, b) =>
      b.match.score - a.match.score ||
      b.tieBreak.reliability - a.tieBreak.reliability ||
      (a.tieBreak.distanceKm ?? Number.POSITIVE_INFINITY) -
        (b.tieBreak.distanceKm ?? Number.POSITIVE_INFINITY) ||
      a.match.volunteer_id.localeCompare(b.match.volunteer_id),
  );
}

/**
 * Volunteers already in this event's application pipeline (interested,
 * accepted, waitlisted, or rejected) are excluded — the NGO has already seen
 * or decided on them in RegistrationsPanel. A cancelled applicant, or someone
 * who never applied, stays eligible: this endpoint exists to DISCOVER
 * candidates, not to re-list applicants. Profile visibility and user status
 * are enforced upstream by the route's query filters.
 */
const PIPELINE_STATUSES: string[] = [
  APPLICATION_STATUSES.INTERESTED,
  APPLICATION_STATUSES.ACCEPTED,
  APPLICATION_STATUSES.WAITLISTED,
  APPLICATION_STATUSES.REJECTED,
];

export function filterEligibleCandidates(
  candidates: VolunteerCandidate[],
  applications: ApplicationStatusRow[],
): VolunteerCandidate[] {
  const inPipeline = new Set(
    applications
      .filter((application) => PIPELINE_STATUSES.includes(application.status))
      .map((application) => application.volunteer_id),
  );
  return candidates.filter((candidate) => !inPipeline.has(candidate.user_id));
}
