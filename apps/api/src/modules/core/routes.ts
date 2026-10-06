import { z } from 'zod';
import { Router, type Request } from 'express';
import {
  APPLICATION_STATUSES,
  EVENT_STATUSES,
  EVENT_VISIBILITY,
  USER_ROLES,
} from '@sevasetu/constants';
import {
  applicationDecisionSchema,
  createEventSchema,
  createAvailabilitySchema,
  createVolunteerProfileSchema,
  jsonObjectSchema,
  updateAvailabilitySchema,
  updateVolunteerProfileSchema,
} from '@sevasetu/validation';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import type { Database } from '@sevasetu/shared-types';
import { countAcceptedByEvent, projectVolunteerInfo, selectAccepted, VOLUNTEER_PUBLIC_COLUMNS } from './volunteerInfo.js';

const router = Router();
const eventColumns =
  'id, ngo_id, title, description, cause, venue, geo, start_at, end_at, visibility, capacity, status, registration_mode, created_by, created_at, updated_at';

const updateEventSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  description: z.string().min(10).optional(),
  cause: z.string().min(2).optional(),
  venue: z.string().min(2).optional(),
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  capacity: z.number().int().positive().optional(),
  visibility: z.enum([EVENT_VISIBILITY.PUBLIC, EVENT_VISIBILITY.NGO_ONLY]).optional(),
  status: z.enum([
    EVENT_STATUSES.DRAFT,
    EVENT_STATUSES.PUBLISHED,
    EVENT_STATUSES.IN_PROGRESS,
    EVENT_STATUSES.COMPLETED,
    EVENT_STATUSES.CANCELLED,
  ]).optional(),
  registration_mode: z.enum(['open', 'approval_required']).optional(),
}).strict().refine((event) => Object.keys(event).length > 0, {
  message: 'At least one event field must be provided',
}).refine((event) => !event.start_at || !event.end_at || Date.parse(event.start_at) < Date.parse(event.end_at), {
  message: 'Event end must be after event start',
  path: ['end_at'],
});

const updateNgoProfileSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  causes: z.array(z.string()).nullable().optional(),
  region: z.string().nullable().optional(),
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  contact: jsonObjectSchema.nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'At least one NGO profile field must be provided',
});

function pointToEwkt(
  point: { lat: number; lng: number } | null | undefined
): string | null | undefined {
  if (point === undefined) return undefined;
  if (point === null) return null;
  return `SRID=4326;POINT(${point.lng} ${point.lat})`;
}

export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw new AppError('Invalid request path.', 400, 'INVALID_INPUT');
  return value;
}

export function databaseError(error: { code?: string; constraint?: string }): AppError {
  if (error.code === '23505') {
    return new AppError('A record with these details already exists.', 409, 'DUPLICATE_RECORD');
  }
  if (error.code === '23503') {
    return new AppError('A referenced record is not available.', 400, 'INVALID_REFERENCE');
  }
  if (error.code === '23514' && error.constraint === 'applications_capacity_check') {
    return new AppError('This event has reached its volunteer capacity.', 409, 'EVENT_CAPACITY_REACHED');
  }
  if (error.code === '23514') {
    return new AppError('The submitted data violates a required constraint.', 400, 'INVALID_DATA');
  }
  if (error.code === '42501') {
    return new AppError('You are not authorized to perform this action.', 403, 'FORBIDDEN');
  }
  return new AppError('The database operation could not be completed.', 500, 'DATABASE_ERROR');
}

export function badInput(error: z.ZodError): AppError {
  return new AppError(error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 400, 'INVALID_INPUT');
}

