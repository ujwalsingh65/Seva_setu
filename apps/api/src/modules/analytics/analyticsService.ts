/**
 * Step 12 — Volunteer engagement & retention analytics (deterministic).
 *
 * Every metric is derived from Step 9 participation records joined to
 * events. Definitions (keep in sync with docs):
 *   - participated event: a participation row with status attended|late
 *   - attendance rate: (attended + late) / eligible records (Step 9 semantics)
 *   - service hours: sum of recorded participation_hours for attended|late
 *   - repeat/returning volunteer: >= 2 distinct participated events
 *   - windows (deterministic, server time):
 *       ACTIVE    participated within last ENGAGED_WINDOW? no — within RECENT_WINDOW (30d)
 *       ENGAGED   within AT_RISK_WINDOW (90d) but beyond recent
 *       AT_RISK   within INACTIVE_WINDOW (180d) but beyond 90d
 *       INACTIVE  last participation older than 180d
 *       NEW       no eligible participation history at all
 *
 * No fabrication: insufficient history is reported as NEW, never as INACTIVE
 * (a volunteer must have previously participated to be "inactive").
 */
import { CANCELLATION_SOURCES, PARTICIPATION_STATUSES } from '@sevasetu/constants';

export const RECENT_WINDOW_DAYS = 30;
export const AT_RISK_WINDOW_DAYS = 90;
export const INACTIVE_WINDOW_DAYS = 180;

export type EngagementStatus = 'new' | 'active' | 'engaged' | 'at_risk' | 'inactive';

export interface EngagementRecord {
  volunteer_id: string;
  event_id: string;
  status: string;
  cancellation_source: string | null;
  participation_hours: number | null;
  event_start_at: string;
  event_type: string | null;
  event_title: string | null;
}

export interface VolunteerEngagement {
  volunteer_id: string;
  status: EngagementStatus;
  status_reason: string;
  windows: { recent_days: number; at_risk_days: number; inactive_days: number };
  totals: {
    events_participated: number;
    attended: number;
    late: number;
    no_show: number;
    volunteer_cancelled: number;
    event_cancelled: number;
    service_hours: number | null;
    emergency_events: number;
    last_participation_at: string | null;
  };
  attendance_rate: number | null;
  recent_activity: Array<{ event_id: string; title: string | null; event_type: string | null; status: string; start_at: string }>;
}

function daysBetween(laterMs: number, earlierIso: string): number {
  return (laterMs - Date.parse(earlierIso)) / (1000 * 60 * 60 * 24);
}

export function classifyEngagement(records: readonly EngagementRecord[], nowMs: number): { status: EngagementStatus; reason: string; lastActiveAt: string | null } {
  const attendedEvents = records.filter(
    (row) => row.status === PARTICIPATION_STATUSES.ATTENDED || row.status === PARTICIPATION_STATUSES.LATE,
  );
  if (attendedEvents.length === 0) {
    const hasEligible = records.some(
      (row) =>
        row.status === PARTICIPATION_STATUSES.NO_SHOW ||
        (row.status === PARTICIPATION_STATUSES.CANCELLED && row.cancellation_source === CANCELLATION_SOURCES.VOLUNTEER),
    );
    return hasEligible
      ? { status: 'at_risk', reason: 'Recorded outcomes exist, but no event has been attended yet.', lastActiveAt: null }
      : { status: 'new', reason: 'No participation history yet.', lastActiveAt: null };
  }
  const lastActiveAt = attendedEvents
    .map((row) => row.event_start_at)
    .sort()
    .at(-1)!;
  const ageDays = daysBetween(nowMs, lastActiveAt);
  if (ageDays <= RECENT_WINDOW_DAYS) return { status: 'active', reason: 'Participated within the last 30 days.', lastActiveAt };
  if (ageDays <= AT_RISK_WINDOW_DAYS) return { status: 'engaged', reason: 'Participated in the last 90 days, but not in the last 30.', lastActiveAt };
  if (ageDays <= INACTIVE_WINDOW_DAYS) return { status: 'at_risk', reason: 'No participation in the last 90 days.', lastActiveAt };
  return { status: 'inactive', reason: 'No participation in the last 180 days.', lastActiveAt };
}

