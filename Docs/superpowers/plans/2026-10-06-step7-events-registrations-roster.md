# Step 7 — Events, Registrations & Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Step 7 workflow gaps — NGO sees permitted volunteer info on registrations, accepted volunteers appear in a view-only roster, and volunteers/visitors see real confirmed/capacity numbers — on top of the already-working create → publish → discover → register → review → decide flow.

**Architecture:** All DB guarantees (capacity trigger, duplicate guard, status CHECK) already exist in migration 002 and are NOT touched. Step 7 adds: (a) a security-gated volunteer-info projection (whitelist: name, photo_url, bio, causes) embedded into NGO application/roster reads, (b) a new authorized `GET /ngos/:ngoId/events/:eventId/roster` endpoint, (c) `accepted_count` enrichment on public event reads. Frontend consumes these additively. Roster is view-only — no shifts, no finalization, no attendance (Step 8+).

**Tech Stack:** Express 4 + supabase-js service-role + zod (apps/api); React 18 + TS strict + Tailwind tokens (apps/web); node:test + node:assert/strict for pure-logic tests.

**Spec:** `.gsd/SPEC.md` (Step 5 resolved conflicts), the Step 7 brief (28 sections), `Docs/seva setu security and access.pdf`, `Docs/seva setu app flow.pdf`, `Docs/seva setu frontend specifications.pdf`.

## Global Constraints

- **NO commit, NO push, NO reset, NO discard.** All Step 7 work stays local (brief §27). This overrides the plan-skill default of a commit step per task — each task ends with a verify checkpoint instead.
- **NO new migration.** Migration 002 already provides the `applications` table, capacity trigger (`applications_capacity_check`), and duplicate guard. Step 7 is additive API/UI only (brief §25).
- **NO Step 8+ functionality:** no AI matching, no scheduling engine, no shifts, no roster finalization, no attendance, no karma, no emergency, no notifications (brief §23).
- **Volunteer info exposure is whitelisted** to exactly: `id, name, photo_url, bio, causes` (Security §37/§38: never expose `home_geo`, `max_distance_km`, `notification_preferences`, `emergency_available`, or the volunteer's user email/phone). Enforcement: restricted PostgREST select columns + a pure whitelist projector (defense in depth).
- **Roster reads accepted applications only**, derived from the authoritative `applications.status = 'accepted'` — never a parallel copy (brief §12).
- **Reuse existing endpoints** — NGO applications list keeps its path; only additive response fields. One new route only (roster). No duplicate routes (brief §16).
- **No secrets, no real credentials.** Live Clerk/Supabase verification is reported as PENDING (brief §26), never claimed.
- **Do not remove or modify existing tests** (brief §24). New tests follow the existing node:test pure-logic pattern (the only locally runnable layer without live credentials).
- Never trust frontend checks as the security boundary — backend `requireAuth`/`requireRole`/`authorizeNgoMember` + event `ngo_id` ownership remain authoritative.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/modules/core/volunteerInfo.ts` | Create | Pure helpers: public-columns constant, whitelist projector, accepted-count reducer |
| `apps/api/src/modules/core/volunteerInfo.test.ts` | Create | node:test coverage for the pure helpers |
| `apps/api/package.json` | Modify | Add volunteerInfo.test.ts to the test script |
| `apps/api/src/modules/core/routes.ts` | Modify | Enrich NGO applications list; add roster route; add accepted_count to public event reads |
| `apps/web/src/services/api/endpoints.ts` | Modify | New response types + `getNgoEventRoster` function |
| `apps/web/src/components/ngo/RegistrationsPanel.tsx` | Modify | Show volunteer name/bio/causes instead of truncated ID |
| `apps/web/src/components/ngo/RosterPanel.tsx` | Create | View-only accepted-volunteers panel for NGO event detail |
| `apps/web/src/components/ngo/index.ts` | Modify | Export RosterPanel |
| `apps/web/src/pages/ngo/EventDetailsPage.tsx` | Modify | Render RosterPanel under RegistrationsPanel |
| `apps/web/src/pages/volunteer/EventDetailsPage.tsx` | Modify | "X / Y volunteers confirmed" capacity line |
| `apps/web/src/pages/volunteer/DiscoverPage.tsx` | Modify | Open-spots line on event cards |

---

### Task 1: Backend — volunteer-info pure helpers (TDD)

**Files:**
- Create: `apps/api/src/modules/core/volunteerInfo.ts`
- Create: `apps/api/src/modules/core/volunteerInfo.test.ts`
- Modify: `apps/api/package.json` (test script)

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (used by Tasks 2–4):
  - `VOLUNTEER_PUBLIC_COLUMNS: string` — `'id, name, photo_url, bio, causes'`
  - `projectVolunteerInfo(value: unknown): PublicVolunteerInfo | null`
  - `countAcceptedByEvent(rows: Array<{ event_id: string }>): Record<string, number>`
  - `interface PublicVolunteerInfo { id: string; name: string; photo_url: string | null; bio: string | null; causes: string[] | null }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/core/volunteerInfo.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countAcceptedByEvent, projectVolunteerInfo } from './volunteerInfo.js';

