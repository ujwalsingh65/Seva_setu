# Step 6 — Application Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production volunteer and NGO application pages (dashboards, profiles, event discovery/details, applications management) on the existing Step 5 auth/API/DB foundation, using the existing design system exclusively.

**Architecture:** React 18 SPA (Vite, strict TS) talks only to the Express backend under `/api/v1` through a typed endpoint service + `useApiQuery`/`useApiMutation` hooks. Clerk supplies session tokens; the backend supplies roles (frontend role checks are UX-only). One minimal new endpoint `GET /ngos/me` fills the only real gap (NGO membership discovery); everything else consumes existing Step 5 endpoints. Client-side joins replace backend joins where the API does not embed related data (applications × public events).

**Tech Stack:** Express 4 + Supabase service-role + zod (apps/api); React 18 + Vite 6 + TS strict + Tailwind 3.4 (existing token layer) + react-router-dom 6.30 + @clerk/react 6 (apps/web); packages: `@sevasetu/constants`, `@sevasetu/validation` (TS source, imported directly for client-side form validation), `@sevasetu/shared-types` (`Database` row types as API response types).

**Spec:** Step 6 brief (session attachment, verbatim constraints captured in Global Constraints), `.gsd/SPEC.md`, implemented backend `apps/api/src/modules/core/routes.ts` (authoritative API contract — implemented routes win over idealized spec endpoint lists), Docs PDFs (app flow §3/5/12–19/24/52–55/60/66/71–74, frontend spec §29/30, security §11–13/37–41).

## Global Constraints

- Roles NEVER from Clerk session or frontend state — only from backend (`/auth/me`, `/ngos/me`). Frontend role checks are UX/navigation only; backend authorization remains authoritative.
- No endpoints created except `GET /ngos/me`; no duplicate endpoints; no direct browser-to-Supabase access of any kind.
- No secrets in frontend code; only `VITE_` public vars (Clerk publishable key, API base URL).
- Use the existing design system (`apps/web/src/components/ui` + Tailwind brand tokens) exclusively; no unrelated visual style; no new npm dependencies.
- Every data-driven page implements explicit Loading (skeletons), Empty, Error, and Success states; never a blank screen (app flow §52/71/72/73, Rule 2).
- Destructive actions (cancel registration, cancel event, delete event, reject application, delete availability) require a confirmation modal (Rule 4).
- Prevent duplicate submissions: submit buttons disabled while pending.
- Backend authoritative: client-side validation with `@sevasetu/validation` schemas is UX; server errors (400/401/403/404/409/500) surfaced with friendly messages, internal DB errors never exposed raw.
- Out of scope (mark unavailable, never implement): matching/recommendation engine, scheduling, emergency deployment, analytics/retention, karma/reliability scoring, AI agent, Step 7+ pages (roster, volunteers directory, transparency, agent, settings, billing).
- **Do NOT commit. Do NOT push. All work stays local. Do not reset or discard changes. Preserve Step 5 commit and design-system work.**
- Accessibility: semantic HTML, labeled controls, keyboard-reachable actions, ARIA only where necessary. Responsive: desktop/tablet/mobile, no fixed-width layouts (single-column mobile, sticky-primary-action where appropriate).

---

### Task 1: Backend — `GET /ngos/me` membership discovery

**Files:**
- Modify: `apps/api/src/modules/core/routes.ts` (insert in NGO section, before `/ngos/:ngoId/*` routes)
- Verify signatures in: `apps/api/src/modules/auth/middleware.ts` (`requireRole` arity — must accept both NGO roles as OR, not AND)

**Interfaces:**
- Consumes: `requireAuth`, `requireRole`, `getSupabaseAdmin`, `USER_ROLES` (all already used in this file)
- Produces: `GET /api/v1/ngos/me` → `{ success: true, data: NgoMembership[] }` where `NgoMembership = { ngo_id, role: 'admin'|'coordinator', member_status, ngo: { id, name, status } }`. Returns `[]` for NGO-role users with no `ngo_members` rows; 403 for volunteer/platform_admin roles.

