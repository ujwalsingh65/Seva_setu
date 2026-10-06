/**
 * Step 13 — Independent volunteer opportunity discovery.
 *
 * Pure, deterministic filters over the PUBLIC event projection. Independent
 * volunteers use the same events/applications/roster/participation systems
 * as NGO workflows — no parallel schema.
 */
import { EVENT_VISIBILITY, EVENT_STATUSES } from '@sevasetu/constants';

export interface OpportunityFilter {
  search?: string;
  cause?: string;
  from?: string; // ISO datetime, inclusive
  to?: string; // ISO datetime, inclusive
  type?: 'standard' | 'emergency';
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  registrationMode?: 'open' | 'approval_required';
  hasCapacity?: boolean;
}

export interface PublicEventLike {
  title: string;
  description: string;
  cause: string;
  venue: string;
  start_at: string;
  visibility: string;
  status: string;
  capacity: number;
  event_type: string;
  urgency: string | null;
  registration_mode: string;
}

export function filterPublicEvents<T extends PublicEventLike>(
  events: T[],
  acceptedCounts: Record<string, number> | null,
  filters: OpportunityFilter,
): T[] {
  return events.filter((event) => {
    if (event.visibility !== EVENT_VISIBILITY.PUBLIC || event.status !== EVENT_STATUSES.PUBLISHED) return false;
    if (filters.search) {
      const haystack = `${event.title} ${event.description} ${event.cause} ${event.venue}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) return false;
    }
    if (filters.cause && event.cause !== filters.cause) return false;
    if (filters.from && Date.parse(event.start_at) < Date.parse(filters.from)) return false;
    if (filters.to && Date.parse(event.start_at) > Date.parse(filters.to)) return false;
    if (filters.type && event.event_type !== filters.type) return false;
    if (filters.urgency && event.urgency !== filters.urgency) return false;
    if (filters.registrationMode && event.registration_mode !== filters.registrationMode) return false;
    if (filters.hasCapacity && acceptedCounts) {
      const accepted = acceptedCounts[(event as unknown as { id: string }).id] ?? 0;
      if (accepted >= event.capacity) return false;
    }
    return true;
  });
}

/** Public requirement projection — roles/counts/skills/certs only, no internals. */
export interface PublicRequirement {
  role: string;
  headcount: number;
  required_skills: string[];
  required_certifications: string[];
  min_experience: number;
}

export function projectRequirements(
  rows: Array<{ role: string; headcount: number; required_skill_ids: string[]; required_cert_names: string[]; min_experience: number }>,
  skillNames: Record<string, string>,
): PublicRequirement[] {
  return rows.map((row) => ({
    role: row.role,
    headcount: row.headcount,
    required_skills: (row.required_skill_ids ?? []).map((id) => skillNames[id] ?? 'Unlisted skill').sort(),
    required_certifications: [...(row.required_cert_names ?? [])].sort(),
    min_experience: row.min_experience,
  }));
}
