/**
 * SevaSetu Shared Validation Schemas
 * Source of Truth: Technical Architecture & Security Guidelines
 */

import { z } from 'zod';
import {
  USER_ROLES,
  EVENT_STATUSES,
  EVENT_VISIBILITY,
  APPLICATION_STATUSES,
  EMERGENCY_URGENCY,
} from '@sevasetu/constants';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);
export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const userRoleSchema = z.enum([
  USER_ROLES.VOLUNTEER,
  USER_ROLES.NGO_COORDINATOR,
  USER_ROLES.NGO_ADMIN,
  USER_ROLES.PLATFORM_ADMIN,
]);

export const eventVisibilitySchema = z.enum([
  EVENT_VISIBILITY.PUBLIC,
  EVENT_VISIBILITY.NGO_ONLY,
]);

export const eventStatusSchema = z.enum([
  EVENT_STATUSES.DRAFT,
  EVENT_STATUSES.PUBLISHED,
  EVENT_STATUSES.IN_PROGRESS,
  EVENT_STATUSES.COMPLETED,
  EVENT_STATUSES.CANCELLED,
]);

export const createEventSchema = z.object({
  ngo_id: z.string().uuid(),
  title: z.string().min(3, 'Event title must be at least 3 characters').max(150),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  cause: z.string().min(2, 'Cause is required'),
  venue: z.string().min(2, 'Venue is required'),
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  capacity: z.number().int().positive('Capacity must be greater than zero'),
  visibility: eventVisibilitySchema,
  status: eventStatusSchema,
  registration_mode: z.enum(['open', 'approval_required']),
}).strict().refine((event) => Date.parse(event.start_at) < Date.parse(event.end_at), {
  message: 'Event end must be after event start',
  path: ['end_at'],
});

const volunteerProfileFields = {
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  photo_url: z.string().url().nullable(),
  bio: z.string().max(500).optional(),
  home_geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable(),
  max_distance_km: z.number().min(0).max(9999.99).nullable(),
  causes: z.array(z.string()).nullable(),
  emergency_available: z.boolean(),
  profile_visibility: z.boolean(),
  history_visibility: z.boolean(),
  notification_preferences: jsonObjectSchema.nullable(),
};

export const createVolunteerProfileSchema = z.object(volunteerProfileFields).strict();
export const updateVolunteerProfileSchema = z.object({
  name: volunteerProfileFields.name.optional(),
  photo_url: volunteerProfileFields.photo_url.optional(),
  bio: volunteerProfileFields.bio,
  home_geo: volunteerProfileFields.home_geo.optional(),
  max_distance_km: volunteerProfileFields.max_distance_km.optional(),
  causes: volunteerProfileFields.causes.optional(),
  emergency_available: volunteerProfileFields.emergency_available.optional(),
  profile_visibility: volunteerProfileFields.profile_visibility.optional(),
  history_visibility: volunteerProfileFields.history_visibility.optional(),
  notification_preferences: volunteerProfileFields.notification_preferences.optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'At least one profile field must be provided',
});

const availabilityTimeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/,
  'Time must use HH:mm or HH:mm:ss format'
);
const availabilityDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Date must be a valid calendar date');

const availabilityFields = {
  weekday: z.number().int().min(0).max(6).nullable(),
  start_time: availabilityTimeSchema.nullable(),
  end_time: availabilityTimeSchema.nullable(),
  available_date: availabilityDateSchema.nullable(),
  is_available: z.boolean(),
  recurrence: z.string().nullable(),
};
const availabilityObjectSchema = z.object(availabilityFields).strict();

function validateAvailabilityShape(
  slot: Pick<z.infer<typeof availabilityObjectSchema>, 'weekday' | 'start_time' | 'end_time' | 'available_date'>,
  context: z.RefinementCtx
) {
  const isWeeklyWindow = slot.available_date === null
    && slot.weekday !== null
    && slot.start_time !== null
    && slot.end_time !== null;
  const isDateException = slot.available_date !== null
    && slot.weekday === null
    && ((slot.start_time === null) === (slot.end_time === null));

  if (!isWeeklyWindow && !isDateException) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either a weekly weekday/time window or a date-specific exception',
    });
  }

  if (slot.start_time !== null && slot.end_time !== null && slot.start_time >= slot.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'End time must be after start time',
    });
  }
}

export const createAvailabilitySchema = availabilityObjectSchema.superRefine(validateAvailabilityShape);
export const updateAvailabilitySchema = z.object({
  weekday: availabilityFields.weekday.optional(),
  start_time: availabilityFields.start_time.optional(),
  end_time: availabilityFields.end_time.optional(),
  available_date: availabilityFields.available_date.optional(),
  is_available: availabilityFields.is_available.optional(),
  recurrence: availabilityFields.recurrence.optional(),
}).strict().refine((slot) => Object.keys(slot).length > 0, {
  message: 'At least one availability field must be provided',
});

export const applicationDecisionSchema = z.object({
  status: z.enum([
    APPLICATION_STATUSES.ACCEPTED,
    APPLICATION_STATUSES.WAITLISTED,
    APPLICATION_STATUSES.REJECTED,
  ]),
}).strict();

export const emergencyRequestSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10),
  event_id: z.string().uuid(),
  required_skills: z.array(z.string()).min(1, 'At least one skill is required'),
  headcount: z.number().int().positive(),
  urgency: z.enum([
    EMERGENCY_URGENCY.LOW,
    EMERGENCY_URGENCY.MEDIUM,
    EMERGENCY_URGENCY.HIGH,
    EMERGENCY_URGENCY.CRITICAL,
  ]),
});