- [ ] **Step 1: Verify `requireRole` accepts multiple roles** (read middleware; if single-role-only, register the route with `requireAuth` and filter/403 inside the handler — do NOT chain two `requireRole` calls, that is an AND).

- [ ] **Step 2: Add the route**

```ts
router.get(
  '/ngos/me',
  requireAuth,
  requireRole(USER_ROLES.NGO_ADMIN, USER_ROLES.NGO_COORDINATOR),
  async (req, res, next) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('ngo_members')
        .select('ngo_id, role, status, created_at, ngo:ngos!inner(id, name, status)')
        .eq('user_id', req.appUserId)
        .order('created_at', { ascending: true });
      if (error) return next(error);
      const memberships = (data ?? []).map((row: any) => ({
        ngo_id: row.ngo_id,
        role: row.role,
        member_status: row.status,
        ngo: { id: row.ngo.id, name: row.ngo.name, status: row.ngo.status },
      }));
      res.json({ success: true, data: memberships });
    } catch (err) {
      next(err);
    }
  }
);
```

- [ ] **Step 3: Verify**

Run: `cd apps/api && npm run type-check && npm run build && npm test`
Expected: all pass. (No live DB available — do not claim runtime verification.)

---

### Task 2: Web API service layer — `ApiError` + typed endpoints

**Files:**
- Modify: `apps/web/src/services/api/client.ts`
- Create: `apps/web/src/services/api/endpoints.ts`
- Check: `grep -r "apiClient" apps/web/src` for existing consumers before changing the client's return contract

**Interfaces:**
- Consumes: backend envelope `{ success: true, data: T }` / `{ success: false, error: { code, message } }`
- Produces (used by all later tasks): `ApiError { code, status }`, `API_BASE_URL`, `apiClient<T>(endpoint, options): Promise<ApiEnvelope<T>>`, and endpoint functions listed below. Row types come from `Database['public']['Tables'][...]['Row']` in `@sevasetu/shared-types` (verify exact table name for availability: `volunteer_availability` vs `availability`).

- [ ] **Step 1: Rewrite `client.ts`** — keep module/function names; add `ApiError` (carries `code`, `status`), map network failures to `ApiError('Unable to reach the server…', 'NETWORK_ERROR', 0)`, keep throwing on `!ok` with backend `error.message`, return the parsed envelope.

- [ ] **Step 2: Write `endpoints.ts`** — thin typed functions, one per existing endpoint used by pages:

```ts
// auth
getAuthMe(token)
// volunteer profile
getMyVolunteerProfile(token): Promise<VolunteerProfileRow | null>   // 404 → null (create mode)
createMyVolunteerProfile(token, body)
updateMyVolunteerProfile(token, body)
// availability
listMyAvailability(token): Promise<AvailabilityRow[]>
createMyAvailability(token, body)
updateMyAvailability(token, availabilityId, body)
deleteMyAvailability(token, availabilityId)
// public events
listPublicEvents(token): Promise<EventRow[]>
getPublicEvent(token, eventId): Promise<EventRow[]>
// volunteer applications
listMyApplications(token): Promise<ApplicationRow[]>
createApplication(token, eventId)
cancelMyApplication(token, applicationId)
// ngo membership
getMyNgos(token): Promise<NgoMembership[]>
// ngo profile
getNgoProfile(token, ngoId): Promise<NgoProfileRow>
updateNgoProfile(token, ngoId, body)
// ngo events
listNgoEvents(token, ngoId): Promise<EventRow[]>
createNgoEvent(token, ngoId, body)
updateNgoEvent(token, ngoId, eventId, body)
deleteNgoEvent(token, ngoId, eventId)
// ngo applications
listNgoApplications(token, ngoId): Promise<ApplicationRow[]>
decideNgoApplication(token, ngoId, applicationId, status: 'accepted'|'waitlisted'|'rejected')
```

