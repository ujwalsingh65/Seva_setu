/**
 * Step 14 — Verified Community Impact ("Karma").
 *
 * Karma ≠ reliability (Step 9) and ≠ engagement (Step 12). It answers:
 * "How much verified community contribution has this volunteer made?"
 *
 * DESIGN DECISION — no separate ledger table:
 * Participation records (Step 9) are the authoritative evidence. Karma is
 * derived deterministically and explainably from those records, so it is
 * auditable by construction, idempotent by definition, and can never
 * diverge from the evidence. A materialized karma_entries table would
 * introduce a second source of truth and the drift/duplicate-award risks
 * that every requirement in this step warns about. Points are therefore
 * never stored client-side, never editable by volunteers or NGOs, and
 * never derived from anything other than recorded participation.
 *
 * Points are awarded ONLY for verified attendance:
 *   ATTENDED = +10, LATE = +7
 *   +2 per recorded service hour, capped at +10 per participation
 *   +5 when the event is a real emergency (matched by event_type) with
 *     an ATTENDED/LATE record. Invitations alone award nothing.
 *
 * NO_SHOW, volunteer/ngo/event/system cancellations, missed windows, and
 * absence of history all earn zero. Nothing is seeded.
 */

export const KARMA_CONFIG = {
  attendedPoints: 10,
  latePoints: 7,
  hoursPointsPerHour: 2,
  maxHoursPointsPerParticipation: 10,
  emergencyBonus: 5,
} as const;

export const KARMA_LEVELS = [
  { min: 300, label: 'Community Champion' },
  { min: 150, label: 'Committed Contributor' },
  { min: 50, label: 'Active Contributor' },
  { min: 0, label: 'Emerging Contributor' },
] as const;

export function karmaLevelFor(totalKarma: number): string {
  for (const level of KARMA_LEVELS) {
    if (totalKarma >= level.min) return level.label;
  }
  return KARMA_LEVELS[KARMA_LEVELS.length - 1].label;
}

export interface KarmaParticipationEvidence {
  event_id: string;
  status: string;
  cancellation_source: string | null;
  participation_hours: number | null;
  event_type?: string | null;
  event_start_at?: string | null;
  event_title?: string | null;
}

export interface KarmaEntry {
  event_id: string;
  title: string | null;
  start_at: string | null;
  event_type: string | null;
  points: number;
  reason: string;
  hours: number | null;
}

export interface KarmaResult {
  total_karma: number;
  level: string;
  participated_events: number;
  verified_service_hours: number | null;
  emergency_contributions: number;
  breakdown: {
    participation: number;
    verified_service: number;
    emergency_contribution: number;
  };
  recent_contributions: KarmaEntry[];
}

/** Deterministic Karma for one event's participation outcome; 0 when not earned. */
export function karmaForParticipation(
  status: string,
  participationHours: number | null,
  eventType: string | null | undefined,
): { points: number; attendancePoints: number; hoursPoints: number; emergencyPoints: number } {
  const attended = status === 'attended';
  const late = status === 'late';
  if (!attended && !late) {
    return { points: 0, attendancePoints: 0, hoursPoints: 0, emergencyPoints: 0 };
  }
  const attendancePoints = attended ? KARMA_CONFIG.attendedPoints : KARMA_CONFIG.latePoints;
  const hoursPoints =
    typeof participationHours === 'number' && participationHours > 0
      ? Math.min(Math.floor(participationHours) * KARMA_CONFIG.hoursPointsPerHour, KARMA_CONFIG.maxHoursPointsPerParticipation)
      : 0;
  const emergencyPoints = eventType === 'emergency' ? KARMA_CONFIG.emergencyBonus : 0;
  return {
    points: attendancePoints + hoursPoints + emergencyPoints,
    attendancePoints,
    hoursPoints,
    emergencyPoints,
  };
}

/** Aggregate Karma for a volunteer from evidence rows. */
export function calculateVolunteerKarma(rows: readonly KarmaParticipationEvidence[]): KarmaResult {
  let participationPoints = 0;
  let servicePoints = 0;
  let emergencyPoints = 0;
  let verifiedHours = 0;
  let hoursRecorded = false;
  let emergencyCount = 0;
  const participatedEvents = new Set<string>();
  const entries: KarmaEntry[] = [];

  for (const row of rows) {
    const scored = karmaForParticipation(row.status, row.participation_hours, row.event_type);
    if (scored.points === 0) continue;
    participationPoints += scored.attendancePoints;
    servicePoints += scored.hoursPoints;
    emergencyPoints += scored.emergencyPoints;
    if (scored.emergencyPoints > 0) emergencyCount += 1;
    participatedEvents.add(row.event_id);
    if (typeof row.participation_hours === 'number') {
      verifiedHours += row.participation_hours;
      hoursRecorded = true;
    }
    entries.push({
      event_id: row.event_id,
      title: row.event_title ?? null,
      start_at: row.event_start_at ?? null,
      event_type: row.event_type ?? null,
      points: scored.points,
      reason: row.status === 'attended' ? 'participation_attended' : 'participation_late',
      hours: row.participation_hours ?? null,
    });
  }

  const sorted = [...entries].sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''));
  return {
    total_karma: participationPoints + servicePoints + emergencyPoints,
    level: karmaLevelFor(participationPoints + servicePoints + emergencyPoints),
    participated_events: participatedEvents.size,
    verified_service_hours: hoursRecorded ? verifiedHours : null,
    emergency_contributions: emergencyCount,
    breakdown: {
      participation: participationPoints,
      verified_service: servicePoints,
      emergency_contribution: emergencyPoints,
    },
    recent_contributions: sorted.slice(0, 10),
  };
}