describe('projectVolunteerInfo', () => {
  it('projects only the security-permitted volunteer fields', () => {
    const projected = projectVolunteerInfo({
      id: 'user-1',
      name: 'Asha Rao',
      photo_url: 'https://example.com/a.png',
      bio: 'Community volunteer',
      causes: ['Health', 'Education'],
      home_geo: 'SRID=4326;POINT(77.59 12.97)',
      max_distance_km: 15,
      emergency_available: true,
      notification_preferences: { email: true },
      email: 'asha@example.com',
    });
    assert.deepEqual(projected, {
      id: 'user-1',
      name: 'Asha Rao',
      photo_url: 'https://example.com/a.png',
      bio: 'Community volunteer',
      causes: ['Health', 'Education'],
    });
  });

  it('fills non-permitted optional fields with null and drops extras', () => {
    const projected = projectVolunteerInfo({ id: 'user-2', name: 'Vikram', phone: '+91-90000-00000' });
    assert.deepEqual(projected, {
      id: 'user-2',
      name: 'Vikram',
      photo_url: null,
      bio: null,
      causes: null,
    });
  });

  it('returns null for null, undefined, or non-object input', () => {
    assert.equal(projectVolunteerInfo(null), null);
    assert.equal(projectVolunteerInfo(undefined), null);
    assert.equal(projectVolunteerInfo('profile'), null);
  });

  it('returns null when id or name is missing or mistyped', () => {
    assert.equal(projectVolunteerInfo({ name: 'No id' }), null);
    assert.equal(projectVolunteerInfo({ id: 'user-3', name: 42 }), null);
  });
});