```ts
export interface NgoMembership {
  ngo_id: string;
  role: 'admin' | 'coordinator';
  member_status: string;
  ngo: { id: string; name: string; status: string };
}
```

- [ ] **Step 3: Verify** — `cd apps/web && npm run type-check` (expected: pass; endpoints unused so far is fine).

---

### Task 3: Hooks, formatting utils, shared components, AppShell layout

**Files:**
- Create: `apps/web/src/hooks/useApi.ts`, `apps/web/src/utils/format.ts`, `apps/web/src/components/shared/StatusBadge.tsx`, `apps/web/src/components/shared/PageHeader.tsx`, `apps/web/src/layouts/AppShell.tsx` + barrel updates (`components/shared/index.ts`, `layouts/index.ts`, `utils/index.ts`)
- Read first: `apps/web/src/components/ui/*` for exact prop APIs (Badge `variant` names, Modal, Alert, EmptyState, ErrorState, Skeleton, Button, Input, Select, Card)

**Interfaces:**
- Consumes: Task 2 endpoints, `useAuth().getToken()`, design-system components
- Produces:
  - `useApiQuery<T>(fetcher: (token: string) => Promise<T>, deps: unknown[]) → { data: T | null, loading: boolean, error: Error | null, refetch: () => void }` (stale-response guard via cancelled flag; re-runs when token identity or deps change)
  - `useApiMutation(fn: (token: string, ...args) => Promise<T>) → { mutate(...args): Promise<T>, pending, error, reset }`
  - `useMyNgo() → { memberships, primaryNgo: NgoMembership | null, loading, error, refetch }`
  - `formatDate/formatTime/formatDateTime(iso)`, `isUpcoming(iso)`, `isoToLocalDateTime(iso)`, `localDateTimeToIso(v)`, `getErrorMessage(err)` (401 → "Your session has expired…")
  - `<StatusBadge kind='event'|'application' status={string}/>`: event → draft neutral / published success / in_progress info / completed neutral / cancelled error; application → interested info / accepted success / waitlisted warning / rejected error / cancelled neutral
  - `<PageHeader title description? actions?/>`
  - `<AppShell navItems={{to,label}[]} children>` — brand header, responsive horizontal nav (NavLink active state), role badge from `useAppUser`, Sign out via `useClerk()`. If the existing design-system `NavBar` fits (check its props), use it instead of bespoke markup.

- [ ] **Step 1:** Write `useApi.ts`:

```ts
export function useApiQuery<T>(fetcher: (token: string) => Promise<T>, deps: unknown[] = []) {
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const result = await fetcherRef.current(token);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, getToken, tick, ...deps]);

  const refetch = useCallback(() => setTick(t => t + 1), []);
  return { data, loading, error, refetch };
}
```

- [ ] **Step 2:** Write `useApiMutation` (fn kept in a ref; `mutate` sets pending, clears error, throws after recording error), `useMyNgo` (first membership is primary), `format.ts` (as Interfaces above), `StatusBadge`, `PageHeader`, `AppShell`, barrel exports.

- [ ] **Step 3: Verify** — `npm run type-check`.

---

### Task 4: Volunteer Dashboard + Discover Events

**Files:**
- Rewrite: `apps/web/src/pages/volunteer/DashboardPage.tsx`
- Create: `apps/web/src/pages/volunteer/DiscoverPage.tsx`

**Interfaces:**
- Consumes: `getMyVolunteerProfile` (null → nudge), `listMyApplications`, `listPublicEvents`, `StatusBadge`, `PageHeader`, `AppShell`, format utils
- Produces: pages routed at `ROUTES.VOLUNTEER.DASHBOARD` / `ROUTES.VOLUNTEER.DISCOVER`

