# SevaSetu Step 5 Implementation Reference

Status: FINALIZED

## Scope
Implement the already-defined Step 5 database and core data foundation according to the existing SevaSetu source documents. This file authorizes implementation only; it does not replace, extend, or modify product requirements.
This file records the explicit Step 5 implementation decisions approved by the project owner below.

## Authoritative Sources
- `Docs/seva setu backend schema.docx` - database schema
- `Docs/seva setu security and access.pdf` - authentication assumptions, roles, ownership, permissions, and data access rules
- `Docs/seva setu new prd-compressed.pdf` - product requirements and business context
- `Docs/seva setu technical architecture document.pdf` - system architecture
- `Docs/seva setu frontend specifications.pdf` - frontend-facing data requirements
- `Docs/seva setu app flow.pdf` - application workflows
- `Docs/SevaSetu feature list.docx` - feature tickets
- `PROJECT_RULES.md` - repository execution and verification rules

Implementation must preserve the existing Step 4 authentication architecture and must not infer or invent undocumented schema or access rules.

## Approved Step 5 Decisions

These decisions resolve implementation conflicts or fill implementation details approved by the project owner. They apply to Step 5 only.

### Volunteer Visibility
- `volunteer_profiles.profile_visibility` is `BOOLEAN NOT NULL`.
- `volunteer_profiles.history_visibility` is `BOOLEAN NOT NULL`.
- `TRUE` means intentionally visible according to the documented privacy rules; `FALSE` means private.
- This resolves the source conflict: the Backend Schema specifies `TEXT NOT NULL` for both columns, while the Technical Architecture specifies `BOOLEAN` for both.

### NGO Affiliations
- Allowed statuses are `invited`, `active`, `rejected`, and `ended`.
- `invited` means awaiting the volunteer's response; `active` means accepted; `rejected` means declined; `ended` means a previously active affiliation ended.
- This resolves the source conflict: the Backend Schema lists `invited`, `active`, and `ended`; the Technical Architecture also lists `rejected`.

### NGO Members versus NGO Affiliations
- `ngo_members` and `ngo_affiliations` represent two different relationships and must not be conflated.
- `ngo_members` is the NGO staff/access relationship (NGO admins and coordinators) used for backend authorization. It must not use the volunteer invitation lifecycle, and the volunteer invitation statuses (`invited`, `active`, `rejected`, `ended`) must not be added to `ngo_members.status`.
- `ngo_affiliations` is the volunteer ↔ NGO relationship. The documented invitation workflow applies exclusively to `ngo_affiliations.status`: an NGO admin creates the invitation; the volunteer receives it and accepts or declines; acceptance makes the affiliation `active`, declination makes it `rejected`; an existing affiliation can later become `ended`.
- `ngo_members.status` remains `TEXT NOT NULL` without a CHECK constraint because no source document defines its allowed values or lifecycle. Do not invent membership status transitions; NGO onboarding/active-membership enforcement needs a documented status rule.
- This decision records the resolution of the previous review blocker: the apparent status conflict between the two tables was resolved by distinguishing the staff/access relationship model (`ngo_members`) from the volunteer/NGO relationship model (`ngo_affiliations`), not by redefining either table.

### Event Registration Mode
- `events.registration_mode` uses the enum values `open` and `approval_required`.
- The Technical Architecture includes this field but the Backend Schema's `events` table omits it. The approved decision is to include it with these values.

### NGO Status
- Allowed `ngos.status` values are `pending`, `verified`, `rejected`, and `suspended`.

### Public NGO Information
- Publicly discoverable profile fields are the schema's `name`, `description`, `causes`, public location (`region` and/or `geo`), and `logo_url`.
- The `contact` JSONB column is private by default. No arbitrary JSON contents may be exposed.
- Existing frontend/app-flow documents also describe established year, events conducted, volunteer participation, activity/transparency indicators, and public reports where available. These are public presentation requirements only where supported by their documented source records; do not add undocumented columns or tables to `ngos` to supply them.
- No additional public NGO fields are implied by this decision.