export function buildVolunteerEngagement(volunteerId: string, records: readonly EngagementRecord[], nowMs: number): VolunteerEngagement {
  const eligible = records.filter(
    (row) =>
      row.status === PARTICIPATION_STATUSES.ATTENDED ||
      row.status === PARTICIPATION_STATUSES.LATE ||
      row.status === PARTICIPATION_STATUSES.NO_SHOW ||
      (row.status === PARTICIPATION_STATUSES.CANCELLED && row.cancellation_source === CANCELLATION_SOURCES.VOLUNTEER),
  );
  const attendedEvents = records.filter(
    (row) => row.status === PARTICIPATION_STATUSES.ATTENDED || row.status === PARTICIPATION_STATUSES.LATE,
  );
  const distinctEvents = new Set(attendedEvents.map((row) => row.event_id));
  const hoursRecords = attendedEvents.filter((row) => typeof row.participation_hours === 'number');
  const serviceHours =
    hoursRecords.length > 0 ? hoursRecords.reduce((sum, row) => sum + (row.participation_hours ?? 0), 0) : null;

  const classification = classifyEngagement(records, nowMs);
  const attendanceRate =
    eligible.length > 0
      ? Math.round(
          (records.filter((row) => row.status === PARTICIPATION_STATUSES.ATTENDED || row.status === PARTICIPATION_STATUSES.LATE).length /
            eligible.length) * 100,
        )
      : null;

  const recentActivity = [...records]
    .sort((a, b) => Date.parse(b.event_start_at) - Date.parse(a.event_start_at))
    .slice(0, 5)
    .map((row) => ({ event_id: row.event_id, title: row.event_title, event_type: row.event_type, status: row.status, start_at: row.event_start_at }));

  return {
    volunteer_id: volunteerId,
    status: classification.status,
    status_reason: classification.reason,
    windows: { recent_days: RECENT_WINDOW_DAYS, at_risk_days: AT_RISK_WINDOW_DAYS, inactive_days: INACTIVE_WINDOW_DAYS },
    totals: {
      events_participated: distinctEvents.size,
      attended: records.filter((row) => row.status === PARTICIPATION_STATUSES.ATTENDED).length,
      late: records.filter((row) => row.status === PARTICIPATION_STATUSES.LATE).length,
      no_show: records.filter((row) => row.status === PARTICIPATION_STATUSES.NO_SHOW).length,
      volunteer_cancelled: records.filter((row) => row.status === PARTICIPATION_STATUSES.CANCELLED && row.cancellation_source === CANCELLATION_SOURCES.VOLUNTEER).length,
      event_cancelled: records.filter((row) => row.status === PARTICIPATION_STATUSES.CANCELLED && row.cancellation_source !== CANCELLATION_SOURCES.VOLUNTEER).length,
      service_hours: serviceHours,
      emergency_events: new Set(attendedEvents.filter((row) => row.event_type === 'emergency').map((row) => row.event_id)).size,
      last_participation_at: classification.lastActiveAt,
    },
    attendance_rate: attendanceRate,
    recent_activity: recentActivity,
  };
}

export interface NgoEngagementAnalytics {
  generated_for: { window_days: number; previous_window_days: number };
  volunteers: {
    total: number;
    active: number;
    engaged: number;
    at_risk: number;
    inactive: number;
    new: number;
  };
  returning_volunteer_rate: number | null;
  attendance_rate: number | null;
  trend: { current_period: number; previous_period: number; direction: 'up' | 'down' | 'flat' };
  insights: string[];
}

/** NGO-scoped retention analytics over Step 9 participation rows for this NGO's events. */
export function buildNgoEngagement(records: readonly EngagementRecord[], nowMs: number): NgoEngagementAnalytics {
  const byVolunteer = new Map<string, EngagementRecord[]>();
  for (const row of records) {
    const bucket = byVolunteer.get(row.volunteer_id) ?? [];
    bucket.push(row);
    byVolunteer.set(row.volunteer_id, bucket);
  }

  const counts: NgoEngagementAnalytics['volunteers'] = { total: byVolunteer.size, active: 0, engaged: 0, at_risk: 0, inactive: 0, new: 0 };
  let returning = 0;
  let eventParticipants = 0;
  for (const rows of byVolunteer.values()) {
    const classification = classifyEngagement(rows, nowMs);
    counts[classification.status] += 1;
    const distinctEvents = new Set(
      rows
        .filter((row) => row.status === PARTICIPATION_STATUSES.ATTENDED || row.status === PARTICIPATION_STATUSES.LATE)
        .map((row) => row.event_id),
    );
    if (distinctEvents.size >= 2) returning += 1;
    if (distinctEvents.size >= 1) eventParticipants += 1;
  }

  const eligible = records.filter(
    (row) =>
      row.status === PARTICIPATION_STATUSES.ATTENDED ||
      row.status === PARTICIPATION_STATUSES.LATE ||
      row.status === PARTICIPATION_STATUSES.NO_SHOW ||
      (row.status === PARTICIPATION_STATUSES.CANCELLED && row.cancellation_source === CANCELLATION_SOURCES.VOLUNTEER),
  );
  const attendedN = records.filter(
    (row) => row.status === PARTICIPATION_STATUSES.ATTENDED || row.status === PARTICIPATION_STATUSES.LATE,
  ).length;
  const attendanceRate = eligible.length > 0 ? Math.round((attendedN / eligible.length) * 100) : null;

  const recentEligible = eligible.filter((row) => daysBetween(nowMs, row.event_start_at) <= 30);
  const previousEligible = eligible.filter((row) => daysBetween(nowMs, row.event_start_at) > 30 && daysBetween(nowMs, row.event_start_at) <= 60);
  const direction = recentEligible.length > previousEligible.length ? 'up' : recentEligible.length < previousEligible.length ? 'down' : 'flat';

  const returningRate = eventParticipants > 0 ? Math.round((returning / eventParticipants) * 100) : null;

  const insights: string[] = [];
  const dropout = counts.at_risk + counts.inactive;
  if (dropout > 0) insights.push(`${dropout} volunteer${dropout === 1 ? ' has' : 's have'} not participated recently.`);
  if (returningRate !== null && eventParticipants >= 2 && returningRate >= 50) {
    insights.push(`${returningRate}% of participating volunteers returned for another event.`);
  }
  const noShows = records.filter((row) => row.status === PARTICIPATION_STATUSES.NO_SHOW).length;
  if (eligible.length >= 5 && noShows / eligible.length > 0.2) {
    insights.push(`No-shows account for ${Math.round((noShows / eligible.length) * 100)}% of recorded outcomes — review reminders.`);
  }
  if (insights.length === 0) insights.push('No strong engagement signals yet — more recorded participation will unlock insights.');

  return {
    generated_for: { window_days: RECENT_WINDOW_DAYS, previous_window_days: 30 },
    volunteers: counts,
    returning_volunteer_rate: returningRate,
    attendance_rate: attendanceRate,
    trend: { current_period: recentEligible.length, previous_period: previousEligible.length, direction },
    insights,
  };
}