export async function authorizeNgoMember(userId: string, appRole: string, ngoId: string, adminOnly = false) {
  if (appRole !== USER_ROLES.NGO_ADMIN && appRole !== USER_ROLES.NGO_COORDINATOR) {
    throw new AppError('You are not authorized to manage this NGO.', 403, 'FORBIDDEN');
  }
  if (adminOnly && appRole !== USER_ROLES.NGO_ADMIN) {
    throw new AppError('NGO administrator access is required.', 403, 'FORBIDDEN');
  }

  const { data: member, error } = await supabaseAdmin
    .from('ngo_members')
    .select('role')
    .eq('ngo_id', ngoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw databaseError(error);

  const expectedRole = appRole === USER_ROLES.NGO_ADMIN ? 'admin' : 'coordinator';
  if (!member || member.role !== expectedRole) {
    throw new AppError('You are not authorized to manage this NGO.', 403, 'FORBIDDEN');
  }
}

router.get('/volunteers/me/profile', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('*')
      .eq('user_id', req.auth!.appUserId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Volunteer profile not found.', 404, 'PROFILE_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/volunteers/me/profile', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const parsed = createVolunteerProfileSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    const profile: Database['public']['Tables']['volunteer_profiles']['Insert'] = {
      ...parsed.data,
      home_geo: pointToEwkt(parsed.data.home_geo),
      bio: parsed.data.bio ?? null,
      user_id: req.auth!.appUserId,
    };
    const { data, error } = await supabaseAdmin
      .from('volunteer_profiles')
      .insert(profile)
      .select('*')
      .single();
    if (error) throw databaseError(error);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/volunteers/me/profile', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const parsed = updateVolunteerProfileSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    const { home_geo, ...profileFields } = parsed.data;
    const update: Database['public']['Tables']['volunteer_profiles']['Update'] = {
      ...profileFields,
      ...(home_geo !== undefined ? { home_geo: pointToEwkt(home_geo) } : {}),
    };
    const { data, error } = await supabaseAdmin
      .from('volunteer_profiles')
      .update(update)
      .eq('user_id', req.auth!.appUserId)
      .select('*')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Volunteer profile not found.', 404, 'PROFILE_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/volunteers/me/availability', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('availability')
      .select('*')
      .eq('volunteer_id', req.auth!.appUserId)
      .order('available_date', { ascending: true, nullsFirst: true })
      .order('weekday', { ascending: true, nullsFirst: true })
      .order('start_time', { ascending: true, nullsFirst: true });
    if (error) throw databaseError(error);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/volunteers/me/availability', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const parsed = createAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    const { data, error } = await supabaseAdmin
      .from('availability')
      .insert({ ...parsed.data, volunteer_id: req.auth!.appUserId })
      .select('*')
      .single();
    if (error) throw databaseError(error);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/volunteers/me/availability/:availabilityId', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const availabilityId = routeParam(req, 'availabilityId');
    const { data: current, error: readError } = await supabaseAdmin
      .from('availability')
      .select('*')
      .eq('id', availabilityId)
      .eq('volunteer_id', req.auth!.appUserId)
      .maybeSingle();
    if (readError) throw databaseError(readError);
    if (!current) throw new AppError('Availability record not found.', 404, 'AVAILABILITY_NOT_FOUND');

    const patch = updateAvailabilitySchema.safeParse(req.body);
    if (!patch.success) throw badInput(patch.error);
    const merged = createAvailabilitySchema.safeParse({
      weekday: current.weekday,
      start_time: current.start_time,
      end_time: current.end_time,
      available_date: current.available_date,
      is_available: current.is_available,
      recurrence: current.recurrence,
      ...patch.data,
    });
    if (!merged.success) throw badInput(merged.error);

    const { data, error } = await supabaseAdmin
      .from('availability')
      .update(patch.data)
      .eq('id', availabilityId)
      .eq('volunteer_id', req.auth!.appUserId)
      .select('*')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Availability record not found.', 404, 'AVAILABILITY_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/volunteers/me/availability/:availabilityId', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('availability')
      .delete()
      .eq('id', routeParam(req, 'availabilityId'))
      .eq('volunteer_id', req.auth!.appUserId)
      .select('id')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Availability record not found.', 404, 'AVAILABILITY_NOT_FOUND');
    res.json({ success: true, data: { id: data.id } });
  } catch (error) {
    next(error);
  }
});

