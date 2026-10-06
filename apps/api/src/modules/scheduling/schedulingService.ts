/**
 * Automated Shift & Roster Generator (Step 10) — deterministic scheduler.
 *
 * SCHEDULING PRINCIPLES (same event + inputs ⇒ identical output):
 *   1. Reuse Step 8's factor scorers for candidate quality; do NOT duplicate
 *      the matching algorithm.
 *   2. Hard constraints always beat ranking: availability coverage, required
 *      skills, verified certifications, no double-booking, requirement
 *      capacity. A highly-scored but unavailable volunteer is never chosen.
 *   3. Ranking within the feasible set: Step 8 match total desc → reliability
 *      desc → workload in this event asc → distance asc → volunteer_id asc.
 *   4. Workload balancing is a deterministic penalty inside that tie-break,
 *      not a separate algorithm.
 *   5. Nothing is fabricated: requirements a feasible set cannot cover become
 *      explicit staffing gaps, never fake assignments.
 *
 * AVAILABILITY — scoreAvailability (Step 8) is reused against each shift's
 * window; only 'full' coverage qualifies. A volunteer available for only part
 * of a shift is not eligible for that shift (shifts are the atomic interval).
 * Date-specific exceptions override recurring windows — that rule lives in
 * scoreAvailability and is inherited here.
 *
 * EXPERIENCE — the schema carries no volunteer-side numeric counterpart for
 * event_requirements.min_experience (documented Step 8 gap), so experience is
 * surfaced in explanations as not assessable rather than silently enforced.
 */
import {
  computeMatch,
  distanceBetweenKm,
  scoreAvailability,
  scoreReliability,
  zonedParts,
} from '../matching/matchingService.js';
import type {
  CandidateReliability,
  EventMatchContext,
  SkillNameLookup,
  VolunteerCandidate,
} from '../matching/matchingTypes.js';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type SchedulingCandidate = VolunteerCandidate & { reliability: CandidateReliability };

export interface SchedulingShift {
  id: string;
  requirement_id: string;
  role: string;
  headcount: number;
  start_at: string;
  end_at: string;
  required_skill_ids: string[];
  required_cert_names: string[];
}

export interface BusyInterval {
  volunteer_id: string;
  start_at: string;
  end_at: string;
}

export interface PlannedAssignment {
  shift_id: string;
  volunteer_id: string;
  score: number;
  explanation: string;
}

export interface StaffingGap {
  shift_id: string;
  role: string;
  required: number;
  assigned: number;
  unfilled: number;
  reason: string;
}