describe('countAcceptedByEvent', () => {
  it('counts rows per event id', () => {
    assert.deepEqual(
      countAcceptedByEvent([{ event_id: 'e1' }, { event_id: 'e1' }, { event_id: 'e2' }]),
      { e1: 2, e2: 1 },
    );
  });

  it('returns an empty record for no rows', () => {
    assert.deepEqual(countAcceptedByEvent([]), {});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=@sevasetu/api`
Expected: FAIL — `Cannot find module ... volunteerInfo.js` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/core/volunteerInfo.ts`:

```ts
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
```

- [ ] **Step 4: Add the new test file to the test script**

In `apps/api/package.json`, replace the test script:

```json
"test": "node --import tsx --test src/modules/core/validation.test.ts src/modules/core/volunteerInfo.test.ts"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=@sevasetu/api`
Expected: PASS — all existing validation tests still pass, plus the 6 new tests.

---

### Task 2: Backend — enrich NGO applications list with volunteer info

**Files:**
- Modify: `apps/api/src/modules/core/routes.ts` (GET `/ngos/:ngoId/applications`, currently at lines 558–581)

**Interfaces:**
- Consumes: `projectVolunteerInfo`, `VOLUNTEER_PUBLIC_COLUMNS` from `./volunteerInfo.js` (Task 1).
- Produces: `GET /ngos/:ngoId/applications` rows become `ApplicationRow & { volunteer: PublicVolunteerInfo | null }`. Response remains an array at the same path — additive only, RegistrationsPanel's contract is a superset.

- [ ] **Step 1: Add the import**

In `routes.ts`, after the `supabaseAdmin` import (line 20), add:

```ts
import { projectVolunteerInfo, VOLUNTEER_PUBLIC_COLUMNS } from './volunteerInfo.js';
```

- [ ] **Step 2: Replace the applications query + response**

Replace the final query block of `GET /ngos/:ngoId/applications` (lines 572–577):

```ts
    const { data, error } = await supabaseAdmin
      .from('applications')
      .select('id, event_id, volunteer_id, status, created_at, updated_at')
      .in('event_id', eventIds);
    if (error) throw databaseError(error);
    res.json({ success: true, data });
```

with:

```ts
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
```

- [ ] **Step 3: Verify**

Run: `npm run type-check --workspace=@sevasetu/api && npm run build --workspace=@sevasetu/api`
Expected: both pass with no errors.

---

### Task 3: Backend — accepted_count on public event reads

**Files:**
- Modify: `apps/api/src/modules/core/routes.ts` (GET `/events` at lines 357–370; GET `/events/:eventId` at lines 372–388)

**Interfaces:**
- Consumes: `countAcceptedByEvent` from `./volunteerInfo.js` (Task 1); `APPLICATION_STATUSES` (already imported).
- Produces: both public endpoints return `EventRow & { accepted_count: number }`.

- [ ] **Step 1: Add the import**

Extend the Task 2 import line to:

```ts
import { countAcceptedByEvent, projectVolunteerInfo, VOLUNTEER_PUBLIC_COLUMNS } from './volunteerInfo.js';
```

- [ ] **Step 2: Enrich GET /events (list)**

Replace the body of the GET `/events` handler's try block:

```ts
    const { data, error } = await supabaseAdmin
      .from('events')
      .select(eventColumns)
      .eq('visibility', EVENT_VISIBILITY.PUBLIC)
      .eq('status', EVENT_STATUSES.PUBLISHED)
      .order('start_at', { ascending: true });
    if (error) throw databaseError(error);
    res.json({ success: true, data });
```

with:

```ts
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
```

(The empty-list guard avoids PostgREST's empty `in.()` filter error.)

- [ ] **Step 3: Enrich GET /events/:eventId (details)**

Replace the final lines of the GET `/events/:eventId` handler:

```ts
    if (!data) throw new AppError('Published public event not found.', 404, 'EVENT_NOT_FOUND');
    res.json({ success: true, data });
```

with:

```ts
    if (!data) throw new AppError('Published public event not found.', 404, 'EVENT_NOT_FOUND');
    const { count, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', APPLICATION_STATUSES.ACCEPTED);
    if (acceptedError) throw databaseError(acceptedError);
    res.json({ success: true, data: { ...data, accepted_count: count ?? 0 } });
```

- [ ] **Step 4: Verify**

Run: `npm run type-check --workspace=@sevasetu/api && npm run build --workspace=@sevasetu/api`
Expected: both pass.

---

### Task 4: Backend — roster endpoint (accepted volunteers, view-only)

**Files:**
- Modify: `apps/api/src/modules/core/routes.ts` (new route, placed directly after the DELETE `/ngos/:ngoId/events/:eventId` handler, before the `/volunteers/me/applications` section)

**Interfaces:**
- Consumes: `authorizeNgoMember`, `routeParam`, `databaseError` (existing); `APPLICATION_STATUSES`; `projectVolunteerInfo`, `VOLUNTEER_PUBLIC_COLUMNS` (Task 1).
- Produces: `GET /ngos/:ngoId/events/:eventId/roster` → `{ event: {id,title,start_at,end_at,capacity,status}, accepted_count: number, volunteers: Array<ApplicationRow & { volunteer: PublicVolunteerInfo | null }> }`. Authorization: `requireAuth` + `requireRole`-equivalent role check + ngo_members membership + event `ngo_id` ownership (cross-NGO ids → 404).

- [ ] **Step 1: Add the route**

Insert after the DELETE `/ngos/:ngoId/events/:eventId` handler (after line 477):

```ts
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

    const { data: accepted, error: acceptedError } = await supabaseAdmin
      .from('applications')
      .select(`id, event_id, volunteer_id, status, created_at, updated_at, volunteer:volunteer_profiles(${VOLUNTEER_PUBLIC_COLUMNS})`)
      .eq('event_id', eventId)
      .eq('status', APPLICATION_STATUSES.ACCEPTED)
      .order('created_at', { ascending: true });
    if (acceptedError) throw databaseError(acceptedError);

    res.json({
      success: true,
      data: {
        event,
        accepted_count: accepted?.length ?? 0,
        volunteers: (accepted ?? []).map((row) => ({
          ...row,
          volunteer: projectVolunteerInfo(row.volunteer),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 2: Verify**

Run: `npm run type-check --workspace=@sevasetu/api && npm run build --workspace=@sevasetu/api && npm run test --workspace=@sevasetu/api`
Expected: all pass.

Note on behaviors verified only against a live database (reported PENDING in the final report): unauthorized/non-member 403, cross-NGO 404, accepted-only filtering, and capacity behavior — the capacity guarantee itself lives in the existing migration-002 trigger and is not modified.

---

### Task 5: Web — typed API endpoints and response types

**Files:**
- Modify: `apps/web/src/services/api/endpoints.ts`

**Interfaces:**
- Consumes: backend responses from Tasks 2–4.
- Produces:
  - `interface PublicVolunteerInfo { id: string; name: string; photo_url: string | null; bio: string | null; causes: string[] | null }`
  - `type PublicEventRow = EventRow & { accepted_count: number }`
  - `type NgoApplicationRow = ApplicationRow & { volunteer: PublicVolunteerInfo | null }`
  - `interface NgoEventRoster { event: Pick<EventRow, 'id' | 'title' | 'start_at' | 'end_at' | 'capacity' | 'status'>; accepted_count: number; volunteers: Array<ApplicationRow & { volunteer: PublicVolunteerInfo | null }> }`
  - `getNgoEventRoster(token: string, ngoId: string, eventId: string): Promise<NgoEventRoster>`

- [ ] **Step 1: Add the types**

In `endpoints.ts`, directly below the existing `export type NgoProfileRow = ...` line, add:

```ts
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
```

- [ ] **Step 2: Retype the existing functions**

Change the signatures of the three enriched consumers (bodies unchanged):

```ts
export async function listPublicEvents(token: string): Promise<PublicEventRow[]> {
  return (await apiClient<PublicEventRow[]>('/events', { token })).data;
}

export async function getPublicEvent(token: string, eventId: string): Promise<PublicEventRow> {
  return (await apiClient<PublicEventRow>(`/events/${eventId}`, { token })).data;
}
```

```ts
export async function listNgoApplications(token: string, ngoId: string): Promise<NgoApplicationRow[]> {
  return (await apiClient<NgoApplicationRow[]>(`/ngos/${ngoId}/applications`, { token })).data;
}
```

`decideNgoApplication` keeps its `ApplicationRow` return (the PATCH response has no embed).

- [ ] **Step 3: Add the roster function**

In the NGO applications section, after `decideNgoApplication`, add:

```ts
// ─── NGO roster (accepted volunteers, view-only in Step 7) ────────────────────

export async function getNgoEventRoster(token: string, ngoId: string, eventId: string): Promise<NgoEventRoster> {
  return (
    await apiClient<NgoEventRoster>(`/ngos/${ngoId}/events/${eventId}/roster`, { token })
  ).data;
}
```

- [ ] **Step 4: Verify**

Run: `npm run type-check --workspace=@sevasetu/web`
Expected: PASS — existing pages still compile because `PublicEventRow`/`NgoApplicationRow` are structural supersets of what they consume.

---

### Task 6: Web — RegistrationsPanel real names + RosterPanel + NGO page integration

**Files:**
- Modify: `apps/web/src/components/ngo/RegistrationsPanel.tsx`
- Create: `apps/web/src/components/ngo/RosterPanel.tsx`
- Modify: `apps/web/src/components/ngo/index.ts`
- Modify: `apps/web/src/pages/ngo/EventDetailsPage.tsx`

**Interfaces:**
- Consumes: `NgoApplicationRow`, `getNgoEventRoster`, `NgoEventRoster` (Task 5); existing ui/shared components.
- Produces: `RosterPanel({ ngoId: string; eventId: string })` exported from the `components/ngo` barrel.

- [ ] **Step 1: Show volunteer identity in RegistrationsPanel**

Replace the row identity block:

```tsx
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand-text">
                    Volunteer <span className="font-mono text-caption">{row.volunteer_id.slice(0, 8)}</span>
                  </p>
                  <p className="text-caption text-brand-text-muted">
                    Registered {formatDateTime(row.created_at)}
                  </p>
                </div>
```

with:

```tsx
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand-text">
                    {row.volunteer?.name ?? `Volunteer ${row.volunteer_id.slice(0, 8)}`}
                  </p>
                  {row.volunteer?.causes?.length ? (
                    <p className="text-caption text-brand-text-muted">
                      Causes: {row.volunteer.causes.join(', ')}
                    </p>
                  ) : null}
                  <p className="text-caption text-brand-text-muted">
                    Registered {formatDateTime(row.created_at)}
                  </p>
                </div>
```

- [ ] **Step 2: Create RosterPanel**

Create `apps/web/src/components/ngo/RosterPanel.tsx`:

```tsx
import React from 'react';
import { Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import { getNgoEventRoster } from '../../services/api/endpoints';
import { formatDateTime } from '../../utils/format';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from '../../components/ui';

interface RosterPanelProps {
  ngoId: string;
  eventId: string;
}

export function RosterPanel({ ngoId, eventId }: RosterPanelProps) {
  const query = useApiQuery((token) => getNgoEventRoster(token, ngoId, eventId), [ngoId, eventId]);

  return (
    <Card>
      <CardHeader icon={Users}>
        <CardTitle as="h2">Roster</CardTitle>
        <CardDescription>
          {query.loading
            ? 'Loading roster…'
            : query.error
              ? 'Roster unavailable.'
              : `${query.data.accepted_count} / ${query.data.event.capacity} volunteers confirmed`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}

        {!query.loading && query.error && <Alert variant="error">{query.error?.message}</Alert>}

        {!query.loading && !query.error && query.data.volunteers.length === 0 && (
          <EmptyState
            icon={Users}
            title="No accepted volunteers yet"
            description="Volunteers with accepted registrations appear here automatically."
          />
        )}

        {!query.loading && !query.error && query.data.volunteers.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {query.data.volunteers.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand-text">
                    {row.volunteer?.name ?? `Volunteer ${row.volunteer_id.slice(0, 8)}`}
                  </p>
                  {row.volunteer?.bio ? (
                    <p className="text-caption text-brand-text-muted line-clamp-1">{row.volunteer.bio}</p>
                  ) : null}
                  {row.volunteer?.causes?.length ? (
                    <p className="text-caption text-brand-text-muted">
                      Causes: {row.volunteer.causes.join(', ')}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-caption text-brand-text-muted">
                  Accepted {formatDateTime(row.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default RosterPanel;
```

- [ ] **Step 3: Export from the barrel**

In `apps/web/src/components/ngo/index.ts`, add:

```ts
export { RosterPanel } from './RosterPanel';
```

- [ ] **Step 4: Render RosterPanel on the NGO event detail page**

In `apps/web/src/pages/ngo/EventDetailsPage.tsx`, extend the existing barrel import:

```tsx
import { EventForm, NgoGate, RegistrationsPanel, RosterPanel } from '../../components/ngo';
```

and insert the panel directly below `<RegistrationsPanel … />`:

```tsx
              <RegistrationsPanel
                ngoId={ngoId}
                eventId={eventId}
                registrationMode={event.registration_mode}
                onDecided={events.refetch}
              />

              <RosterPanel ngoId={ngoId} eventId={eventId} />
```

- [ ] **Step 5: Verify**

Run: `npm run type-check --workspace=@sevasetu/web && npm run build --workspace=@sevasetu/web`
Expected: both pass.

---

### Task 7: Web — volunteer-facing capacity/availability display

**Files:**
- Modify: `apps/web/src/pages/volunteer/EventDetailsPage.tsx`
- Modify: `apps/web/src/pages/volunteer/DiscoverPage.tsx`

**Interfaces:**
- Consumes: `PublicEventRow.accepted_count` (Task 5). No new components.

- [ ] **Step 1: Confirmed/capacity line on the volunteer event details page**

In `apps/web/src/pages/volunteer/EventDetailsPage.tsx`, replace the Capacity `dd` block:

```tsx
                  <dd className="text-small text-brand-text mt-1">
                    {event.capacity} volunteer{event.capacity === 1 ? '' : 's'} needed
                  </dd>
```

with:

```tsx
                  <dd className="text-small text-brand-text mt-1">
                    {event.accepted_count} / {event.capacity} volunteers confirmed
                  </dd>
```

- [ ] **Step 2: Open-spots line on Discover cards**

In `apps/web/src/pages/volunteer/DiscoverPage.tsx`:

Change the import line:

```ts
import { listPublicEvents, type EventRow } from '../../services/api/endpoints';
```

to:

```ts
import { listPublicEvents, type PublicEventRow } from '../../services/api/endpoints';
```

and update the `matchesFilters` signature from `event: EventRow` to `event: PublicEventRow`.

Replace the slots line in the card body:

```tsx
                      <p className="mt-1 flex items-center gap-1 text-small text-brand-text-secondary">
                        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {event.capacity} volunteer{event.capacity === 1 ? '' : 's'} needed
                      </p>
```

with:

```tsx
                      <p className="mt-1 flex items-center gap-1 text-small text-brand-text-secondary">
                        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {event.capacity - event.accepted_count > 0
                          ? `${event.capacity - event.accepted_count} of ${event.capacity} spots open`
                          : 'All spots filled'}
                      </p>
```

- [ ] **Step 3: Verify**

Run: `npm run type-check --workspace=@sevasetu/web && npm run build --workspace=@sevasetu/web`
Expected: both pass.

---

### Task 8: Full verification + status report

**Files:**
- No file changes (verification only), plus the final report message.

- [ ] **Step 1: Run all workspace checks**

```bash
npm run test --workspace=@sevasetu/api
npm run type-check --workspace=@sevasetu/api
npm run build --workspace=@sevasetu/api
npm run type-check --workspace=@sevasetu/web
npm run build --workspace=@sevasetu/web
git diff --check
```

Expected: all pass, no whitespace errors. `git status` must show only the files in this plan's File Structure table as modified/new.

- [ ] **Step 2: Regression sweep**

Confirm with `git status`/`git diff` that: no migration files changed; no Step 5/6 files deleted; no `.env`/credential files touched; no Step 8+ features (attendance/shifts/karma/emergency) added.

- [ ] **Step 3: Deliver the report**

Produce the final message in the brief's exact format: `STEP 7 STATUS: COMPLETE` or `NOT COMPLETE`, followed by Events / Registration / Application management / Roster / Authorization / Capacity enforcement / API / Database changes / Tests / Frontend typecheck / Backend typecheck / Frontend build / Backend build / Regression checks / Live Clerk/Supabase verification (PENDING) / Files changed / Blocking issues / Non-blocking issues. Do NOT commit or push.

---

## Self-Review

**Spec coverage:** Create/publish flow (exists, untouched), discover + slots (Task 7 Step 2), details + capacity/availability (Task 7 Step 1), register/apply (exists, untouched), NGO review + decision (exists, enriched names Task 6 Step 1), volunteer sees status (exists), roster from accepted-only (Tasks 4+6), capacity authoritative backend (existing migration-002 trigger, unchanged — brief forbids redesign), volunteer info per Security §37/§38 (Tasks 1–2), API reuse/no duplicate routes (one new route, additive fields), tests for the locally testable layer with live-DB behaviors reported PENDING (Tasks 1+4 note), no migration (verified in Task 8 Step 2). Brief §23 exclusions respected — no attendance/shifts/finalization/matching.

**Placeholder scan:** All steps contain complete code, exact file paths, and exact commands; no TBDs.

**Type consistency:** `projectVolunteerInfo` / `countAcceptedByEvent` / `VOLUNTEER_PUBLIC_COLUMNS` names identical across Tasks 1, 2, 3, 4. `PublicVolunteerInfo` shape identical in `volunteerInfo.ts` and `endpoints.ts`. `NgoApplicationRow.volunteer` nullable in both API projector output (null only on malformed input) and web type. `getNgoEventRoster(token, ngoId, eventId)` signature matches RosterPanel usage via `useApiQuery`. `PublicEventRow` import updated in DiscoverPage; `EventRow` consumers elsewhere unaffected (structural superset).