// Membership discovery for NGO users. Registered before the /ngos/:ngoId/* routes.
router.get('/ngos/me', requireAuth, requireRole(USER_ROLES.NGO_ADMIN, USER_ROLES.NGO_COORDINATOR), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ngo_members')
      .select('ngo_id, role, status, created_at, ngo:ngos!inner(id, name, status)')
      .eq('user_id', req.auth!.appUserId)
      .order('created_at', { ascending: true });
    if (error) throw databaseError(error);
    const rows = (data ?? []) as Array<{
      ngo_id: string;
      role: string;
      status: string;
      ngo: { id: string; name: string; status: string };
    }>;
    const memberships = rows.map((row) => ({
      ngo_id: row.ngo_id,
      role: row.role,
      member_status: row.status,
      ngo: row.ngo,
    }));
    res.json({ success: true, data: memberships });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/public', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ngos')
      .select('id, name, description, causes, region, geo, logo_url, status, created_at, updated_at')
      .eq('id', req.params.ngoId)
      .eq('status', 'verified')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('NGO profile not found.', 404, 'NGO_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/profile', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const { data, error } = await supabaseAdmin
      .from('ngos')
      .select('*')
      .eq('id', ngoId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('NGO profile not found.', 404, 'NGO_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/ngos/:ngoId/profile', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId, true);
    const parsed = updateNgoProfileSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    const { geo, ...profileFields } = parsed.data;
    const update: Database['public']['Tables']['ngos']['Update'] = {
      ...profileFields,
      ...(geo !== undefined ? { geo: pointToEwkt(geo) } : {}),
    };
    const { data, error } = await supabaseAdmin
      .from('ngos')
      .update(update)
      .eq('id', ngoId)
      .select('*')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('NGO profile not found.', 404, 'NGO_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(eventColumns)
      .eq('visibility', EVENT_VISIBILITY.PUBLIC)
      .eq('status', EVENT_STATUSES.PUBLISHED)
      .order('start_at', { ascending: true });
    if (error) throw databaseError(error);
    const events = data ?? [];
    if (events.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    const { data: accepted, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select('event_id')
      .eq('status', APPLICATION_STATUSES.ACCEPTED)
      .in('event_id', events.map((event) => event.id));
    if (acceptedError) throw databaseError(acceptedError);
    const acceptedCounts = countAcceptedByEvent(accepted ?? []);
    res.json({
      success: true,
      data: events.map((event) => ({ ...event, accepted_count: acceptedCounts[event.id] ?? 0 })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId', async (req, res, next) => {
  try {
    const eventId = routeParam(req, 'eventId');
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(eventColumns)
      .eq('id', eventId)
      .eq('visibility', EVENT_VISIBILITY.PUBLIC)
      .eq('status', EVENT_STATUSES.PUBLISHED)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Published public event not found.', 404, 'EVENT_NOT_FOUND');
    const { count, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', APPLICATION_STATUSES.ACCEPTED);
    if (acceptedError) throw databaseError(acceptedError);
    res.json({ success: true, data: { ...data, accepted_count: count ?? 0 } });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/events', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(eventColumns)
      .eq('ngo_id', ngoId)
      .order('start_at', { ascending: true });
    if (error) throw databaseError(error);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/ngos/:ngoId/events', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    if (parsed.data.ngo_id !== ngoId) {
      throw new AppError('Event NGO does not match the authorized NGO.', 403, 'FORBIDDEN');
    }
    const { geo, ...fields } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert({
        ...fields,
        geo: pointToEwkt(geo),
        created_by: req.auth!.appUserId,
      })
      .select(eventColumns)
      .single();
    if (error) throw databaseError(error);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/ngos/:ngoId/events/:eventId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) throw badInput(parsed.error);
    const { geo, ...eventFields } = parsed.data;
    const update: Database['public']['Tables']['events']['Update'] = {
      ...eventFields,
      ...(geo !== undefined ? { geo: pointToEwkt(geo) } : {}),
    };
    const { data, error } = await supabaseAdmin
      .from('events')
      .update(update)
      .eq('id', eventId)
      .eq('ngo_id', ngoId)
      .select(eventColumns)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/ngos/:ngoId/events/:eventId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const { data, error } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('ngo_id', ngoId)
      .select('id')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');
    res.json({ success: true, data: { id: data.id } });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/events/:eventId/roster', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, title, start_at, end_at, capacity, status')
      .eq('id', eventId)
      .eq('ngo_id', ngoId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!event) throw new AppError('Event not found for this NGO.', 404, 'EVENT_NOT_FOUND');

    const { data: acceptedRows, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select(`id, event_id, volunteer_id, status, created_at, updated_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', eventId)
      .eq('status', APPLICATION_STATUSES.ACCEPTED)
      .order('created_at', { ascending: true });
    if (acceptedError) throw databaseError(acceptedError);

    const accepted = selectAccepted(acceptedRows);
    res.json({
      success: true,
      data: {
        event,
        accepted_count: accepted.length,
        volunteers: accepted.map((row) => ({
          ...row,
          volunteer: projectVolunteerInfo(row.volunteer),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/volunteers/me/applications', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('applications')
      .select('id, event_id, volunteer_id, status, created_at, updated_at')
      .eq('volunteer_id', req.auth!.appUserId)
      .order('created_at', { ascending: false });
    if (error) throw databaseError(error);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/applications', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const eventId = routeParam(req, 'eventId');
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('user_id')
      .eq('user_id', req.auth!.appUserId)
      .maybeSingle();
    if (profileError) throw databaseError(profileError);
    if (!profile) throw new AppError('Create a volunteer profile before registering.', 403, 'PROFILE_REQUIRED');

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, ngo_id, visibility, status, registration_mode')
      .eq('id', eventId)
      .eq('status', EVENT_STATUSES.PUBLISHED)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!event) throw new AppError('This event is not accepting registrations.', 409, 'EVENT_NOT_OPEN');

    if (event.visibility === EVENT_VISIBILITY.NGO_ONLY) {
      const { data: affiliation, error: affiliationError } = await supabaseAdmin
        .from('ngo_affiliations')
        .select('id')
        .eq('ngo_id', event.ngo_id)
        .eq('volunteer_id', req.auth!.appUserId)
        .eq('status', 'active')
        .maybeSingle();
      if (affiliationError) throw databaseError(affiliationError);
      if (!affiliation) throw new AppError('You are not authorized to register for this event.', 403, 'FORBIDDEN');
    }

    const status = event.registration_mode === 'open'
      ? APPLICATION_STATUSES.ACCEPTED
      : APPLICATION_STATUSES.INTERESTED;
    const { data, error } = await supabaseAdmin
      .from('applications')
      .insert({ event_id: event.id, volunteer_id: req.auth!.appUserId, status })
      .select('id, event_id, volunteer_id, status, created_at, updated_at')
      .single();
    if (error) throw databaseError(error);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/volunteers/me/applications/:applicationId/cancel', requireAuth, requireRole(USER_ROLES.VOLUNTEER), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('applications')
      .update({ status: APPLICATION_STATUSES.CANCELLED })
      .eq('id', routeParam(req, 'applicationId'))
      .eq('volunteer_id', req.auth!.appUserId)
      .in('status', [APPLICATION_STATUSES.INTERESTED, APPLICATION_STATUSES.ACCEPTED, APPLICATION_STATUSES.WAITLISTED])
      .select('id, event_id, volunteer_id, status, created_at, updated_at')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Application not found or cannot be cancelled.', 404, 'APPLICATION_NOT_FOUND');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/ngos/:ngoId/applications', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('ngo_id', ngoId);
    if (eventsError) throw databaseError(eventsError);
    const eventIds = (events ?? []).map((event) => event.id);
    if (!eventIds.length) {
      res.json({ success: true, data: [] });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('applications')
      .select(`id, event_id, volunteer_id, status, created_at, updated_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .in('event_id', eventIds);
    if (error) throw databaseError(error);
    const applications = (data ?? []).map((row) => ({
      ...row,
      volunteer: projectVolunteerInfo(row.volunteer),
    }));
    res.json({ success: true, data: applications });
  } catch (error) {
    next(error);
  }
});

router.patch('/ngos/:ngoId/applications/:applicationId', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const applicationId = routeParam(req, 'applicationId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const decision = applicationDecisionSchema.safeParse(req.body);
    if (!decision.success) throw badInput(decision.error);

    const { data: application, error: applicationError } = await supabaseAdmin
      .from('applications')
      .select('id, event_id')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) throw databaseError(applicationError);
    if (!application) throw new AppError('Application not found.', 404, 'APPLICATION_NOT_FOUND');

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, registration_mode')
      .eq('id', application.event_id)
      .eq('ngo_id', ngoId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    if (!event) throw new AppError('Application not found for this NGO.', 404, 'APPLICATION_NOT_FOUND');
    if (event.registration_mode !== 'approval_required') {
      throw new AppError('This event does not require registration approval.', 409, 'REGISTRATION_NOT_REVIEWABLE');
    }

    const { data, error } = await supabaseAdmin
      .from('applications')
      .update({ status: decision.data.status })
      .eq('id', applicationId)
      .eq('event_id', event.id)
      .in('status', [APPLICATION_STATUSES.INTERESTED, APPLICATION_STATUSES.WAITLISTED])
      .select('id, event_id, volunteer_id, status, created_at, updated_at')
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new AppError('Application has already been decided or is no longer reviewable.', 409, 'APPLICATION_NOT_REVIEWABLE');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export { router as coreRouter };