export interface SchedulingResult {
  assignments: PlannedAssignment[];
  gaps: StaffingGap[];
  rejected_shifts: Array<{ shift_id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

function certificationSatisfied(
  candidate: VolunteerCandidate,
  requiredName: string,
  shiftDate: string,
): boolean {
  return candidate.certifications.some(
    (cert) =>
      cert.name === requiredName &&
      cert.verification_status === 'ngo_verified' &&
      (cert.expiry === null || cert.expiry >= shiftDate),
  );
}

/** Hard skill gate — every required skill must be present. */
export function candidateHasRequiredSkills(candidate: VolunteerCandidate, requiredSkillIds: string[]): boolean {
  const owned = new Set(candidate.skills.map((row) => row.skill_id));
  return requiredSkillIds.every((id) => owned.has(id));
}

/** Hard certification gate — every required cert must be verified and unexpired. */
export function candidateHasRequiredCertifications(
  candidate: VolunteerCandidate,
  requiredCertNames: string[],
  shiftDate: string,
): boolean {
  return requiredCertNames.every((name) => certificationSatisfied(candidate, name, shiftDate));
}

/** Hard availability gate — the volunteer must fully cover the shift window. */
export function candidateCoversShift(candidate: VolunteerCandidate, shift: SchedulingShift): boolean {
  const factor = scoreAvailability(candidate.availability, shift.start_at, shift.end_at);
  return factor.status === 'full' && factor.score === 100;
}

// ---------------------------------------------------------------------------
// Main scheduling routine (pure)
// ---------------------------------------------------------------------------

export function scheduleEvent(input: {
  eventId: string;
  eventStartAt: string;
  eventEndAt: string;
  eventGeo: unknown;
  shifts: SchedulingShift[];
  candidates: SchedulingCandidate[];
  skillNames?: SkillNameLookup;
  /** Busy intervals elsewhere/already (non-cancelled assignments), excluding this event's drafts. */
  busy: BusyInterval[];
}): SchedulingResult {
  const orderedShifts = [...input.shifts].sort(
    (a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.id.localeCompare(b.id),
  );

  const assignments: PlannedAssignment[] = [];
  const gaps: StaffingGap[] = [];
  const rejected: SchedulingResult['rejected_shifts'] = [];

  // Intervals each volunteer is already committed to (existing + this run).
  const busyByVolunteer = new Map<string, BusyInterval[]>();
  for (const interval of input.busy) {
    const bucket = busyByVolunteer.get(interval.volunteer_id) ?? [];
    bucket.push(interval);
    busyByVolunteer.set(interval.volunteer_id, bucket);
  }
  const workload = new Map<string, number>();

  for (const shift of orderedShifts) {
    if (Date.parse(shift.start_at) >= Date.parse(shift.end_at)) {
      rejected.push({ shift_id: shift.id, reason: 'Shift end must be after shift start.' });
      gaps.push({ shift_id: shift.id, role: shift.role, required: shift.headcount, assigned: 0, unfilled: shift.headcount, reason: 'Invalid shift interval.' });
      continue;
    }
    if (Date.parse(shift.start_at) < Date.parse(input.eventStartAt) || Date.parse(shift.end_at) > Date.parse(input.eventEndAt)) {
      rejected.push({ shift_id: shift.id, reason: 'Shift falls outside the event window.' });
      gaps.push({ shift_id: shift.id, role: shift.role, required: shift.headcount, assigned: 0, unfilled: shift.headcount, reason: 'Shift falls outside the event window.' });
      continue;
    }
    if (!Number.isInteger(shift.headcount) || shift.headcount <= 0) {
      rejected.push({ shift_id: shift.id, reason: 'Shift headcount must be a positive integer.' });
      continue;
    }

    const shiftDate = zonedParts(shift.start_at).date;
    const context: EventMatchContext = {
      event_id: input.eventId,
      geo: input.eventGeo,
      start_at: shift.start_at,
      end_at: shift.end_at,
      required_skill_ids: shift.required_skill_ids,
      required_cert_names: shift.required_cert_names,
      min_experience: 0,
    };

    // Feasible set after every hard constraint.
    const feasible: Array<{ candidate: SchedulingCandidate; score: number; distanceKm: number | null }> = [];
    let skillCertBlocked = 0;
    let availabilityBlocked = 0;
    let conflictBlocked = 0;
    for (const candidate of input.candidates) {
      const skillsOk = candidateHasRequiredSkills(candidate, shift.required_skill_ids);
      const certsOk = candidateHasRequiredCertifications(candidate, shift.required_cert_names, shiftDate);
      if (!skillsOk || !certsOk) {
        skillCertBlocked += 1;
        continue;
      }
      if (!candidateCoversShift(candidate, shift)) {
        availabilityBlocked += 1;
        continue;
      }
      const committed = busyByVolunteer.get(candidate.user_id) ?? [];
      if (committed.some((interval) => intervalsOverlap(interval.start_at, interval.end_at, shift.start_at, shift.end_at))) {
        conflictBlocked += 1;
        continue;
      }
      const match = computeMatch(candidate, context, input.skillNames ?? {});
      feasible.push({ candidate, score: match.match.score, distanceKm: distanceBetweenKm(candidate.home_geo, input.eventGeo) });
    }

    // Deterministic ranking.
    feasible.sort(
      (a, b) =>
        b.score - a.score ||
        (b.candidate.reliability?.score ?? -1) - (a.candidate.reliability?.score ?? -1) ||
        (workload.get(a.candidate.user_id) ?? 0) - (workload.get(b.candidate.user_id) ?? 0) ||
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
        a.candidate.user_id.localeCompare(b.candidate.user_id),
    );

    let filled = 0;
    for (const entry of feasible) {
      if (filled >= shift.headcount) break;
      const candidate = entry.candidate;
      filled += 1;
      workload.set(candidate.user_id, (workload.get(candidate.user_id) ?? 0) + 1);
      const committed = busyByVolunteer.get(candidate.user_id) ?? [];
      committed.push({ volunteer_id: candidate.user_id, start_at: shift.start_at, end_at: shift.end_at });
      busyByVolunteer.set(candidate.user_id, committed);

      const reliabilityFactor = scoreReliability(candidate.reliability);
      const reliabilityText =
        reliabilityFactor.status === 'not_assessable'
          ? 'reliability still being established'
          : `reliability ${candidate.reliability!.score}/100`;
      assignments.push({
        shift_id: shift.id,
        volunteer_id: candidate.user_id,
        score: entry.score,
        explanation:
          `Matched all required skills and certifications, available for the full shift, ` +
          `${reliabilityText}, match score ${entry.score}/100.`,
      });
    }

    if (filled < shift.headcount) {
      const unfilled = shift.headcount - filled;
      let reason: string;
      if (feasible.length === 0 && skillCertBlocked > 0 && availabilityBlocked === 0 && conflictBlocked === 0) {
        reason = 'No accepted volunteer meets the required skills/certifications.';
      } else if (availabilityBlocked > 0 && filled === 0 && skillCertBlocked === 0) {
        reason = 'Accepted volunteers were unavailable for this shift window.';
      } else if (conflictBlocked > 0 && filled === 0) {
        reason = 'Eligible volunteers were unavailable due to overlapping assignments.';
      } else {
        reason = `Insufficient eligible accepted volunteers — ${skillCertBlocked} blocked by skills/certifications, ${availabilityBlocked} by availability, ${conflictBlocked} by conflicts.`;
      }
      gaps.push({ shift_id: shift.id, role: shift.role, required: shift.headcount, assigned: filled, unfilled, reason });
    }
  }

  return { assignments, gaps, rejected_shifts: rejected };
}
