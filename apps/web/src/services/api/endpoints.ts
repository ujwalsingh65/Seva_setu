/**
 * Typed endpoint functions for the SevaSetu API (/api/v1).
 * One function per existing backend endpoint — no client-side Supabase access.
 */
import { apiClient, ApiError } from './client';
import type { ApiEnvelope } from './client';
import type { Database } from '@sevasetu/shared-types';

export type VolunteerProfileRow = Database['public']['Tables']['volunteer_profiles']['Row'];
export type AvailabilityRow = Database['public']['Tables']['availability']['Row'];
export type EventRow = Database['public']['Tables']['events']['Row'];
export type ApplicationRow = Database['public']['Tables']['applications']['Row'];
export type NgoProfileRow = Database['public']['Tables']['ngos']['Row'];

/** Whitelisted volunteer fields the API exposes to NGO staff (Security & Access §37/§38). */
export interface PublicVolunteerInfo {
  id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  causes: string[] | null;
}

/** Public event projection enriched with the backend-computed accepted count. */
export type PublicEventRow = EventRow & { accepted_count: number };

/** NGO-facing application row with the permitted volunteer info embedded. */
export type NgoApplicationRow = ApplicationRow & { volunteer: PublicVolunteerInfo | null };

export interface NgoEventRoster {
  event: Pick<EventRow, 'id' | 'title' | 'start_at' | 'end_at' | 'capacity' | 'status'>;
  accepted_count: number;
  volunteers: Array<ApplicationRow & { volunteer: PublicVolunteerInfo | null }>;
}

/** Public NGO projection (GET /ngos/:ngoId/public — never includes contact). */
export type NgoPublicProfile = Pick<
  NgoProfileRow,
  'id' | 'name' | 'description' | 'causes' | 'region' | 'geo' | 'logo_url' | 'status' | 'created_at' | 'updated_at'
>;

