/**
 * Step 15 — NGO Transparency & Activity Profile.
 *
 * Evidence-based only: every number is derived from existing Step 9
 * participation records joined to events. Participation semantics match
 * Step 9 exactly: verified participation = status 'attended' | 'late'.
 * No trust score, no ratings, no impact claims SevaSetu cannot verify.
 *
 * Honesty rules:
 *   - verified_service_hours is null ("not recorded") when no hours exist
 *   - service hours are only summed for attended/late records
 *   - no-show/cancellations never count as participation
 *   - draft/private/cancelled events are never counted
 */
import { PARTICIPATION_STATUSES } from '@sevasetu/constants';

export interface TransparencyEvidence {
  event_id: string;
  volunteer_id: string;
  status: string;
  cancellation_source: string | null;
  participation_hours: number | null;
  event_type: string | null;
  event_status: string | null;
  event_visibility: string | null;
  event_title: string | null;
  event_start_at: string | null;
}

export interface NgoTransparency {
  activity_source: string;
  service_hours_status: 'recorded' | 'not_recorded';
  completed_events: number;
  verified_participations: number;
  unique_volunteers: number;
  verified_service_hours: number | null;
  emergency_events_supported: number;
  returning_volunteers: number;
  recent_events: Array<{
    event_id: string;
    title: string | null;
    event_type: string | null;
    start_at: string | null;
    participation_count: number;
    service_hours: number | null;
  }>;
}

const VERIFIED = new Set<string>([PARTICIPATION_STATUSES.ATTENDED, PARTICIPATION_STATUSES.LATE]);

export function buildNgoTransparency(rows: readonly TransparencyEvidence[]): NgoTransparency {
  // Aggregates cover all real events the NGO ran (public or ngo_only).
  // Public display of individual events is limited to public visibility.
  const relevant = rows.filter((row) => row.event_status !== 'draft' && row.event_status !== 'cancelled');

  const verifiedRows = relevant.filter((row) => VERIFIED.has(row.status));

  const completedEventIds = new Set(
    relevant.filter((row) => row.event_status === 'completed').map((row) => row.event_id),
  );
  const verifiedEventIds = new Set(verifiedRows.map((row) => row.event_id));
  const participants = new Set(verifiedRows.map((row) => row.volunteer_id));
  const emergencyEventIds = new Set(
    verifiedRows.filter((row) => row.event_type === 'emergency').map((row) => row.event_id),
  );
  const hoursRows = verifiedRows.filter((row) => typeof row.participation_hours === 'number');
  const returningCount = (() => {
    const perVolunteer = new Map<string, Set<string>>();
    for (const row of verifiedRows) {
      const bucket = perVolunteer.get(row.volunteer_id) ?? new Set<string>();
      bucket.add(row.event_id);
      perVolunteer.set(row.volunteer_id, bucket);
    }
    let count = 0;
    for (const events of perVolunteer.values()) if (events.size >= 2) count += 1;
    return count;
  })();

  const relevantByEvent = new Map<string, TransparencyEvidence[]>();
  for (const row of relevant) {
    const bucket = relevantByEvent.get(row.event_id) ?? [];
    bucket.push(row);
    relevantByEvent.set(row.event_id, bucket);
  }
  const recentEvents = [...relevantByEvent.entries()]
    .filter(([, eventRows]) => eventRows[0].event_status === 'completed' && eventRows[0].event_visibility === 'public')
    .sort((a, b) => (b[1][0].event_start_at ?? '').localeCompare(a[1][0].event_start_at ?? ''))
    .slice(0, 5)
    .map(([eventId, eventRows]) => {
      const eventVerified = eventRows.filter((row) => VERIFIED.has(row.status));
      const eventHoursRows = eventVerified.filter((row) => typeof row.participation_hours === 'number');
      return {
        event_id: eventId,
        title: eventRows[0].event_title,
        event_type: eventRows[0].event_type,
        start_at: eventRows[0].event_start_at,
        participation_count: eventVerified.length,
        service_hours: eventHoursRows.length > 0 ? eventHoursRows.reduce((sum, row) => sum + (row.participation_hours ?? 0), 0) : null,
      };
    });

  return {
    activity_source: 'SevaSetu participation records',
    service_hours_status: hoursRows.length > 0 ? 'recorded' : 'not_recorded',
    completed_events: completedEventIds.size,
    verified_participations: verifiedRows.length,
    unique_volunteers: participants.size,
    verified_service_hours: hoursRows.length > 0 ? hoursRows.reduce((sum, row) => sum + (row.participation_hours ?? 0), 0) : null,
    emergency_events_supported: emergencyEventIds.size,
    returning_volunteers: returningCount,
    recent_events: recentEvents,
  };
}
