/**
 * SevaSetu Core Shared TypeScript Types & Interfaces
 * Source of Truth: Backend Schema & Technical Architecture Document
 */

import {
  USER_ROLES,
  USER_STATUSES,
  EVENT_STATUSES,
  EVENT_VISIBILITY,
  APPLICATION_STATUSES,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_STATUSES,
  ROSTER_STATUSES,
  ATTENDANCE_STATUSES,
  EMERGENCY_VOLUNTEER_STATES,
  EMERGENCY_URGENCY,
  EMERGENCY_STATUSES,
} from '@sevasetu/constants';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type PostGISValue = unknown;
type InsertWithDefaults<Row, Defaults extends keyof Row> = Omit<Row, Defaults> & Partial<Pick<Row, Defaults>>;
type DatabaseRelationship<
  Name extends string,
  Columns extends string[],
  ReferencedRelation extends string,
  ReferencedColumns extends string[],
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne?: OneToOne;
  referencedRelation: ReferencedRelation;
  referencedColumns: ReferencedColumns;
};
type SupabaseTable<Row, Insert, Update = Partial<Insert>, Relationships extends object[] = []> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: { [Key in keyof Insert]: Insert[Key] };
  Update: { [Key in keyof Update]: Update[Key] };
  Relationships: Relationships;
};
type CoreTable<Row, Defaults extends keyof Row, Relationships extends object[] = []> = SupabaseTable<
  Row,
  InsertWithDefaults<Row, Defaults>,
  Partial<Row>,
  Relationships
>;

// --- User & Role Model ---
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

export interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

// --- Volunteer Entities ---
export interface VolunteerProfile {
  user_id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  home_geo: unknown;
  max_distance_km: number | null;
  causes: string[] | null;
  emergency_available: boolean;
  profile_visibility: boolean;
  history_visibility: boolean;
  notification_preferences: Json | null;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  active: boolean;
}

export interface VolunteerSkill {
  volunteer_id: string;
  skill_id: string;
  level: string;
  created_at: string;
}

