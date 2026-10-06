/**
 * SevaSetu Matching & Operational Configuration
 * Source of Truth: Sections 33, 67, 68, 69 of Technical Architecture Document
 */

export interface MatchingWeights {
  skills: number;
  certifications: number;
  availability: number;
  proximity: number;
  experience: number;
  reliability: number;
}

/**
 * Explainable weighted matching (Step 8) — the single source of truth for
 * factor weights. Weights are points out of 100 and MUST sum to 100.
 *
 *   skills          30  share of the event's required skills the volunteer has
 *   certifications  20  share of required certifications verified (ngo_verified, unexpired)
 *   availability    20  volunteer availability covers the event date/time
 *   proximity       10  volunteer home location vs event location (bucketed label only)
 *   experience      10  RESERVED — no volunteer-side experience data exists yet
 *   reliability     10  RESERVED — no attendance/history data exists yet
 *
 * Factors whose status is 'not_assessable' are excluded from a volunteer's
 * total (the total is renormalized over assessable factors), so the two
 * RESERVED weights neither penalize nor inflate anyone until real data lands.
 */
export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  skills: 30,
  certifications: 20,
  availability: 20,
  experience: 10,
  proximity: 10,
  reliability: 10,
};

/**
 * Availability windows are wall-clock times with no timezone column, while
 * event start_at/end_at are timestamptz. Matching converts the event instant
 * into this platform timezone before comparing, so results are deterministic
 * regardless of server timezone. Assumption: the platform operates in India.
 */
export const PLATFORM_TIMEZONE = 'Asia/Kolkata';

/**
 * Proximity bucketing (km). Within the volunteer's own max_distance_km is
 * "Within preferred range"; otherwise within this threshold is "Nearby";
 * anything farther is "Farther away". Distances are never returned to
 * clients — only these labels.
 */
export const NEARBY_DISTANCE_KM = 10;

/**
 * Karma Rules Configuration
 */
export interface KarmaConfig {
  pointsPerVerifiedHour: number;
  completionBonus: number;
  milestones: Record<number, string>;
}

export const DEFAULT_KARMA_CONFIG: KarmaConfig = {
  pointsPerVerifiedHour: 10,
  completionBonus: 20,
  milestones: {
    100: 'Community Starter',
    500: 'Active Contributor',
    1000: 'Community Champion',
  },
};

/**
 * Reliability Calculation Configuration
 */
export interface ReliabilityConfig {
  minimumHistoryThreshold: number;
  recencyWeighting: number;
  noShowPenalty: number;
  cancellationWithNoticePenalty: number;
  taskCompletionWeight: number;
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  minimumHistoryThreshold: 3,
  recencyWeighting: 0.7,
  noShowPenalty: 25,
  cancellationWithNoticePenalty: 5,
  taskCompletionWeight: 0.3,
};
