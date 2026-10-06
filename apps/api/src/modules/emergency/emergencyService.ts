/**
 * Step 11 — Emergency mobilization domain logic (pure, deterministic).
 *
 * REUSES Step 8 (computeMatch, scoreAvailability, distanceBetweenKm) and
 * Step 9 (summarizeReliabilityForMatching) — no second matching or
 * reliability engine. Hard constraints always beat ranking.
 */
import {
  computeMatch,
  distanceBetweenKm,
  scoreAvailability,
} from '../matching/matchingService.js';
import {
  candidateCoversShift,
  candidateHasRequiredCertifications,
  candidateHasRequiredSkills,
} from '../scheduling/schedulingService.js';
import type { SchedulingCandidate, SchedulingShift } from '../scheduling/schedulingService.js';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

/** Documented invitation transitions. Declined/expired are terminal unless a fresh invitation is created. */
export function isValidInvitationTransition(from: InvitationStatus, to: InvitationStatus): boolean {
  if (from === 'pending') return to === 'accepted' || to === 'declined' || to === 'expired' || to === 'cancelled';
  return false;
}

export type EmergencyStaffingStatus = 'unfilled' | 'partially_filled' | 'filled';

/** 'filled' requires CONFIRMED capacity, never mere invitations sent. */
export function computeEmergencyStaffingStatus(required: number, confirmed: number): EmergencyStaffingStatus {
  if (required <= 0) return 'unfilled';
  if (confirmed >= required) return 'filled';
  if (confirmed > 0) return 'partially_filled';
  return 'unfilled';
}

/** True when a candidate is a hard constraint away from eligibility. Deterministic. */
export function passesHardConstraints(
  candidate: SchedulingCandidate,
  shift: SchedulingShift,
  busyIntervals: Array<{ volunteer_id: string; start_at: string; end_at: string }>,
  shiftDate: string,
  maxDistanceKm: number | null,
  eventGeo: unknown,
): boolean {
  if (!candidateHasRequiredSkills(candidate, shift.required_skill_ids)) return false;
  if (!candidateHasRequiredCertifications(candidate, shift.required_cert_names, shiftDate)) return false;
  if (scoreAvailability(candidate.availability, shift.start_at, shift.end_at).status !== 'full') return false;
  if (busyIntervals.some((interval) => interval.volunteer_id === candidate.user_id && interval.start_at < shift.end_at && shift.start_at < interval.end_at)) {
    return false;
  }
  if (maxDistanceKm !== null && eventGeo !== null && eventGeo !== undefined) {
    const distance = distanceBetweenKm(candidate.home_geo, eventGeo);
    // Only block when distance is both configured and computable; missing
    // location data must not silently disqualify (Step 8 proximity semantics).
    if (distance !== null && distance > maxDistanceKm) return false;
  }
  return true;
}

export interface RankedEmergencyCandidate {
  volunteer_id: string;
  match_score: number;
  reliability_score: number | null;
  distance_km: number | null;
  explanation: string;
}

/**
 * Deterministic emergency ranking: feasible candidates (hard gates) sorted by
 * Step 8 match score desc, reliability desc, closer distance, volunteer_id.
 */
export function rankEmergencyCandidates(input: {
  shift: SchedulingShift;
  candidates: SchedulingCandidate[];
  busy: Array<{ volunteer_id: string; start_at: string; end_at: string }>;
  shiftDate: string;
  maxDistanceKm: number | null;
  eventGeo: unknown;
  eventStartAt: string;
  eventEndAt: string;
  eventId: string;
  skillNames: Record<string, string>;
}): RankedEmergencyCandidate[] {
  const ranked: RankedEmergencyCandidate[] = [];
  for (const candidate of input.candidates) {
    if (!passesHardConstraints(candidate, input.shift, input.busy, input.shiftDate, input.maxDistanceKm, input.eventGeo)) {
      continue;
    }
    const match = computeMatch(
      candidate,
      {
        event_id: input.eventId,
        geo: input.eventGeo,
        start_at: input.eventStartAt,
        end_at: input.eventEndAt,
        required_skill_ids: input.shift.required_skill_ids,
        required_cert_names: input.shift.required_cert_names,
        min_experience: 0,
      },
      input.skillNames,
    );
    ranked.push({
      volunteer_id: candidate.user_id,
      match_score: match.match.score,
      reliability_score: candidate.reliability?.score ?? null,
      distance_km: distanceBetweenKm(candidate.home_geo, input.eventGeo),
      explanation: `Match score ${match.match.score}/100; all hard constraints satisfied.`,
    });
  }
  return ranked.sort(
    (a, b) =>
      b.match_score - a.match_score ||
      (b.reliability_score ?? -1) - (a.reliability_score ?? -1) ||
      (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY) ||
      a.volunteer_id.localeCompare(b.volunteer_id),
  );
}

/** Split a ranked list into primary fills + backups for one requirement. */
export function splitPrimaryAndBackup<T>(ranked: T[], requiredCount: number, backupCount: number): { primary: T[]; backup: T[] } {
  return {
    primary: ranked.slice(0, requiredCount),
    backup: ranked.slice(requiredCount, requiredCount + backupCount),
  };
}

/** Pick the next promotable backup: first eligible backup not yet invited. */
export function selectNextBackup(
  backups: Array<{ volunteer_id: string; invited: boolean }>,
): { volunteer_id: string } | null {
  const next = backups.find((entry) => !entry.invited);
  return next ? { volunteer_id: next.volunteer_id } : null;
}