export interface AuthMe {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface NgoMembership {
  ngo_id: string;
  role: 'admin' | 'coordinator';
  member_status: string;
  ngo: { id: string; name: string; status: string };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getAuthMe(token: string): Promise<AuthMe> {
  return (await apiClient<AuthMe>('/auth/me', { token })).data;
}

// ─── Volunteer profile ────────────────────────────────────────────────────────

/** Returns null when the signed-in volunteer has no profile yet (404 PROFILE_NOT_FOUND). */
export async function getMyVolunteerProfile(token: string): Promise<VolunteerProfileRow | null> {
  try {
    return (await apiClient<VolunteerProfileRow>('/volunteers/me/profile', { token })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createMyVolunteerProfile(token: string, body: unknown): Promise<VolunteerProfileRow> {
  return (await apiClient<VolunteerProfileRow>('/volunteers/me/profile', { method: 'POST', token, body })).data;
}

export async function updateMyVolunteerProfile(token: string, body: unknown): Promise<VolunteerProfileRow> {
  return (await apiClient<VolunteerProfileRow>('/volunteers/me/profile', { method: 'PATCH', token, body })).data;
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function listMyAvailability(token: string): Promise<AvailabilityRow[]> {
  return (await apiClient<AvailabilityRow[]>('/volunteers/me/availability', { token })).data;
}

export async function createMyAvailability(token: string, body: unknown): Promise<AvailabilityRow> {
  return (await apiClient<AvailabilityRow>('/volunteers/me/availability', { method: 'POST', token, body })).data;
}

export async function updateMyAvailability(token: string, availabilityId: string, body: unknown): Promise<AvailabilityRow> {
  return (
    await apiClient<AvailabilityRow>(`/volunteers/me/availability/${availabilityId}`, {
      method: 'PATCH',
      token,
      body,
    })
  ).data;
}

export async function deleteMyAvailability(token: string, availabilityId: string): Promise<void> {
  await apiClient<unknown>(`/volunteers/me/availability/${availabilityId}`, { method: 'DELETE', token });
}

// ─── Public events ────────────────────────────────────────────────────────────

export async function listPublicEvents(token: string): Promise<PublicEventRow[]> {
  return (await apiClient<PublicEventRow[]>('/events', { token })).data;
}

export async function getPublicEvent(token: string, eventId: string): Promise<PublicEventRow> {
  return (await apiClient<PublicEventRow>(`/events/${eventId}`, { token })).data;
}

// ─── Volunteer applications ───────────────────────────────────────────────────

export async function listMyApplications(token: string): Promise<ApplicationRow[]> {
  return (await apiClient<ApplicationRow[]>('/volunteers/me/applications', { token })).data;
}

export async function createApplication(token: string, eventId: string): Promise<ApplicationRow> {
  return (await apiClient<ApplicationRow>(`/events/${eventId}/applications`, { method: 'POST', token })).data;
}

export async function cancelMyApplication(token: string, applicationId: string): Promise<ApplicationRow> {
  return (
    await apiClient<ApplicationRow>(`/volunteers/me/applications/${applicationId}/cancel`, {
      method: 'PATCH',
      token,
    })
  ).data;
}

// ─── NGO membership ───────────────────────────────────────────────────────────

export async function getMyNgos(token: string): Promise<NgoMembership[]> {
  return (await apiClient<NgoMembership[]>('/ngos/me', { token })).data;
}

// ─── NGO profile ──────────────────────────────────────────────────────────────

export async function getNgoProfile(token: string, ngoId: string): Promise<NgoProfileRow> {
  return (await apiClient<NgoProfileRow>(`/ngos/${ngoId}/profile`, { token })).data;
}

/** Public projection only — the API never returns `contact` here. */
export async function getNgoPublicProfile(token: string, ngoId: string): Promise<NgoPublicProfile> {
  return (await apiClient<NgoPublicProfile>(`/ngos/${ngoId}/public`, { token })).data;
}

export async function updateNgoProfile(token: string, ngoId: string, body: unknown): Promise<NgoProfileRow> {
  return (await apiClient<NgoProfileRow>(`/ngos/${ngoId}/profile`, { method: 'PATCH', token, body })).data;
}

// ─── NGO events ───────────────────────────────────────────────────────────────

export async function listNgoEvents(token: string, ngoId: string): Promise<EventRow[]> {
  return (await apiClient<EventRow[]>(`/ngos/${ngoId}/events`, { token })).data;
}

export async function createNgoEvent(token: string, ngoId: string, body: unknown): Promise<EventRow> {
  return (await apiClient<EventRow>(`/ngos/${ngoId}/events`, { method: 'POST', token, body })).data;
}

export async function updateNgoEvent(token: string, ngoId: string, eventId: string, body: unknown): Promise<EventRow> {
  return (
    await apiClient<EventRow>(`/ngos/${ngoId}/events/${eventId}`, { method: 'PATCH', token, body })
  ).data;
}

export async function deleteNgoEvent(token: string, ngoId: string, eventId: string): Promise<void> {
  await apiClient<unknown>(`/ngos/${ngoId}/events/${eventId}`, { method: 'DELETE', token });
}

// ─── NGO applications ─────────────────────────────────────────────────────────

export async function listNgoApplications(token: string, ngoId: string): Promise<NgoApplicationRow[]> {
  return (await apiClient<NgoApplicationRow[]>(`/ngos/${ngoId}/applications`, { token })).data;
}

export async function decideNgoApplication(
  token: string,
  ngoId: string,
  applicationId: string,
  status: 'accepted' | 'waitlisted' | 'rejected'
): Promise<ApplicationRow> {
  return (
    await apiClient<ApplicationRow>(`/ngos/${ngoId}/applications/${applicationId}`, {
      method: 'PATCH',
      token,
      body: { status },
    })
  ).data;
}

// ─── NGO roster (accepted volunteers, view-only in Step 7) ────────────────────

export async function getNgoEventRoster(token: string, ngoId: string, eventId: string): Promise<NgoEventRoster> {
  return (
    await apiClient<NgoEventRoster>(`/ngos/${ngoId}/events/${eventId}/roster`, { token })
  ).data;
}