### Event Capacity
- Capacity is consumed only by accepted/confirmed participation.
- For the documented `applications.status` values, `accepted` consumes capacity; `interested`, `waitlisted`, `rejected`, and `cancelled` do not.
- `pending` and `withdrawn` are not values in the Backend Schema's application status list; do not add them. If later documented, they do not consume capacity under this decision.

### Availability
- Support recurring weekly windows and date-specific exceptions using the Backend Schema's fields.
- A date-specific exception overrides recurring availability for that date.
- Do not add recurrence types beyond the documented model. Validate recurring-window versus date-exception field combinations in the application where the schema does not express the invariant; do not invent extra database enum values or recurrence rules.

### Foreign-Key Deletion
- Use PostgreSQL's restrictive default (`NO ACTION`/`RESTRICT`) for core ownership relationships to preserve business history.
- Do not use `CASCADE` unless a later explicit source decision identifies a safely dependent record. No non-default cascade behavior is approved here.

### Authentication and RLS
- Preserve: Clerk is identity/session authority; Supabase application data and `users.role` remain authoritative for application authorization; the backend remains the trusted API/security boundary.
- Never expose the Supabase service-role key to the frontend.
- All database access follows the backend-mediated flow: Browser -> Clerk authentication -> Backend API with Clerk Bearer token -> backend verifies the Clerk token -> backend retrieves the matching Supabase `users` record -> backend authorizes with `users.role` -> backend accesses Supabase through the trusted server-side service-role client.
- The browser never connects to Supabase using the service-role key. The service-role key remains server-side and is never exposed to the frontend.
- Service-role queries bypass RLS and must not be described as protected by RLS. Backend application authorization remains required.
- RLS is defense-in-depth where compatible with this architecture. Do not add direct browser-to-Supabase access or a custom Clerk-to-Supabase JWT/identity propagation mechanism. Do not assume `app.current_clerk_user_id` is populated. Any policy needing request identity propagation must not be implemented until its mechanism is documented and validated.

### PRD Readability
- The PRD PDF is image-based and its substantive text could not be reliably extracted in this environment. Do not infer requirements from it. Use readable PRD-derived information already present in the other finalized SevaSetu documents.

## Recorded Source Conflicts

- Backend Schema versus Technical Architecture: the two volunteer visibility fields are `TEXT` in the Backend Schema and `BOOLEAN` in the Technical Architecture. The approved Step 5 representation is `BOOLEAN` as recorded above.
- Backend Schema versus Technical Architecture: NGO affiliation statuses differ on `rejected`. The approved status set includes `rejected` as recorded above.
- Technical Architecture versus Backend Schema: `events.registration_mode` appears in the Technical Architecture and is absent from the Backend Schema's event columns. The approved Step 5 decision is to include `open` and `approval_required`.
- Backend Schema §2.1 lists Clerk "Role claims"; the Security document assigns authorization to backend permissions, Supabase RLS, application role checks, and ownership checks. Step 4 remains authoritative: roles are resolved from Supabase `users.role`, not trusted from Clerk claims.

## Remaining Implementation Constraints

- The documents specify public NGO profile and transparency presentation requirements but do not completely map every presentation field to a public base-table column. Apply only the public fields enumerated above and fields explicitly marked public in documented source records; keep `contact` private.
- The approved backend-mediated access architecture resolves the Clerk-to-RLS identity blocker: Step 5 is unblocked. Do not rely on RLS for service-role backend queries; enforce authorization in the backend.
- Do not add or claim per-user/tenant RLS policies that require identity propagation. If useful policies cannot be expressed compatibly without that propagation, record that limitation and retain backend authorization rather than inventing a mechanism.
- The Backend Schema defines `ngo_members.status` as required `TEXT` but does not define its allowed values or lifecycle. Do not invent a membership status to create bootstrap memberships or to decide whether a member is active; NGO onboarding/active-membership enforcement needs a documented status rule. This remains the case after the members-versus-affiliations decision above: `ngo_members.status` stays `TEXT NOT NULL` with no CHECK constraint rather than adopting the volunteer invitation statuses, which belong to `ngo_affiliations.status` only.
- PRD-specific requirements remain unverified because the PRD PDF's substantive text is not extractable; implementation must not add requirements based on that file until readable source text is available.
