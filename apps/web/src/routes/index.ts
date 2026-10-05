/**
 * SevaSetu Core Route Definitions
 * Source of Truth: Section 66 (Core Page Inventory) of Frontend Specifications
 */

export const ROUTES = {
  PUBLIC: {
    HOME: '/',
    EVENTS: '/events',
    EVENT_DETAILS: (id: string) => `/events/${id}`,
    NGOS: '/ngos',
    NGO_DETAILS: (id: string) => `/ngos/${id}`,
    ABOUT: '/about',
    LOGIN: '/login',
    SIGNUP: '/signup',
  },
  VOLUNTEER: {
    DASHBOARD: '/volunteer/dashboard',
    DISCOVER: '/volunteer/discover',
    EVENTS: '/volunteer/events',
    EVENT_DETAILS: (id: string) => `/volunteer/events/${id}`,
    IMPACT: '/volunteer/impact',
    KARMA: '/volunteer/karma',
    PROFILE: '/volunteer/profile',
    AGENT: '/volunteer/agent',
    SETTINGS: '/volunteer/settings',
  },
  NGO: {
    DASHBOARD: '/ngo/dashboard',
    PROFILE: '/ngo/profile',
    EVENTS: '/ngo/events',
    CREATE_EVENT: '/ngo/events/create',
    EVENT_DETAILS: (id: string) => `/ngo/events/${id}`,
    MATCHING: (id: string) => `/ngo/events/${id}/matching`,
    ROSTER: (id: string) => `/ngo/events/${id}/roster`,
    VOLUNTEERS: '/ngo/volunteers',
    EMERGENCY: '/ngo/emergency',
    EMERGENCY_DETAILS: (id: string) => `/ngo/emergency/${id}`,
    ANALYTICS: '/ngo/analytics',
    TRANSPARENCY: '/ngo/transparency',
    AGENT: '/ngo/agent',
    SETTINGS: '/ngo/settings',
    BILLING: '/ngo/billing',
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    NGOS: '/admin/ngos',
    EVENTS: '/admin/events',
    REPORTS: '/admin/reports',
    ANALYTICS: '/admin/analytics',
    SETTINGS: '/admin/settings',
  },
} as const;