export interface Certification {
  id: string;
  volunteer_id: string;
  name: string;
  issuer: string | null;
  expiry: string | null;
  document_url: string | null;
  verified_by_ngo_id: string | null;
  verification_status: 'self_declared' | 'ngo_verified' | 'expired' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Availability {
  id: string;
  volunteer_id: string;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  available_date: string | null;
  is_available: boolean;
  recurrence: string | null;
  created_at: string;
}

// --- NGO Entities ---
export interface NGO {
  id: string;
  name: string;
  description: string | null;
  causes: string[] | null;
  region: string | null;
  geo: unknown;
  contact: Json | null;
  logo_url: string | null;
  status: NGOStatus;
  created_at: string;
  updated_at: string;
}

export type NGOStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export interface NGOMember {
  ngo_id: string;
  user_id: string;
  role: 'admin' | 'coordinator';
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NGOAffiliation {
  id: string;
  ngo_id: string;
  volunteer_id: string;
  status: NGOAffiliationStatus;
  invited_at: string;
  accepted_at: string | null;
  ended_at: string | null;
}

export type NGOAffiliationStatus = 'invited' | 'active' | 'rejected' | 'ended';

// --- Event Entities ---
export type EventStatus = (typeof EVENT_STATUSES)[keyof typeof EVENT_STATUSES];
export type EventVisibility = (typeof EVENT_VISIBILITY)[keyof typeof EVENT_VISIBILITY];

export interface Event {
  id: string;
  ngo_id: string;
  title: string;
  description: string;
  cause: string;
  venue: string;
  geo: unknown;
  start_at: string;
  end_at: string;
  visibility: EventVisibility;
  capacity: number;
  status: EventStatus;
  registration_mode: 'open' | 'approval_required';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventRequirement {
  id: string;
  event_id: string;
  role: string;
  headcount: number;
  required_skill_ids: string[];
  required_cert_names: string[];
  min_experience: number;
  created_at: string;
}

export interface Shift {
  id: string;
  event_id: string;
  requirement_id: string;
  start_at: string;
  end_at: string;
  headcount: number;
  created_at: string;
}

// --- Applications & Matching ---
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[keyof typeof APPLICATION_STATUSES];

export interface Application {
  id: string;
  event_id: string;
  volunteer_id: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export type EventRegistrationMode = 'open' | 'approval_required';

export interface Database {
  public: {
    Tables: {
      users: CoreTable<User, 'id' | 'role' | 'status' | 'created_at' | 'updated_at'>;
      volunteer_profiles: CoreTable<
        VolunteerProfile,
        'created_at' | 'updated_at' | 'emergency_available',
        [DatabaseRelationship<'volunteer_profiles_user_id_fkey', ['user_id'], 'users', ['id'], true>]
      >;
      skills: CoreTable<Skill, 'id' | 'active'>;
      volunteer_skills: CoreTable<
        VolunteerSkill,
        'created_at',
        [
          DatabaseRelationship<'volunteer_skills_volunteer_id_fkey', ['volunteer_id'], 'volunteer_profiles', ['user_id']>,
          DatabaseRelationship<'volunteer_skills_skill_id_fkey', ['skill_id'], 'skills', ['id']>,
        ]
      >;
      certifications: CoreTable<
        Certification,
        'id' | 'created_at' | 'updated_at',
        [
          DatabaseRelationship<'certifications_volunteer_id_fkey', ['volunteer_id'], 'volunteer_profiles', ['user_id']>,
          DatabaseRelationship<'certifications_verified_by_ngo_id_fkey', ['verified_by_ngo_id'], 'ngos', ['id']>,
        ]
      >;
      availability: CoreTable<
        Availability,
        'id' | 'created_at',
        [DatabaseRelationship<'availability_volunteer_id_fkey', ['volunteer_id'], 'volunteer_profiles', ['user_id']>]
      >;
      ngos: CoreTable<NGO, 'id' | 'created_at' | 'updated_at'>;
      ngo_members: CoreTable<
        NGOMember,
        'created_at' | 'updated_at',
        [
          DatabaseRelationship<'ngo_members_ngo_id_fkey', ['ngo_id'], 'ngos', ['id']>,
          DatabaseRelationship<'ngo_members_user_id_fkey', ['user_id'], 'users', ['id']>,
        ]
      >;
      ngo_affiliations: CoreTable<
        NGOAffiliation,
        'id' | 'invited_at' | 'accepted_at' | 'ended_at',
        [
          DatabaseRelationship<'ngo_affiliations_ngo_id_fkey', ['ngo_id'], 'ngos', ['id']>,
          DatabaseRelationship<'ngo_affiliations_volunteer_id_fkey', ['volunteer_id'], 'volunteer_profiles', ['user_id']>,
        ]
      >;
      events: CoreTable<
        Event,
        'id' | 'created_at' | 'updated_at',
        [
          DatabaseRelationship<'events_ngo_id_fkey', ['ngo_id'], 'ngos', ['id']>,
          DatabaseRelationship<'events_created_by_fkey', ['created_by'], 'users', ['id']>,
        ]
      >;
      event_requirements: CoreTable<
        EventRequirement,
        'id' | 'created_at',
        [DatabaseRelationship<'event_requirements_event_id_fkey', ['event_id'], 'events', ['id']>]
      >;
      shifts: CoreTable<
        Shift,
        'id' | 'created_at',
        [
          DatabaseRelationship<'shifts_event_id_fkey', ['event_id'], 'events', ['id']>,
          DatabaseRelationship<'shifts_requirement_id_fkey', ['requirement_id'], 'event_requirements', ['id']>,
          DatabaseRelationship<'shifts_requirement_belongs_to_event_fkey', ['event_id', 'requirement_id'], 'event_requirements', ['event_id', 'id']>,
        ]
      >;
      applications: CoreTable<
        Application,
        'id' | 'created_at' | 'updated_at',
        [
          DatabaseRelationship<'applications_event_id_fkey', ['event_id'], 'events', ['id']>,
          DatabaseRelationship<'applications_volunteer_id_fkey', ['volunteer_id'], 'volunteer_profiles', ['user_id']>,
        ]
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      event_registration_mode: EventRegistrationMode;
    };
    CompositeTypes: Record<string, never>;
  };
}

export interface MatchRun {
  id: string;
  event_id: string;
  run_by: string;
  config_snapshot: Record<string, any>;
  created_at: string;
}

export interface MatchResult {
  id: string;
  match_run_id: string;
  volunteer_id: string;
  eligible: boolean;
  rank: number;
  score: number;
  criteria_results: {
    skills?: { status: string; score: number };
    availability?: { status: string; score: number };
    proximity?: { status: string; distance_km?: number };
    experience?: { status: string };
    reliability?: { status: string };
  };
  explanation: string;
  created_at: string;
}

// --- Rosters & Assignments ---
export type RosterStatus = (typeof ROSTER_STATUSES)[keyof typeof ROSTER_STATUSES];
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[keyof typeof ASSIGNMENT_TYPES];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[keyof typeof ASSIGNMENT_STATUSES];

export interface Roster {
  id: string;
  event_id: string;
  status: RosterStatus;
  generated_at: string;
  finalized_at?: string | null;
  conflict_report?: Record<string, any> | null;
  finalized_by?: string | null;
}

export interface Assignment {
  id: string;
  event_id: string;
  shift_id: string;
  volunteer_id: string;
  type: AssignmentType;
  status: AssignmentStatus;
  match_result_id?: string | null;
  created_at: string;
}

// --- Attendance & Tasks ---
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[keyof typeof ATTENDANCE_STATUSES];

export interface Attendance {
  id: string;
  assignment_id: string;
  volunteer_id: string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  status: AttendanceStatus;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface Task {
  id: string;
  event_id: string;
  assignment_id: string;
  description: string;
  status: 'pending' | 'completed' | 'cancelled';
  completed_at?: string | null;
  verified_by?: string | null;
}

// --- Reliability & Karma ---
export interface ReliabilityRecord {
  id: string;
  volunteer_id: string;
  event_id: string;
  assignment_id: string;
  outcome: 'attended' | 'no_show' | 'cancelled_with_notice' | 'cancelled_late';
  cancellation_notice_hours?: number | null;
  created_at: string;
}

export interface KarmaTransaction {
  id: string;
  volunteer_id: string;
  event_id: string;
  attendance_id: string;
  points: number;
  reason: string;
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
  active: boolean;
}

export interface VolunteerAchievement {
  id: string;
  volunteer_id: string;
  achievement_id: string;
  earned_at: string;
}

// --- Emergency Operations ---
export type EmergencyUrgency = (typeof EMERGENCY_URGENCY)[keyof typeof EMERGENCY_URGENCY];
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[keyof typeof EMERGENCY_STATUSES];
export type EmergencyVolunteerState =
  (typeof EMERGENCY_VOLUNTEER_STATES)[keyof typeof EMERGENCY_VOLUNTEER_STATES];

export interface EmergencyRequest {
  id: string;
  ngo_id: string;
  event_id: string;
  title: string;
  description: string;
  geo?: { lat: number; lng: number } | null;
  required_skills: string[];
  headcount: number;
  urgency: EmergencyUrgency;
  status: EmergencyStatus;
  created_by: string;
  created_at: string;
}

export interface EmergencyBroadcast {
  id: string;
  emergency_id: string;
  sent_by: string;
  sent_at: string;
  target_filter: Record<string, any>;
  recipient_count: number;
}

export interface EmergencyResponse {
  id: string;
  broadcast_id: string;
  volunteer_id: string;
  response: 'accepted' | 'declined';
  responded_at: string;
  is_backup: boolean;
  deployed_at?: string | null;
  deployed_by?: string | null;
  checked_in_at?: string | null;
}

// --- Transparency & Indicators ---
export interface NGOTransparencyRecord {
  id: string;
  ngo_id: string;
  type: string;
  content: Record<string, any> | string;
  source: 'platform' | 'ngo';
  verification_status: 'unverified' | 'platform_verified';
  created_at: string;
}

export interface NGOIndicators {
  ngo_id: string;
  activity_indicator: string;
  completion_indicator: string;
  participation_indicator: string;
  consistency_indicator: string;
  information_completeness: string;
  computed_at: string;
}

// --- Notifications ---
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, any>;
  channel: 'in_app' | 'email';
  status: 'sent' | 'delivered' | 'failed' | 'read';
  created_at: string;
  read_at?: string | null;
}

// --- Event Intelligence Agent (Ephemeral / Firebase) ---
export interface AgentSession {
  sessionId: string;
  userId: string;
  role: UserRole;
  ngoId?: string | null;
  eventId?: string | null;
  mode: 'event_guidance' | 'historical_analysis' | 'preparation' | 'risk_emergency' | 'volunteer_assistant' | 'ngo_assistant';
  createdAt: string;
  status: 'active' | 'closed';
}

export interface AgentMessage {
  messageId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AgentRecommendation {
  answer: string;
  basis: string[];
  uncertainty: 'Low' | 'Moderate' | 'High';
  suggestions?: string[];
}

export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}