- [ ] **Step 1: Dashboard** — hooks at top (never after early returns): profile, applications, public events queries joined client-side:

```ts
const enriched = useMemo(() => {
  const map = new Map((eventsQ.data ?? []).map(e => [e.id, e]));
  return (appsQ.data ?? []).map(a => ({ ...a, event: map.get(a.event_id) ?? null }));
}, [appsQ.data, eventsQ.data]);
const ACTIVE = ['interested', 'accepted', 'waitlisted'];
const upcoming = enriched
  .filter(x => ACTIVE.includes(x.status) && x.event && isUpcoming(x.event.start_at))
  .sort((a, b) => new Date(a.event!.start_at).getTime() - new Date(b.event!.start_at).getTime());
```

Layout: PageHeader ("Dashboard"), "What should I do next?" card — profile null → "Create your volunteer profile" CTA → profile; upcoming empty → "Explore events" CTA → discover; else next-upcoming event card (title, date, status badge, link to My Events). Stats row (upcoming count, total registrations — supportable data only) + muted card "Impact insights (service hours, karma, reliability) are planned for a later step." Upcoming registrations list (top 5). Loading → skeletons; error → ErrorState with Try Again (`refetch`). Step 7+ nav items (My Impact, Karma, Agent, Settings) intentionally absent.

- [ ] **Step 2: Discover** — `listPublicEvents` + client-side filters: text search (title/description/cause/venue), cause dropdown (distinct from data), date window (All / Next 7 days / Next 30 days). Distance filter NOT rendered (backend has no geo params — do not fake it). Cards: title, cause, venue, `formatDateTime`, capacity; whole card links to `/volunteer/events/:id`. Empty: no events at all → "No public events available right now."; filtered empty → "No events match your filters." + Clear filters button. Error → ErrorState + Try Again.

- [ ] **Step 3: Verify** — typecheck.

---

### Task 5: Volunteer Profile (create/edit + availability)

**Files:**
- Create: `apps/web/src/pages/volunteer/ProfilePage.tsx`, `apps/web/src/components/volunteer/ProfileForm.tsx`, `apps/web/src/components/volunteer/AvailabilityList.tsx` + barrel updates

**Interfaces:**
- Consumes: profile endpoints, availability endpoints, `createVolunteerProfileSchema`/`updateVolunteerProfileSchema`/`createAvailabilitySchema`/`updateAvailabilitySchema` from `@sevasetu/validation`, `USER_ROLES`-independent status enums (read exact visibility/recurrence enum values from `packages/validation/src/index.ts` before wiring selects)
- Produces: routed at `ROUTES.VOLUNTEER.PROFILE`

- [ ] **Step 1: ProfilePage** — `useApiQuery(getMyVolunteerProfile, [])`; loading → skeleton; error → ErrorState; `data === null` → create mode (header "Create your profile"); else edit mode (read-only summary card + `ProfileForm mode='edit' initial={profile}` + `AvailabilityList`). Success alert (role="status") "Profile updated successfully." / "Profile created successfully." on save.

- [ ] **Step 2: ProfileForm** — fields: name (required), photo_url (optional), bio (optional textarea), home_geo as lat/lng optional numbers with privacy note ("Used only for distance matching; your exact location is never public"), max_distance_km (optional number), causes chip input (type + Add, removable chips), emergency_available checkbox, profile_visibility + history_visibility selects (enum values from validation source), notification_preferences → `null` with "coming later" note. Submit: build full payload (`photo_url: v || null`, `home_geo: lat&&lng ? { lat: Number(lat), lng: Number(lng) } : null`, `max_distance_km: v === '' ? null : Number(v)`, `causes: chips.length ? chips : null`), `schema.safeParse`, map `parsed.error.issues` → `fieldErrors[String(issue.path[0])]`, render inline field errors; on success call `createMyVolunteerProfile` or `updateMyVolunteerProfile` (edit sends full object — update schema accepts it), disable submit while pending, surface backend error via `getErrorMessage`. Server is authoritative.

