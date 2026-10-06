/**
 * Explainable, deterministic, rules-based reliability service (Step 9).
 *
 * This is NOT an ML prediction and NOT karma. It only uses recorded
 * participation outcomes:
 *
 *   Reliability Score =
 *     Attendance completion  × 0.50
 *   + No-show behavior       × 0.25
 *   + Cancellation behavior  × 0.15
 *   + Consistency/history    × 0.10
 *
 * Factor definitions (all 0-100):
 *   - attendance:    (attended + late) / eligible
 *   - no_show:       1 - no_show / eligible
 *   - cancellations: 1 - volunteer_cancelled / eligible
 *   - consistency:   min(eligible / 5, 1) * 100 — demonstrated history
 *                    volume, never account age.
 *
 * Evidence thresholds (eligible = attended + late + no_show +
 * volunteer-caused cancellations):
 *   < 3  → insufficient_data (score null, "Not enough history")
 *   3-4  → provisional (real score, flagged as building)
 *   >= 5 → established
 *
 * NGO/event/system cancellations are excluded from `eligible`: volunteers
 * are never penalized for those. NO DATA ≠ BAD RELIABILITY: zero history
 * returns score null, never 0.
 *
 * Eligibility rule: only participation rows tied to events with a real
 * application trail can exist (DB trigger enforces this), so this service
 * never treats accepted applications themselves as attendance.
 */
import {
  RELIABILITY_CONSISTENCY_FULL_AT,
  RELIABILITY_ESTABLISHED_EVIDENCE,
  RELIABILITY_FACTOR_WEIGHTS,
  RELIABILITY_MIN_EVIDENCE,
} from '@sevasetu/matching-config';
import { CANCELLATION_SOURCES, PARTICIPATION_STATUSES } from '@sevasetu/constants';
import type {
  ReliabilityFactors,
  ReliabilityHistory,
  ReliabilityMatchSummary,
  ReliabilityResult,
} from './reliabilityTypes.js';

/** Minimal row shape the calculator needs (DB rows satisfy this). */
export interface ParticipationOutcomeLike {
  status: string;
  cancellation_source: string | null;
}

export function countHistory(rows: readonly ParticipationOutcomeLike[]): ReliabilityHistory {
  const history: ReliabilityHistory = {
    eligible_events: 0,
    attended: 0,
    late: 0,
    no_show: 0,
    volunteer_cancelled: 0,
    event_cancelled: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case PARTICIPATION_STATUSES.ATTENDED:
        history.attended += 1;
        history.eligible_events += 1;
        break;
      case PARTICIPATION_STATUSES.LATE:
        history.late += 1;
        history.eligible_events += 1;
        break;
      case PARTICIPATION_STATUSES.NO_SHOW:
        history.no_show += 1;
        history.eligible_events += 1;
        break;
      case PARTICIPATION_STATUSES.CANCELLED:
        if (row.cancellation_source === CANCELLATION_SOURCES.VOLUNTEER) {
          history.volunteer_cancelled += 1;
          history.eligible_events += 1;
        } else {
          // ngo/event/system cancellations never penalize the volunteer.
          history.event_cancelled += 1;
        }
        break;
      default:
        // Unknown rows carry no evidence — never silently scored.
        break;
    }
  }
  return history;
}

function factor(
  score: number,
  weight: number,
  explanation: string,
): ReliabilityFactors['attendance'] {
  return {
    score: Math.round(score),
    weight,
    earned: Math.round((Math.round(score) / 100) * weight),
    explanation,
  };
}

export function computeReliability(rows: readonly ParticipationOutcomeLike[]): ReliabilityResult {
  const history = countHistory(rows);
  const eligible = history.eligible_events;

  if (eligible < RELIABILITY_MIN_EVIDENCE) {
    return {
      score: null,
      status: 'insufficient_data',
      label: 'Building history',
      history,
      factors: null,
      minimum_evidence: RELIABILITY_MIN_EVIDENCE,
      explanation:
        eligible === 0
          ? 'Not enough participation history yet.'
          : `Not enough participation history yet (${eligible} of ${RELIABILITY_MIN_EVIDENCE} needed).`,
    };
  }

  const attendedShare = (history.attended + history.late) / eligible;
  const noShowShare = history.no_show / eligible;
  const volunteerCancelledShare = history.volunteer_cancelled / eligible;
  const consistency = Math.min(eligible / RELIABILITY_CONSISTENCY_FULL_AT, 1);

  const factors: ReliabilityFactors = {
    attendance: factor(
      attendedShare * 100,
      RELIABILITY_FACTOR_WEIGHTS.attendance,
      `${history.attended + history.late} of ${eligible} recorded events attended (late counts as attended).`,
    ),
    no_show: factor(
      (1 - noShowShare) * 100,
      RELIABILITY_FACTOR_WEIGHTS.noShow,
      history.no_show === 0
        ? 'No recorded no-shows.'
        : `${history.no_show} of ${eligible} recorded events were no-shows.`,
    ),
    cancellations: factor(
      (1 - volunteerCancelledShare) * 100,
      RELIABILITY_FACTOR_WEIGHTS.cancellations,
      history.volunteer_cancelled === 0
        ? 'No volunteer-caused cancellations.'
        : `${history.volunteer_cancelled} of ${eligible} recorded events cancelled by the volunteer. NGO/event cancellations (${history.event_cancelled}) are not penalized.`,
    ),
    consistency: factor(
      consistency * 100,
      RELIABILITY_FACTOR_WEIGHTS.consistency,
      `${eligible} recorded event outcome${eligible === 1 ? '' : 's'}; ${RELIABILITY_CONSISTENCY_FULL_AT}+ gives full consistency marks.`,
    ),
  };

  const score =
    factors.attendance.earned +
    factors.no_show.earned +
    factors.cancellations.earned +
    factors.consistency.earned;

  const status = eligible >= RELIABILITY_ESTABLISHED_EVIDENCE ? 'established' : 'provisional';
  const label = status === 'established' ? 'Established' : 'Building history';

  return {
    score,
    status,
    label,
    history,
    factors,
    minimum_evidence: RELIABILITY_MIN_EVIDENCE,
    explanation:
      status === 'established'
        ? `${history.attended + history.late} attended, ${history.no_show} no-shows, ${history.volunteer_cancelled} volunteer cancellations across ${eligible} recorded events.`
        : `Provisional — only ${eligible} recorded event outcome${eligible === 1 ? '' : 's'} so far; the score will firm up with more history.`,
  };
}

/** The Step 8 matching engine's compact view over the same rows. */
export function summarizeReliabilityForMatching(
  rows: readonly ParticipationOutcomeLike[],
): ReliabilityMatchSummary {
  const history = countHistory(rows);
  const result = computeReliability(rows);
  return {
    status: result.status,
    score: result.score,
    attended: history.attended,
    late: history.late,
    no_show: history.no_show,
    volunteer_cancelled: history.volunteer_cancelled,
  };
}
