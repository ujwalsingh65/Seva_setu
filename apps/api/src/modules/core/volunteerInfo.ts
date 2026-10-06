import { APPLICATION_STATUSES } from '@sevasetu/constants';

/**
 * Security-permitted volunteer fields for NGO staff views (Security & Access §37/§38).
 * Never include home_geo, max_distance_km, notification_preferences,
 * emergency_available, or user contact fields.
 */
export const VOLUNTEER_PUBLIC_COLUMNS = 'id, name, photo_url, bio, causes';

export interface PublicVolunteerInfo {
  id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  causes: string[] | null;
}

export function projectVolunteerInfo(value: unknown): PublicVolunteerInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    name: record.name,
    photo_url: typeof record.photo_url === 'string' ? record.photo_url : null,
    bio: typeof record.bio === 'string' ? record.bio : null,
    causes: Array.isArray(record.causes)
      ? record.causes.filter((cause): cause is string => typeof cause === 'string')
      : null,
  };
}

export function countAcceptedByEvent(rows: Array<{ event_id: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    return counts;
  }, {});
}

export function selectAccepted<T extends { status: string }>(
  rows: readonly T[] | null | undefined,
): T[] {
  return (rows ?? []).filter((row) => row.status === APPLICATION_STATUSES.ACCEPTED);
}