- [ ] **Step 3: AvailabilityList** — query rows; Add form with mode radio: "Weekly hours" (weekday select 0–6, start/end time, payload `{ weekday: Number(w), start_time, end_time, available_date: null, is_available: true, recurrence: 'weekly' }`) | "Date exception" (date input, all-day checkbox, optional times, payload `{ weekday: null, available_date: date, start_time: t1, end_time: t2 }` — both or neither; plus optional "Not available on this date" toggle → `is_available: false` with no times). Validate with `createAvailabilitySchema.safeParse` before POST; inline edit per row (same form, PATCH via `updateAvailabilitySchema`-validated merged payload); Delete with confirm Modal; pending disabled; empty state "No availability added yet…". Row label: weekly → `Every {Weekday} · {start}–{end}`; date → date + (all day | times | Not available).

- [ ] **Step 4: Verify** — typecheck.

---

### Task 6: Volunteer My Events + Event Details (register/cancel)

**Files:**
- Create: `apps/web/src/pages/volunteer/MyEventsPage.tsx`, `apps/web/src/pages/volunteer/EventDetailsPage.tsx`

**Interfaces:**
- Consumes: `listMyApplications`, `listPublicEvents` (join), `getPublicEvent`, `createApplication`, `cancelMyApplication`, `getMyVolunteerProfile`, `StatusBadge`, Modal (confirm)
- Produces: routed at `ROUTES.VOLUNTEER.EVENTS` and `ROUTES.VOLUNTEER.EVENT_DETAILS(:id)`

- [ ] **Step 1: MyEventsPage** — applications × public events join (missing event → title "Event details unavailable", no link). Tabs: Upcoming (active status + `isUpcoming(start_at)`), Past (start_at past, status ≠ cancelled), Cancelled (status = cancelled). Rows: title, `formatDateTime`, venue, StatusBadge, actions: View (public event only) + Cancel (upcoming + active only; confirm Modal; `cancelMyApplication`; refresh; friendly 409 handling; success alert "Registration cancelled."). Empty per tab (§71 wording pattern). Loading skeletons; error ErrorState.

- [ ] **Step 2: EventDetailsPage** — `useParams` id; `getPublicEvent` (+`listMyApplications`, `getMyVolunteerProfile` in parallel). 404 → "This event could not be found or is not publicly visible." Sections: header (title, StatusBadge, cause, venue, `formatDateTime(start_at)`–`formatTime(end_at)`, capacity), description. Registration panel:
  - my active application exists → StatusBadge + (approval_required & interested) note "Waiting for the organizer to confirm." + Cancel registration (confirm modal)
  - no profile → disabled CTA "Create your profile to register" linking to profile (backend would 403 PROFILE_REQUIRED)
  - else Register button (pending disabled) → `createApplication`; success: open event → Alert "You're registered for this event." + View My Events link; approval_required → "Your request has been sent — the organizer will review it."; refetch applications

```ts
function registrationError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'EVENT_CAPACITY_REACHED') return 'This event is currently full.';
    if (err.code === 'DUPLICATE_RECORD') return 'You already have a registration for this event.';
    if (err.code === 'PROFILE_REQUIRED') return 'Create your volunteer profile before registering.';
  }
  return getErrorMessage(err);
}
```

- [ ] **Step 3: Verify** — typecheck.

---

### Task 7: NGO Dashboard + Events list

**Files:**
- Rewrite: `apps/web/src/pages/ngo/DashboardPage.tsx`
- Create: `apps/web/src/pages/ngo/EventsPage.tsx`

**Interfaces:**
- Consumes: `useMyNgo` (gate: loading → skeleton; error → ErrorState; no membership → EmptyState "You're not linked to an NGO yet…"), `listNgoEvents`, `listNgoApplications`
- Produces: `DashboardContent({ ngoId, ngoName, membershipRole })` child component so data hooks live below the membership gate; routed at `ROUTES.NGO.DASHBOARD` / `ROUTES.NGO.EVENTS`

