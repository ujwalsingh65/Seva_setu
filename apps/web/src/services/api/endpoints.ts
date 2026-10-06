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

export interface OpportunityQuery {
  search?: string;
  cause?: string;
  from?: string;
  to?: string;
  type?: 'standard' | 'emergency';
  urgency?: string;
  registration_mode?: 'open' | 'approval_required';
  has_capacity?: boolean;
}

export async function listPublicEvents(token: string, query: OpportunityQuery = {}): Promise<PublicEventRow[]> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.cause) params.set('cause', query.cause);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.type) params.set('type', query.type);
  if (query.urgency) params.set('urgency', query.urgency);
  if (query.registration_mode) params.set('registration_mode', query.registration_mode);
  if (query.has_capacity) params.set('has_capacity', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return (await apiClient<PublicEventRow[]>(`/events${suffix}`, { token })).data;
}

export async function getPublicEvent(token: string, eventId: string): Promise<PublicEventRow> {
  return (await apiClient<PublicEventRow>(`/events/${eventId}`, { token })).data;
}

export interface PublicRequirement {
  role: string;
  headcount: number;
  required_skills: string[];
  required_certifications: string[];
  min_experience: number;
}

export async function getPublicEventRequirements(token: string, eventId: string): Promise<PublicRequirement[]> {
  return (await apiClient<PublicRequirement[]>(`/events/${eventId}/requirements`, { token })).data;
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

// ---------------------------------------------------------------------------
// Step 8 — Explainable weighted matching
// ---------------------------------------------------------------------------

export type MatchFactorStatus = 'full' | 'partial' | 'none' | 'not_assessable';

export interface MatchListFactor {
  score: number;
  weight: number;
  status: MatchFactorStatus;
  label?: string;
  detail?: string;
}

export interface MatchSkillFactor extends MatchListFactor {
  matched: string[];
  missing: string[];
}

export interface MatchFactors {
  skills: MatchSkillFactor;
  certifications: MatchSkillFactor;
  availability: MatchListFactor;
  experience: MatchListFactor;
  proximity: MatchListFactor;
  reliability: MatchListFactor;
}

export interface EventMatch {
  volunteer_id: string;
  score: number;
  volunteer: PublicVolunteerInfo;
  factors: MatchFactors;
}

export interface NgoEventMatches {
  event_id: string;
  total_candidates: number;
  matches: EventMatch[];
}

export async function getNgoEventMatches(
  token: string,
  ngoId: string,
  eventId: string,
): Promise<NgoEventMatches> {
  const { data } = await apiClient<NgoEventMatches>(
    `/ngos/${ngoId}/events/${eventId}/matches`,
    { token },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Step 15 — NGO transparency & activity profile
// ---------------------------------------------------------------------------

export interface NgoTransparency {
  organization: { id: string; name: string; description: string | null; causes: string[] | null; region: string | null };
  transparency: { activity_source: string; service_hours_status: 'recorded' | 'not_recorded'; verification_note: string };
  activity: {
    completed_events: number;
    verified_participations: number;
    unique_volunteers: number;
    verified_service_hours: number | null;
    emergency_events_supported: number;
    returning_volunteers: number;
  };
  recent_events: Array<{ event_id: string; title: string | null; event_type: string | null; start_at: string | null; participation_count: number; service_hours: number | null }>;
}

export async function getNgoTransparency(token: string, ngoId: string): Promise<NgoTransparency> {
  return (await apiClient<NgoTransparency>(`/ngos/${ngoId}/transparency`, { token })).data;
}

// ---------------------------------------------------------------------------
// Step 14 — Karma / verified community impact
// ---------------------------------------------------------------------------

export interface KarmaResult {
  total_karma: number;
  level: string;
  participated_events: number;
  verified_service_hours: number | null;
  emergency_contributions: number;
  breakdown: { participation: number; verified_service: number; emergency_contribution: number };
  recent_contributions: Array<{
    event_id: string;
    title: string | null;
    start_at: string | null;
    event_type: string | null;
    points: number;
    reason: string;
    hours: number | null;
  }>;
}

export async function getMyKarma(token: string): Promise<KarmaResult> {
  return (await apiClient<KarmaResult>('/volunteers/me/karma', { token })).data;
}

// ---------------------------------------------------------------------------
// Step 12 — Engagement & retention analytics
// ---------------------------------------------------------------------------

export interface EngagementAnalytics {
  volunteer_id: string;
  status: 'new' | 'active' | 'engaged' | 'at_risk' | 'inactive';
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

export interface NgoEngagementAnalytics {
  generated_for: { window_days: number; previous_window_days: number };
  volunteers: { total: number; active: number; engaged: number; at_risk: number; inactive: number; new: number };
  returning_volunteer_rate: number | null;
  attendance_rate: number | null;
  trend: { current_period: number; previous_period: number; direction: 'up' | 'down' | 'flat' };
  insights: string[];
}

export async function getMyEngagement(token: string): Promise<EngagementAnalytics> {
  return (await apiClient<EngagementAnalytics>('/volunteers/me/engagement', { token })).data;
}

export async function getNgoEngagementAnalytics(token: string, ngoId: string): Promise<NgoEngagementAnalytics> {
  return (await apiClient<NgoEngagementAnalytics>(`/ngos/${ngoId}/analytics/engagement`, { token })).data;
}

// ---------------------------------------------------------------------------
// Step 11 — Rapid emergency mobilization
// ---------------------------------------------------------------------------

export interface NgoEmergencyRow {
  id: string;
  title: string;
  venue: string;
  start_at: string;
  end_at: string;
  urgency: 'low' | 'medium' | 'high' | 'critical' | null;
  response_deadline: string | null;
  status: string;
  created_at: string;
}

export interface EmergencyStaffing {
  required: number;
  confirmed: number;
  pending: number;
  backups: number;
  unfilled: number;
  staffing_status: 'unfilled' | 'partially_filled' | 'filled';
}

export interface MyEmergencyInvitation {
  id: string;
  event_id: string;
  requirement_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  invited_at: string;
  expires_at: string;
  responded_at: string | null;
  role: string | null;
  emergency: { id: string; title: string; venue: string; start_at: string; end_at: string; urgency: string | null; ngo_id: string } | null;
}

export async function listNgoEmergencies(token: string, ngoId: string): Promise<NgoEmergencyRow[]> {
  return (await apiClient<NgoEmergencyRow[]>(`/ngos/${ngoId}/emergencies`, { token })).data;
}

export async function createNgoEmergency(token: string, ngoId: string, body: unknown): Promise<{ id: string; required: number }> {
  return (await apiClient<{ id: string; required: number }>(`/ngos/${ngoId}/emergencies`, { method: 'POST', token, body })).data;
}

export async function getNgoEmergency(token: string, ngoId: string, emergencyId: string): Promise<{ emergency: NgoEmergencyRow; staffing: EmergencyStaffing }> {
  return (await apiClient<{ emergency: NgoEmergencyRow; staffing: EmergencyStaffing }>(`/ngos/${ngoId}/emergencies/${emergencyId}`, { token })).data;
}

export async function mobilizeEmergency(token: string, ngoId: string, emergencyId: string): Promise<{ event_id: string; primary_invitations: number; backups: number }> {
  return (
    await apiClient<{ event_id: string; primary_invitations: number; backups: number }>(
      `/ngos/${ngoId}/emergencies/${emergencyId}/mobilize`,
      { method: 'POST', token },
    )
  ).data;
}

export async function cancelEmergency(token: string, ngoId: string, emergencyId: string): Promise<void> {
  await apiClient<unknown>(`/ngos/${ngoId}/emergencies/${emergencyId}/cancel`, { method: 'POST', token });
}

export async function listMyEmergencyInvitations(token: string): Promise<MyEmergencyInvitation[]> {
  return (await apiClient<MyEmergencyInvitation[]>('/volunteers/me/emergency-invitations', { token })).data;
}

export async function respondToEmergencyInvitation(
  token: string,
  invitationId: string,
  action: 'accept' | 'decline',
): Promise<unknown> {
  return (
    await apiClient<unknown>(`/volunteers/me/emergency-invitations/${invitationId}/${action}`, {
      method: 'POST',
      token,
    })
  ).data;
}

// ---------------------------------------------------------------------------
// Step 10 — Automated shift & roster generator
// ---------------------------------------------------------------------------

export interface ScheduledAssignment {
  id: string;
  event_id: string;
  shift_id: string;
  volunteer_id: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  explanation: string | null;
  created_at: string;
  updated_at: string;
  volunteer: PublicVolunteerInfo | null;
}

export interface NgoScheduledShift {
  id: string;
  start_at: string;
  end_at: string;
  headcount: number;
  role: string | null;
  assigned_count: number;
  unfilled: number;
  assignments: ScheduledAssignment[];
}

export interface NgoEventSchedule {
  event: { id: string; title: string; start_at: string; end_at: string; status: string };
  shifts: NgoScheduledShift[];
}

export interface RosterGenerationResult {
  event_id: string;
  generated: number;
  gaps: Array<{ shift_id: string; role: string; required: number; assigned: number; unfilled: number; reason: string }>;
  rejected_shifts: Array<{ shift_id: string; reason: string }>;
}

export interface MyScheduleRow {
  assignment_id: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  role: string | null;
  shift_start: string;
  shift_end: string;
  event: { id: string; title: string; venue: string; start_at: string; end_at: string };
}

export async function getNgoEventSchedule(token: string, ngoId: string, eventId: string): Promise<NgoEventSchedule> {
  return (await apiClient<NgoEventSchedule>(`/ngos/${ngoId}/events/${eventId}/schedule`, { token })).data;
}

export async function generateEventRoster(token: string, ngoId: string, eventId: string): Promise<RosterGenerationResult> {
  return (
    await apiClient<RosterGenerationResult>(`/ngos/${ngoId}/events/${eventId}/roster/generate`, {
      method: 'POST',
      token,
    })
  ).data;
}

export async function confirmEventRoster(token: string, ngoId: string, eventId: string): Promise<{ confirmed: number }> {
  return (
    await apiClient<{ confirmed: number }>(`/ngos/${ngoId}/events/${eventId}/roster/confirm`, {
      method: 'POST',
      token,
    })
  ).data;
}

export async function removeRosterAssignment(
  token: string,
  ngoId: string,
  eventId: string,
  assignmentId: string,
): Promise<void> {
  await apiClient<unknown>(`/ngos/${ngoId}/events/${eventId}/roster/assignments/${assignmentId}`, {
    method: 'DELETE',
    token,
  });
}

export async function reassignRosterAssignment(
  token: string,
  ngoId: string,
  eventId: string,
  assignmentId: string,
  volunteerId: string,
): Promise<unknown> {
  return (
    await apiClient<unknown>(`/ngos/${ngoId}/events/${eventId}/roster/assignments/${assignmentId}`, {
      method: 'PATCH',
      token,
      body: { volunteer_id: volunteerId },
    })
  ).data;
}

export async function getMySchedule(token: string): Promise<MyScheduleRow[]> {
  return (await apiClient<MyScheduleRow[]>('/volunteers/me/schedule', { token })).data;
}

// ---------------------------------------------------------------------------
// Step 9 — Participation recording + explainable reliability
// ---------------------------------------------------------------------------

export type ParticipationRow = Database['public']['Tables']['participations']['Row'];

export type ReliabilityStatus = 'insufficient_data' | 'provisional' | 'established';

export interface ReliabilityHistory {
  eligible_events: number;
  attended: number;
  late: number;
  no_show: number;
  volunteer_cancelled: number;
  event_cancelled: number;
}

export interface ReliabilityFactor {
  score: number;
  weight: number;
  earned: number;
  explanation: string;
}

export interface ReliabilityResult {
  volunteer_id: string;
  score: number | null;
  status: ReliabilityStatus;
  label: string;
  history: ReliabilityHistory;
  factors: {
    attendance: ReliabilityFactor;
    no_show: ReliabilityFactor;
    cancellations: ReliabilityFactor;
    consistency: ReliabilityFactor;
  } | null;
  minimum_evidence: number;
  explanation: string;
}

export interface NgoEventParticipation {
  event: { id: string; title: string; status: string };
  volunteers: Array<{
    id: string;
    event_id: string;
    volunteer_id: string;
    status: string;
    created_at: string;
    updated_at: string;
    volunteer: PublicVolunteerInfo | null;
    participation: ParticipationRow | null;
  }>;
}

export interface ParticipationOutcomeInput {
  volunteer_id: string;
  status: 'attended' | 'late' | 'no_show' | 'cancelled';
  cancellation_source?: 'volunteer' | 'ngo' | 'event' | 'system' | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  participation_hours?: number | null;
}

/** The signed-in volunteer's own reliability record. */
export async function getMyReliability(token: string): Promise<ReliabilityResult> {
  return (await apiClient<ReliabilityResult>('/volunteers/me/reliability', { token })).data;
}

/** The signed-in volunteer's own participation history. */
export async function getMyParticipation(token: string): Promise<ParticipationRow[]> {
  return (await apiClient<ParticipationRow[]>('/volunteers/me/participation', { token })).data;
}

export async function getNgoEventParticipation(
  token: string,
  ngoId: string,
  eventId: string,
): Promise<NgoEventParticipation> {
  return (
    await apiClient<NgoEventParticipation>(`/ngos/${ngoId}/events/${eventId}/participation`, { token })
  ).data;
}

export async function recordNgoParticipation(
  token: string,
  ngoId: string,
  eventId: string,
  outcomes: ParticipationOutcomeInput[],
): Promise<ParticipationRow[]> {
  return (
    await apiClient<ParticipationRow[]>(`/ngos/${ngoId}/events/${eventId}/participation`, {
      method: 'PUT',
      token,
      body: { outcomes },
    })
  ).data;
}
