/**
 * Explainable reliability types (Step 9).
 *
 * Reliability is OPERATIONAL information — it is never a public rating and
 * never derived from anything except recorded participation outcomes.
 */

export type ReliabilityStatus = 'insufficient_data' | 'provisional' | 'established';

/** Counted history per volunteer, derived from participation rows. */
export interface ReliabilityHistory {
  /** Records that actually evaluate the volunteer (attended+late+no_show+volunteer-cancelled). */
  eligible_events: number;
  attended: number;
  late: number;
  no_show: number;
  volunteer_cancelled: number;
  /** NGO/event/system cancellations — surfaced for transparency, never penalized. */
  event_cancelled: number;
}

export interface ReliabilityFactorBreakdown {
  /** 0-100 factor score. */
  score: number;
  /** Configured weight in points (out of 100 total). */
  weight: number;
  /** Points earned: round(score/100 * weight). */
  earned: number;
  explanation: string;
}

export interface ReliabilityFactors {
  attendance: ReliabilityFactorBreakdown;
  no_show: ReliabilityFactorBreakdown;
  cancellations: ReliabilityFactorBreakdown;
  consistency: ReliabilityFactorBreakdown;
}

export interface ReliabilityResult {
  /** 0-100, or null when there is not enough evidence (never a fake score). */
  score: number | null;
  status: ReliabilityStatus;
  /** Short UI label, e.g. 'Building history'. */
  label: string;
  history: ReliabilityHistory;
  factors: ReliabilityFactors | null;
  minimum_evidence: number;
  explanation: string;
}

/** Minimal reliability view the Step 8 matching engine consumes. */
export interface ReliabilityMatchSummary {
  status: ReliabilityStatus;
  score: number | null;
  attended: number;
  late: number;
  no_show: number;
  volunteer_cancelled: number;
}