- [ ] **Step 1: Dashboard** — "What needs my attention?" card: pending registrations count (`['interested','waitlisted'].includes(status)` across NGO apps) → link to manage; "Upcoming events" table (Event / Date / Capacity / Registration mode / Status / Manage → detail), sorted by `start_at` asc; quick actions (Create event, Organization profile). Step 7+ KPIs (roster completion, attendance, analytics) NOT shown — one muted "planned for a later step" note. Loading/empty ("No events yet — create your first event.")/error states.

- [ ] **Step 2: EventsPage** — `listNgoEvents`; status filter (All + EVENT_STATUSES); rows/cards: title, `formatDate(start_at)`, venue, capacity, registration mode, StatusBadge, Manage link; Create event button (PageHeader actions). Empty/error/loading states.

- [ ] **Step 3: Verify** — typecheck.

---

### Task 8: NGO Event Create + Event Detail (edit, lifecycle, registrations)

**Files:**
- Create: `apps/web/src/pages/ngo/EventCreatePage.tsx`, `apps/web/src/pages/ngo/EventDetailsPage.tsx`, `apps/web/src/components/ngo/EventForm.tsx`, `apps/web/src/components/ngo/RegistrationsPanel.tsx` + barrel updates

**Interfaces:**
- Consumes: `createEventSchema`/`updateEventSchema` (validation package), event + application endpoints, Modal confirms, `StatusBadge`, `decideNgoApplication`
- Produces:
  - `EventForm({ ngoId, initial?: EventRow, submitLabel, pending, error, onSubmit(values) })` — create validates `createEventSchema.safeParse({ ...values, ngo_id: ngoId })`; edit validates `updateEventSchema` (no ngo_id); datetime-local ⇄ ISO via format utils
  - routed at `ROUTES.NGO.CREATE_EVENT` and `ROUTES.NGO.EVENT_DETAILS(:id)`
  - `RegistrationsPanel({ ngoId, eventId, registrationMode })`

- [ ] **Step 1: EventForm** — fields: title, description, cause, venue, geo (optional lat/lng), start_at + end_at (`datetime-local`; ISO on submit; end > start validated by schema), capacity (positive int), visibility (public/ngo_only — with hint "ngo_only events are hidden from public discovery"), registration_mode (open/approval_required — hint "approval: volunteers land in Interested until you confirm"), status select (Draft/Published; edit mode only for status changes here). Zod `safeParse` → field errors; pending disabled; backend errors via `getErrorMessage` (403 ngo_id mismatch should not occur — ngo_id injected).

- [ ] **Step 2: EventCreatePage** — `useMyNgo` gate as in Task 7; on success `navigate(ROUTES.NGO.EVENT_DETAILS(event.id))` (resulting state visible = success per §72).

- [ ] **Step 3: EventDetailsPage** — NGO-scope fetch: `listNgoEvents` → find by id (no single-event GET exists for NGO scope); not found → "This event could not be found in your organization." Read view: header + summary grid (status, visibility, registration mode, capacity, venue, start/end). Actions:
  - Edit → toggles `EventForm` initialized from row (dates via `isoToLocalDateTime`); PATCH; success alert; refetch; exit edit
  - Publish / Unpublish (draft↔published via PATCH `{ status }`)
  - Cancel event (confirm modal → PATCH status 'cancelled')
  - Delete (confirm modal → DELETE → navigate to events list). All destructive confirmations per Rule 4.

