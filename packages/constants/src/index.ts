/**
 * SevaSetu System Constants
 * Source of Truth: Docs/seva setu technical architecture document.pdf,
 * Docs/seva setu frontend specifications.pdf, Docs/seva setu backend schema.docx
 */

export const USER_ROLES = {
  VOLUNTEER: 'volunteer',
  NGO_COORDINATOR: 'ngo_coordinator',
  NGO_ADMIN: 'ngo_admin',
  PLATFORM_ADMIN: 'platform_admin',
} as const;

export const USER_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled',
} as const;

export const EVENT_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const EVENT_VISIBILITY = {
  PUBLIC: 'public',
  NGO_ONLY: 'ngo_only',
} as const;

export const APPLICATION_STATUSES = {
  INTERESTED: 'interested',
  ACCEPTED: 'accepted',
  WAITLISTED: 'waitlisted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export const ASSIGNMENT_TYPES = {
  PRIMARY: 'primary',
  BACKUP: 'backup',
} as const;

export const ASSIGNMENT_STATUSES = {
  PROPOSED: 'proposed',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  DEPLOYED: 'deployed',
  CANCELLED: 'cancelled',
} as const;

export const ROSTER_STATUSES = {
  DRAFT: 'draft',
  FINAL: 'final',
} as const;

export const ATTENDANCE_STATUSES = {
  ATTENDED: 'attended',
  NO_SHOW: 'no_show',
  EXCUSED: 'excused',
  CANCELLED: 'cancelled',
} as const;

// Step 9 — recorded participation outcomes (per event+volunteer).
export const PARTICIPATION_STATUSES = {
  ATTENDED: 'attended',
  LATE: 'late',
  NO_SHOW: 'no_show',
  CANCELLED: 'cancelled',
} as const;

// Who caused a cancellation. Only 'volunteer' is ever penalized in reliability.
export const CANCELLATION_SOURCES = {
  VOLUNTEER: 'volunteer',
  NGO: 'ngo',
  EVENT: 'event',
  SYSTEM: 'system',
} as const;

export const EMERGENCY_VOLUNTEER_STATES = {
  ALERTED: 'alerted',
  CONFIRMED: 'confirmed',
  DEPLOYED: 'deployed',
} as const;

export const EMERGENCY_URGENCY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export const EMERGENCY_STATUSES = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
} as const;

export const BRAND_COLORS = {
  PRIMARY_GREEN: '#0B8F68',
  DARK_TEAL: '#06343B',
  DEEP_GREEN: '#087A5A',
  MINT: '#DDF5EA',
  LIGHT_GREEN: '#EAF8F2',
  SOFT_BLUE: '#EAF4FB',
  SOFT_ORANGE: '#FFF1D8',
  SOFT_RED: '#FDECEC',
  BACKGROUND: '#F8FAF9',
  SURFACE: '#FFFFFF',
  BORDER: '#DDE4E1',
  TEXT_PRIMARY: '#122326',
  TEXT_SECONDARY: '#526467',
  TEXT_MUTED: '#7C8B8D',
} as const;
