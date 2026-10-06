/**
 * Explainable weighted matching — shared types (Step 8).
 *
 * A match is computed per candidate volunteer against one event's
 * requirements. Every factor reports a 0-100 score, its configured weight
 * (points), and one of four statuses:
 *
 *   'full'            — factor fully satisfied (score 100)
 *   'partial'         — factor partially satisfied (score 1-99)
 *   'none'            — factor assessed and NOT satisfied (score 0)
 *   'not_assessable'  — the data needed to assess this factor does not exist;
 *                       the factor is excluded from the volunteer's total
 *
 * Privacy: MatchResult must never contain email, phone, home_geo,
 * max_distance_km, exact coordinates, distances, or raw availability
 * windows — only the VolunteerPublicInfo whitelist.
 */
import type { PublicVolunteerInfo } from '../core/volunteerInfo.js';

export type MatchFactorStatus = 'full' | 'partial' | 'none' | 'not_assessable';

export interface ListFactor {
  score: number;
  weight: number;
  status: MatchFactorStatus;
  /** Safe display label (proximity: 'Nearby' | 'Within preferred range' | 'Farther away'). */
  label?: string;
  /** Human explanation, mainly for 'not_assessable'. */
  detail?: string;
}

export interface SkillCertFactor extends ListFactor {
  /** Required item names the volunteer satisfies (sorted alphabetically). */
  matched: string[];
  /** Required item names the volunteer does not satisfy (sorted alphabetically). */
  missing: string[];
}

export interface MatchFactors {
  skills: SkillCertFactor;
  certifications: SkillCertFactor;
  availability: ListFactor;
  experience: ListFactor;
  proximity: ListFactor;
  reliability: ListFactor;
}

export interface MatchResult {
  volunteer_id: string;
  /** 0-100, normalized over the factors that could be assessed. */
  score: number;
  volunteer: PublicVolunteerInfo;
  factors: MatchFactors;
}

/** Internal ranking metadata — never serialized to clients. */
export interface ScoredMatch {
  match: MatchResult;
  tieBreak: {
    reliability: number;
    /** Haversine km; null when proximity was not assessable. */
    distanceKm: number | null;
  };
}

// ---------------------------------------------------------------------------
// Inputs — shapes of rows already fetched by the route (no N+1).
// Geo columns arrive from PostgREST as EWKT-like strings ('SRID=4326;POINT(lng lat)')
// but are typed `unknown` defensively and validated at runtime.
// ---------------------------------------------------------------------------

export interface CandidateSkillRow {
  skill_id: string;
}

export interface CandidateCertificationRow {
  name: string;
  verification_status: string;
  expiry: string | null;
}

export interface CandidateAvailabilityRow {
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  available_date: string | null;
  is_available: boolean;
}

export interface VolunteerCandidate {
  user_id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  causes: string[] | null;
  home_geo: unknown;
  max_distance_km: number | null;
  skills: CandidateSkillRow[];
  certifications: CandidateCertificationRow[];
  availability: CandidateAvailabilityRow[];
}

export interface EventMatchContext {
  event_id: string;
  geo: unknown;
  start_at: string;
  end_at: string;
  required_skill_ids: string[];
  required_cert_names: string[];
  min_experience: number;
}

/** skill id -> skill name, from the skills table. */
export type SkillNameLookup = Record<string, string>;

export interface ApplicationStatusRow {
  volunteer_id: string;
  status: string;
}