- [ ] **Step 4: RegistrationsPanel** — `listNgoApplications` filtered `event_id`; summary chips (pending/accepted/waitlisted/rejected counts); rows: `Volunteer ${id.slice(0, 8)}`, applied `formatDate(created_at)`, StatusBadge, decision buttons **only if** `registrationMode === 'approval_required' && ['interested','waitlisted'].includes(status)` — Accept, Waitlist, Reject (reject confirm modal; open events would 409 REGISTRATION_NOT_REVIEWABLE — never offered). Pending disabled per row. Friendly 409 (`APPLICATION_NOT_REVIEWABLE`) via code check. Empty: "No registrations yet for this event." Muted note: volunteer names arrive with the volunteer directory (later step) — do not fake. Loading/empty/error states.

- [ ] **Step 5: Verify** — typecheck.

---

### Task 9: NGO Profile (public vs private, admin-only edit)

**Files:**
- Create: `apps/web/src/pages/ngo/ProfilePage.tsx` (+ `components/ngo/NgoProfileForm.tsx` if it keeps the page under ~300 lines), routed at new `ROUTES.NGO.PROFILE = '/ngo/profile'` (brief explicitly requires an NGO Profile page; note the ROUTES addition in the final report)

**Interfaces:**
- Consumes: `useMyNgo` gate; `getNgoProfile` (includes private `contact`), `updateNgoProfile`, `updateNgoProfileSchema`; membership `role` drives edit affordance (admin only — coordinator sees read-only + "Only organization admins can edit"); backend `authorizeNgoMember(adminOnly)` remains authoritative
- Produces: NGO profile page; privacy rule — `contact` JSON rendered only in a clearly-marked "Private" section, never in any public-facing markup

- [ ] **Step 1: Read view** — Public section: name, description, causes chips, region, logo_url, location; Private section (visually distinct card): contact JSON pretty-printed + "Never shown publicly." Edit toggle (admin).

- [ ] **Step 2: Edit form** — name, description, causes (chips), region, geo (lat/lng), logo_url, contact textarea (client-side `JSON.parse` + `jsonObjectSchema` validation with clear error); PATCH; success alert; back to read view.

- [ ] **Step 3: Verify** — typecheck.

---

### Task 10: Route wiring + barrels

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/routes/index.ts` (add `NGO.PROFILE` only), barrel `index.ts` files touched by Tasks 4–9

- [ ] **Step 1:** Wrap pages — volunteer group under `RequireRole allowedRoles={[USER_ROLES.VOLUNTEER]}` with `<AppShell navItems={VOLUNTEER_NAV}>` (Dashboard, Discover, My Events, Profile); NGO group under `[USER_ROLES.NGO_ADMIN, USER_ROLES.NGO_COORDINATOR]` with NGO nav (Dashboard, Events). Static `/ngo/events/create` before `/ngo/events/:id` (v6 rank-based matching handles this; keep explicit order for clarity). Add `EVENT_DETAILS` route with `useParams` pages. Do not touch public routes, auth routes, `/design-system`, `/unauthorized`, 404 catch-all, `ClerkProvider`, or any auth logic.

- [ ] **Step 2: Verify** — `npm run type-check && npm run build`.

---

### Task 11: Full verification + manual route inspection

- [ ] **Step 1: Commands** (expected: all pass; report honestly if backend can't run for lack of env)

```bash
cd apps/api && npm run type-check && npm run build && npm test
cd apps/web && npm run type-check && npm run build
git diff --check
```

- [ ] **Step 2: Browser check** (browser-use MCP; start `apps/web` dev server; backend only if `.env` present): verify each route renders a non-blank state — including API-down error states — for: `/volunteer/dashboard`, `/volunteer/discover`, `/volunteer/events`, `/volunteer/events/:id`, `/volunteer/profile`, `/ngo/dashboard`, `/ngo/events`, `/ngo/events/create`, `/ngo/events/:id`, `/ngo/profile`; cross-role guard (volunteer → `/ngo/dashboard` lands on `/unauthorized`); keyboard tab-through on one form; narrow-viewport (mobile) single-column check on dashboard + events list.

- [ ] **Step 3:** Final read-only review; fixed-format report. **No commit. No push.**
