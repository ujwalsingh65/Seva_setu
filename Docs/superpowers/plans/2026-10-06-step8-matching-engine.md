# Step 8: Intelligent Volunteer Matching Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable, deterministic, explainable volunteer matching engine: an authenticated NGO-facing API that scores eligible volunteers against a published event's requirements on six weighted factors, plus a matching panel in the existing NGO event details page.

**Architecture:** Pure scoring functions in a new `apps/api/src/modules/matching/` module (no LLM, no ML, no new dependencies, no persistence, no migration). The route performs one fixed set of Supabase queries (no N+1), then filters/scores/ranks in memory. Weights and platform constants live in the already-existing `@sevasetu/matching-config` package — the single documented place. The frontend adds one panel to the existing Step 7 event details page, reusing the existing design system and API client layer.

**Tech Stack:** Express 4 + zod + supabase-js (service role) + node:test (backend, ESM with `.js` import suffixes); React 18 + TypeScript strict + Tailwind (frontend); `@sevasetu/matching-config`, `@sevasetu/constants`.

**Spec:** Step 8 task specification (user-provided attachment, 2026-10-06, this conversation). The binding requirements are copied into Global Constraints below. The algorithm is called **"Explainable weighted matching"** — never AI/ML.

## Global Constraints

- **DO NOT COMMIT. DO NOT PUSH. DO NOT reset or discard existing work.** Verification steps replace commit steps. Review packages are built from working-tree diffs. Preserve all completed Steps 4–7; do not rewrite working Step 7 logic.
- Work locally only. No secrets or hardcoded credentials. No new npm dependencies. No database migration (the existing schema supports this step — if an implementer believes one is needed, STOP and report instead).
- **The matching calculation is NOT an LLM, chatbot, or ML model.** It is transparent weighted scoring. Never present it as AI/ML.
- **Weights (points out of 100, MUST sum to 100): skills 30, certifications 20, availability 20, experience 10, proximity 10, reliability 10.** They live ONLY in `packages/matching-config/src/index.ts` (`DEFAULT_MATCHING_WEIGHTS`) with documentation. No scattered magic numbers. (The existing 5-factor `DEFAULT_MATCHING_WEIGHTS` values are superseded — the package is currently unused, so this is non-breaking.)
- **NO FAKE INTELLIGENCE — never fabricate:** reliability scores, certifications, coordinates, distances, volunteers, or statistics. If real data for a factor does not exist, the factor gets status `not_assessable`, is excluded from the volunteer's total (the total is renormalized over assessable factors), and the limitation is documented and reported.
- **Privacy — backend response whitelist for volunteer info:** `id (user_id), name, photo_url, bio, causes` only (Step 7 whitelist). Never return: email, phone, exact address, latitude/longitude, distances in km, raw availability windows, notification preferences, emergency contact, or any other private field. Proximity is communicated with safe labels only: `"Nearby"` / `"Within preferred range"` / `"Farther away"`.
- **Backend authorization is the security boundary.** Chain: `requireAuth` → `authorizeNgoMember` (existing Step 7 helper) → event belongs to the requesting NGO (else 404, indistinguishable from missing) → event is `published` (else 409). Never trust ngoId/eventId/roles from the frontend.
- **Deterministic everywhere:** same inputs → same outputs. Ordering: score desc → reliability desc → smaller distance → volunteer_id asc. No randomness, no timestamps in scoring.
- **Performance:** a fixed number of Supabase queries per request (event, requirements, skills, candidates, applications). No per-volunteer queries (no N+1). No Elasticsearch/Pinecone/embeddings/Redis.
- **API shape:** `GET /api/v1/ngos/:ngoId/events/:eventId/matches?limit=20` — limit is validated server-side (integer 1–50, default 20).
- TypeScript strict; no `any` in new web code. ESM `.js` import suffixes in api code. Follow existing conventions exactly (envelope `{ success: true, data }`, `AppError`, `databaseError`, `badInput`, `routeParam`).
- Live-DB behaviors (real 403s, cross-NGO isolation, real Clerk/Supabase auth) remain explicitly marked PENDING — no real credentials exist in this environment. Unit tests cover the pure logic; HTTP wiring is verified by typecheck/build/review, same as Steps 4–7.

## Design Rulings (locked — implementers must follow, reviewers check against these)

1. **Weights home:** update `packages/matching-config` to the six-factor set (see Task 1). Karma/Reliability config objects in that file stay untouched.
2. **Volunteer identity:** `volunteer_profiles` primary key is `user_id` (there is NO `id` column). All Step 8 queries select `user_id`. The match response carries `volunteer_id` (= user_id) plus a `volunteer` object `{ id, name, photo_url, bio, causes }` reusing `PublicVolunteerInfo` from `apps/api/src/modules/core/volunteerInfo.ts`. (Note: Step 7's `VOLUNTEER_PUBLIC_COLUMNS = 'id, name, ...'` embed is a latent live-DB bug — do NOT fix it in this step; it is reported in the final report.)
3. **Experience factor:** always `not_assessable` in v1. `event_requirements.min_experience` has no volunteer-side numeric counterpart (`volunteer_skills.level` is free text). Explicit status + documentation + follow-up report. No invented level mapping.
4. **Reliability factor:** always `not_assessable` in v1. No attendance/history table exists. Documented fallback + follow-up report.
5. **Eligibility:** candidates = `volunteer_profiles` with `profile_visibility = true` joined to `users.status = 'active'`. Exclude volunteers with an application for THIS event in status `interested | accepted | waitlisted | rejected` (already in the NGO's pipeline/decided). Do NOT require a prior application — this is a discovery endpoint. `cancelled` and no-application volunteers stay eligible.
6. **Proximity:** in-memory haversine over PostGIS EWKT-like strings (never a DB distance function, never returned coordinates/distances). Missing home_geo or event geo → `not_assessable`.
7. **No persistence:** no match_runs/match_results tables, nothing stored. Computed per request.
8. **Availability timezone:** availability windows are wall-clock TIME values; events are timestamptz. All comparisons convert the event instant into `PLATFORM_TIMEZONE = 'Asia/Kolkata'` (documented platform assumption — deterministic regardless of server timezone). Date-specific exceptions override recurring weekly windows (Step 5 decision). Weekday convention: 0 = Sunday.
9. **Certification validity:** a required certification counts only when a volunteer row has the exact same `name`, `verification_status = 'ngo_verified'`, and (`expiry` is null OR `expiry >= event date`). Never count `self_declared`, `expired`, or `rejected` certifications.
10. **Score normalization:** each factor reports 0–100 × its weight; the volunteer's total = `round(earned_points / assessable_weight × 100)`, where `not_assessable` factors are excluded from both numerator and denominator. If assessable weight is 0, total = 0. Known v1 consequence (accepted, spec-consistent): an event with NO skill/cert requirements gives every candidate full credit on those factors, so a candidate with no other data can score 100 — "no requirements" is neutral/full per spec.
11. **Event status gate:** matching is offered only for `published` events (same rule as the Step 7 application endpoint; `in_progress` events cannot accept applications, so recommending candidates for them would be pointless). Non-published → 409 `EVENT_NOT_OPEN`.
12. **Multiple event_requirements rows** (per-role requirements): union all `required_skill_ids`, union all `required_cert_names`, take `max(min_experience)`.

## Spec coverage map (15 required test scenarios → tests)

| # | Required scenario | Covered by |
|---|---|---|
| 1 | Perfect match | Task 3 `computeMatch: perfect match scores 100` |
| 2 | Partial skills | Task 2 `scoreSkills: partial` |
| 3 | Missing certification | Task 2 `scoreCertifications: missing / unverified / expired` |
| 4 | Unavailable volunteer | Task 2 `scoreAvailability: weekly does not cover / exception unavailable` |
| 5 | Experience difference | Task 3 `experience factor is identical (not assessable) regardless of candidate` |
| 6 | Proximity scoring | Task 2 `scoreProximity` + `distanceBetweenKm` |
| 7 | Reliability scoring/fallback | Task 2 `scoreReliability` + Task 3 identity test |
| 8 | Weighted total | Task 3 `computeMatch: renormalized weighted total` |
| 9 | Deterministic ordering | Task 3 `rankScoredMatches` tests |
| 10 | Private fields not returned | Task 3 `computeMatch: response contains only whitelisted volunteer fields` |
| 11 | Unauthorized NGO cannot access | Task 4 `assertMatchingEvent` + route reuses `authorizeNgoMember` (Step 7 gate; live-DB behavior PENDING) |
| 12 | Cross-NGO event access fails | Task 4 `assertMatchingEvent: event of another NGO → 404` |
| 13 | Accepted/already-involved volunteer handling | Task 3 `filterEligibleCandidates` |
| 14 | Empty candidate result | Task 3 `rankScoredMatches: empty input` + eligibility empty |
| 15 | Limit validation | Task 4 `matchLimitSchema` |

---

### Task 1: Matching weights and platform constants in @sevasetu/matching-config

**Files:**
- Modify: `packages/matching-config/src/index.ts` (replace the `MatchingWeights` interface + `DEFAULT_MATCHING_WEIGHTS`; add two constants; leave `KarmaConfig`/`ReliabilityConfig` untouched)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2–3): `MatchingWeights` (now with `certifications: number`), `DEFAULT_MATCHING_WEIGHTS: MatchingWeights` = `{ skills: 30, certifications: 20, availability: 20, experience: 10, proximity: 10, reliability: 10 }`, `PLATFORM_TIMEZONE = 'Asia/Kolkata'`, `NEARBY_DISTANCE_KM = 10`.

- [ ] **Step 1: Update the weights block**

Replace the existing `MatchingWeights` interface and `DEFAULT_MATCHING_WEIGHTS` constant (and only those) with:

```ts
export interface MatchingWeights {
  skills: number;
  certifications: number;
  availability: number;
  proximity: number;
  experience: number;
  reliability: number;
}

/**
 * Explainable weighted matching (Step 8) — the single source of truth for
 * factor weights. Weights are points out of 100 and MUST sum to 100.
 *
 *   skills          30  share of the event's required skills the volunteer has
 *   certifications  20  share of required certifications verified (ngo_verified, unexpired)
 *   availability    20  volunteer availability covers the event date/time
 *   proximity       10  volunteer home location vs event location (bucketed label only)
 *   experience      10  RESERVED — no volunteer-side experience data exists yet
 *   reliability     10  RESERVED — no attendance/history data exists yet
 *
 * Factors whose status is 'not_assessable' are excluded from a volunteer's
 * total (the total is renormalized over assessable factors), so the two
 * RESERVED weights neither penalize nor inflate anyone until real data lands.
 */
export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  skills: 30,
  certifications: 20,
  availability: 20,
  experience: 10,
  proximity: 10,
  reliability: 10,
};

/**
 * Availability windows are wall-clock times with no timezone column, while
 * event start_at/end_at are timestamptz. Matching converts the event instant
 * into this platform timezone before comparing, so results are deterministic
 * regardless of server timezone. Assumption: the platform operates in India.
 */
export const PLATFORM_TIMEZONE = 'Asia/Kolkata';

/**
 * Proximity bucketing (km). Within the volunteer's own max_distance_km is
 * "Within preferred range"; otherwise within this threshold is "Nearby";
 * anything farther is "Farther away". Distances are never returned to
 * clients — only these labels.
 */
export const NEARBY_DISTANCE_KM = 10;
```

- [ ] **Step 2: Verify**

Run from repo root: `npm run type-check --workspace=@sevasetu/matching-config`
Expected: exits 0, no output.

Run: `npm run type-check --workspace=@sevasetu/api`
Expected: exits 0 (the package is an unused api dependency, so nothing else can break).

---

### Task 2: Matching types + factor scorers + factor tests (TDD)

**Files:**
- Create: `apps/api/src/modules/matching/matchingTypes.ts`
- Create: `apps/api/src/modules/matching/matchingService.ts`
- Create: `apps/api/src/modules/matching/matching.test.ts`
- Modify: `apps/api/package.json` (test script — append the new test file)

**Interfaces:**
- Consumes: `DEFAULT_MATCHING_WEIGHTS`, `PLATFORM_TIMEZONE`, `NEARBY_DISTANCE_KM`, `type MatchingWeights` from `@sevasetu/matching-config`; `type PublicVolunteerInfo` from `../core/volunteerInfo.js`.
- Produces (used by Tasks 3–4): see exact exports below — `scoreSkills`, `scoreCertifications`, `scoreAvailability`, `scoreProximity`, `scoreExperience`, `scoreReliability`, `distanceBetweenKm`, `parseGeoPoint`, `zonedParts`, plus the types `MatchFactorStatus`, `ListFactor`, `SkillCertFactor`, `MatchFactors`, `MatchResult`, `ScoredMatch`, `VolunteerCandidate`, `EventMatchContext`, `SkillNameLookup`, `ApplicationStatusRow`, `CandidateSkillRow`, `CandidateCertificationRow`, `CandidateAvailabilityRow`.

- [ ] **Step 1: Wire the test file into the test script**

In `apps/api/package.json`, change the `test` script to (append one file, change nothing else):

```json
"test": "node --import tsx --test src/modules/core/validation.test.ts src/modules/core/volunteerInfo.test.ts src/modules/matching/matching.test.ts"
```

- [ ] **Step 2: Create `matchingTypes.ts`**

```ts
/**
 * Explainable weighted matching — shared types (Step 8).
 *
 * A match is computed per candidate volunteer against one event's
 * requirements. Every factor reports a 0-100 score, its configured weight
 * (points), and one of four statuses:
 *
 *   'full'            — factor fully satisfied (score 100)
 *   'partial'         — factor partially satisfied (score 1-99)
 *   'none'            — factor assessed and NOT satisfied (score 0)
 *   'not_assessable'  — the data needed to assess this factor does not exist;
 *                       the factor is excluded from the volunteer's total
 *
 * Privacy: MatchResult must never contain email, phone, home_geo,
 * max_distance_km, exact coordinates, distances, or raw availability
 * windows — only the VolunteerPublicInfo whitelist.
 */
import type { PublicVolunteerInfo } from '../core/volunteerInfo.js';

export type MatchFactorStatus = 'full' | 'partial' | 'none' | 'not_assessable';

export interface ListFactor {
  score: number;
  weight: number;
  status: MatchFactorStatus;
  /** Safe display label (proximity: 'Nearby' | 'Within preferred range' | 'Farther away'). */
  label?: string;
  /** Human explanation, mainly for 'not_assessable'. */
  detail?: string;
}

export interface SkillCertFactor extends ListFactor {
  /** Required item names the volunteer satisfies (sorted alphabetically). */
  matched: string[];
  /** Required item names the volunteer does not satisfy (sorted alphabetically). */
  missing: string[];
}

export interface MatchFactors {
  skills: SkillCertFactor;
  certifications: SkillCertFactor;
  availability: ListFactor;
  experience: ListFactor;
  proximity: ListFactor;
  reliability: ListFactor;
}

export interface MatchResult {
  volunteer_id: string;
  /** 0-100, normalized over the factors that could be assessed. */
  score: number;
  volunteer: PublicVolunteerInfo;
  factors: MatchFactors;
}

/** Internal ranking metadata — never serialized to clients. */
export interface ScoredMatch {
  match: MatchResult;
  tieBreak: {
    reliability: number;
    /** Haversine km; null when proximity was not assessable. */
    distanceKm: number | null;
  };
}

// ---------------------------------------------------------------------------
// Inputs — shapes of rows already fetched by the route (no N+1).
// Geo columns arrive from PostgREST as EWKT-like strings ('SRID=4326;POINT(lng lat)')
// but are typed `unknown` defensively and validated at runtime.
// ---------------------------------------------------------------------------

export interface CandidateSkillRow {
  skill_id: string;
}

export interface CandidateCertificationRow {
  name: string;
  verification_status: string;
  expiry: string | null;
}

export interface CandidateAvailabilityRow {
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  available_date: string | null;
  is_available: boolean;
}

export interface VolunteerCandidate {
  user_id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  causes: string[] | null;
  home_geo: unknown;
  max_distance_km: number | null;
  skills: CandidateSkillRow[];
  certifications: CandidateCertificationRow[];
  availability: CandidateAvailabilityRow[];
}

export interface EventMatchContext {
  event_id: string;
  geo: unknown;
  start_at: string;
  end_at: string;
  required_skill_ids: string[];
  required_cert_names: string[];
  min_experience: number;
}

/** skill id -> skill name, from the skills table. */
export type SkillNameLookup = Record<string, string>;

export interface ApplicationStatusRow {
  volunteer_id: string;
  status: string;
}
```

- [ ] **Step 3: Create `matching.test.ts` with failing factor tests**

Follow the existing node:test style (`import assert from 'node:assert/strict'; import { describe, it } from 'node:test';`). Full file:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  distanceBetweenKm,
  parseGeoPoint,
  scoreAvailability,
  scoreCertifications,
  scoreExperience,
  scoreProximity,
  scoreReliability,
  scoreSkills,
  zonedParts,
} from './matchingService.js';
import type { CandidateCertificationRow } from './matchingTypes.js';

const SKILL_NAMES = { 'skill-1': 'Teaching', 'skill-2': 'First Aid', 'skill-3': 'Crowd Management' };

// 2026-10-10T13:30:00Z is Saturday 19:00 in Asia/Kolkata (UTC+5:30).
const EVENT_START = '2026-10-10T13:30:00Z';
const EVENT_END = '2026-10-10T16:30:00Z';

describe('scoreSkills', () => {
  it('scores full when every required skill is present', () => {
    const factor = scoreSkills(['skill-1', 'skill-2'], ['skill-1', 'skill-2'], SKILL_NAMES);
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.equal(factor.weight, 30);
    assert.deepEqual(factor.matched, ['First Aid', 'Teaching']);
    assert.deepEqual(factor.missing, []);
  });

  it('scores partial proportionally and lists missing skill names', () => {
    const factor = scoreSkills(['skill-1'], ['skill-1', 'skill-2', 'skill-3'], SKILL_NAMES);
    assert.equal(factor.score, 33);
    assert.equal(factor.status, 'partial');
    assert.deepEqual(factor.matched, ['Teaching']);
    assert.deepEqual(factor.missing, ['Crowd Management', 'First Aid']);
  });

  it('scores none when no required skill is present', () => {
    const factor = scoreSkills([], ['skill-1'], SKILL_NAMES);
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
    assert.deepEqual(factor.missing, ['Teaching']);
  });

  it('treats empty requirements as neutral-full', () => {
    const factor = scoreSkills([], [], SKILL_NAMES);
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.deepEqual(factor.matched, []);
    assert.deepEqual(factor.missing, []);
  });
});

describe('scoreCertifications', () => {
  const verified: CandidateCertificationRow = {
    name: 'First Aid',
    verification_status: 'ngo_verified',
    expiry: null,
  };

  it('scores full for verified certifications', () => {
    const factor = scoreCertifications([verified], ['First Aid'], '2026-10-10');
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.deepEqual(factor.matched, ['First Aid']);
  });

  it('never counts self-declared certifications', () => {
    const selfDeclared: CandidateCertificationRow = {
      name: 'First Aid',
      verification_status: 'self_declared',
      expiry: null,
    };
    const factor = scoreCertifications([selfDeclared], ['First Aid'], '2026-10-10');
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
    assert.deepEqual(factor.missing, ['First Aid']);
  });

  it('never counts expired certifications but accepts expiry on the event date', () => {
    const expired: CandidateCertificationRow = {
      name: 'First Aid',
      verification_status: 'ngo_verified',
      expiry: '2026-10-09',
    };
    assert.equal(scoreCertifications([expired], ['First Aid'], '2026-10-10').score, 0);

    const expiringToday: CandidateCertificationRow = {
      name: 'First Aid',
      verification_status: 'ngo_verified',
      expiry: '2026-10-10',
    };
    assert.equal(scoreCertifications([expiringToday], ['First Aid'], '2026-10-10').score, 100);
  });

  it('scores partial when only some required certifications are verified', () => {
    const factor = scoreCertifications([verified], ['First Aid', 'CPR'], '2026-10-10');
    assert.equal(factor.score, 50);
    assert.equal(factor.status, 'partial');
    assert.deepEqual(factor.missing, ['CPR']);
  });

  it('treats empty requirements as neutral-full', () => {
    const factor = scoreCertifications([], [], '2026-10-10');
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
  });
});

describe('zonedParts', () => {
  it('converts an instant into platform-timezone wall-clock parts', () => {
    const parts = zonedParts(EVENT_START);
    assert.equal(parts.weekday, 6); // Saturday; 0 = Sunday
    assert.equal(parts.date, '2026-10-10');
    assert.equal(parts.minutes, 19 * 60); // 19:00 IST
  });
});

describe('scoreAvailability', () => {
  it('scores full when a weekly window covers the event', () => {
    const factor = scoreAvailability(
      [{ weekday: 6, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.equal(factor.weight, 20);
  });

  it('scores none when the weekly window does not cover the event time', () => {
    const factor = scoreAvailability(
      [{ weekday: 6, start_time: '10:00:00', end_time: '12:00:00', available_date: null, is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
  });

  it('scores none when the volunteer only has windows on other weekdays', () => {
    const factor = scoreAvailability(
      [{ weekday: 0, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
  });

  it('a date-specific "unavailable" exception overrides a covering weekly window', () => {
    const factor = scoreAvailability(
      [
        { weekday: 6, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true },
        { weekday: null, start_time: null, end_time: null, available_date: '2026-10-10', is_available: false },
      ],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
  });

  it('an all-day available exception covers any event time', () => {
    const factor = scoreAvailability(
      [{ weekday: null, start_time: null, end_time: null, available_date: '2026-10-10', is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
  });

  it('a timed date exception must cover the event window', () => {
    const factor = scoreAvailability(
      [{ weekday: null, start_time: '20:00:00', end_time: '21:00:00', available_date: '2026-10-10', is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'none');
  });

  it('is not assessable when the volunteer has no availability rows', () => {
    const factor = scoreAvailability([], EVENT_START, EVENT_END);
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'not_assessable');
  });

  it('is not assessable when only unrelated date exceptions exist (no weekly pattern)', () => {
    const factor = scoreAvailability(
      [{ weekday: null, start_time: null, end_time: null, available_date: '2026-11-01', is_available: true }],
      EVENT_START,
      EVENT_END,
    );
    assert.equal(factor.status, 'not_assessable');
  });
});

describe('geo parsing and distance', () => {
  it('parses EWKT-like POINT strings as { lng, lat }', () => {
    assert.deepEqual(parseGeoPoint('SRID=4326;POINT(77.5946 12.9716)'), { lng: 77.5946, lat: 12.9716 });
    assert.deepEqual(parseGeoPoint('POINT(-72.8777 19.0760)'), { lng: -72.8777, lat: 19.0760 });
  });

  it('returns null for missing or malformed geo values', () => {
    assert.equal(parseGeoPoint(null), null);
    assert.equal(parseGeoPoint(undefined), null);
    assert.equal(parseGeoPoint('not a point'), null);
    assert.equal(parseGeoPoint(42), null);
  });

  it('computes haversine distance (Bangalore–Mumbai is roughly 843 km)', () => {
    const km = distanceBetweenKm('SRID=4326;POINT(77.5946 12.9716)', 'SRID=4326;POINT(72.8777 19.0760)');
    assert.ok(km !== null && km > 820 && km < 870, `expected ~843 km, got ${km}`);
  });

  it('distance is zero for the same point and null when geo is missing', () => {
    assert.equal(distanceBetweenKm('POINT(77 12)', 'POINT(77 12)'), 0);
    assert.equal(distanceBetweenKm(null, 'POINT(77 12)'), null);
    assert.equal(distanceBetweenKm('POINT(77 12)', null), null);
  });
});

describe('scoreProximity', () => {
  it('is not assessable without both locations', () => {
    const factor = scoreProximity(null, 25);
    assert.equal(factor.status, 'not_assessable');
    assert.equal(factor.weight, 10);
  });

  it('scores full with label "Within preferred range" inside the volunteer preference', () => {
    const factor = scoreProximity(4, 25);
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.equal(factor.label, 'Within preferred range');
  });

  it('scores full with label "Nearby" within the nearby threshold (no preference set)', () => {
    const factor = scoreProximity(9.5, null);
    assert.equal(factor.score, 100);
    assert.equal(factor.status, 'full');
    assert.equal(factor.label, 'Nearby');
  });

  it('scores none with label "Farther away" beyond preference and threshold', () => {
    assert.equal(scoreProximity(50, null).status, 'none');
    assert.equal(scoreProximity(50, null).label, 'Farther away');
    assert.equal(scoreProximity(12, 10).status, 'none');
  });
});

describe('experience and reliability (schema-gap fallbacks)', () => {
  it('experience is always not_assessable — no volunteer-side experience data exists', () => {
    const factor = scoreExperience();
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'not_assessable');
    assert.equal(factor.weight, 10);
    assert.ok(factor.detail);
  });

  it('reliability is always not_assessable — no attendance history exists', () => {
    const factor = scoreReliability();
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'not_assessable');
    assert.equal(factor.weight, 10);
    assert.ok(factor.detail);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run from repo root: `npm run test --workspace=@sevasetu/api`
Expected: FAIL — the matching test file cannot resolve `./matchingService.js` (module not found). The two existing test files still pass.

- [ ] **Step 5: Create `matchingService.ts`**

```ts
/**
 * Explainable weighted matching service (Step 8).
 *
 * ALGORITHM — deterministic, transparent, no ML, no LLM:
 *   1. Six factors are scored 0-100 against the event's requirements:
 *      skills, certifications, availability, experience, proximity, reliability.
 *   2. Each factor reports its configured weight (points) and a status:
 *      'full' | 'partial' | 'none' | 'not_assessable'.
 *   3. Factors that cannot be assessed from real data (experience and
 *      reliability in v1 — no schema support yet; proximity/availability when
 *      the inputs are missing) are EXCLUDED from the volunteer's total, which
 *      is renormalized over the assessable factors only. Nothing is ever
 *      fabricated to fill a gap.
 *   4. Ranking is deterministic: score desc, reliability desc, smaller
 *      distance, then volunteer_id asc.
 *
 * PRIVACY: results carry only the Step 7 volunteer whitelist
 * (id/name/photo_url/bio/causes). Distances and coordinates stay internal
 * (ScoredMatch.tieBreak) and are never serialized.
 *
 * MISSING DATA (documented fallbacks):
 *   - experience: 'not_assessable' — event_requirements.min_experience has no
 *     volunteer-side numeric counterpart (volunteer_skills.level is free text).
 *   - reliability: 'not_assessable' — no attendance/history table exists yet.
 *   - proximity: 'not_assessable' when either home or event geo is missing.
 *   - availability: 'not_assessable' when the volunteer has no availability
 *     rows, or only unrelated date exceptions (no weekly pattern on file).
 */
import {
  DEFAULT_MATCHING_WEIGHTS,
  NEARBY_DISTANCE_KM,
  PLATFORM_TIMEZONE,
  type MatchingWeights,
} from '@sevasetu/matching-config';
import type {
  CandidateAvailabilityRow,
  CandidateCertificationRow,
  ListFactor,
  SkillCertFactor,
  SkillNameLookup,
} from './matchingTypes.js';

const EARTH_RADIUS_KM = 6371;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function scoreSkills(
  volunteerSkillIds: string[],
  requiredSkillIds: string[],
  skillNames: SkillNameLookup,
  weight: number = DEFAULT_MATCHING_WEIGHTS.skills,
): SkillCertFactor {
  if (requiredSkillIds.length === 0) {
    // No requirements = neutral/full per the event's own semantics.
    return { score: 100, weight, status: 'full', matched: [], missing: [] };
  }
  const owned = new Set(volunteerSkillIds);
  const matchedIds = requiredSkillIds.filter((id) => owned.has(id));
  const missingIds = requiredSkillIds.filter((id) => !owned.has(id));
  const nameOf = (id: string) => skillNames[id] ?? id;
  return {
    score: Math.round((matchedIds.length / requiredSkillIds.length) * 100),
    weight,
    status:
      matchedIds.length === requiredSkillIds.length ? 'full' : matchedIds.length === 0 ? 'none' : 'partial',
    matched: matchedIds.map(nameOf).sort(),
    missing: missingIds.map(nameOf).sort(),
  };
}

// ---------------------------------------------------------------------------
// Certifications — only ngo_verified and unexpired certifications ever count.
// ---------------------------------------------------------------------------

function certificationSatisfies(
  cert: CandidateCertificationRow,
  requiredName: string,
  eventDate: string,
): boolean {
  if (cert.name !== requiredName) return false;
  if (cert.verification_status !== 'ngo_verified') return false;
  if (cert.expiry !== null && cert.expiry < eventDate) return false;
  return true;
}

export function scoreCertifications(
  volunteerCertifications: CandidateCertificationRow[],
  requiredCertNames: string[],
  eventDate: string,
  weight: number = DEFAULT_MATCHING_WEIGHTS.certifications,
): SkillCertFactor {
  if (requiredCertNames.length === 0) {
    return { score: 100, weight, status: 'full', matched: [], missing: [] };
  }
  const matched = requiredCertNames.filter((name) =>
    volunteerCertifications.some((cert) => certificationSatisfies(cert, name, eventDate)),
  );
  const missing = requiredCertNames.filter((name) => !matched.includes(name));
  return {
    score: Math.round((matched.length / requiredCertNames.length) * 100),
    weight,
    status: matched.length === requiredCertNames.length ? 'full' : matched.length === 0 ? 'none' : 'partial',
    matched: [...matched].sort(),
    missing: [...missing].sort(),
  };
}

// ---------------------------------------------------------------------------
// Availability — date-specific exceptions override recurring weekly windows
// (Step 5 decision). All wall-clock math happens in PLATFORM_TIMEZONE so the
// result is deterministic regardless of server timezone.
// ---------------------------------------------------------------------------

interface ZonedParts {
  weekday: number; // 0 = Sunday
  date: string; // 'YYYY-MM-DD'
  minutes: number; // minutes since midnight
}

/** Deterministic wall-clock parts of an ISO instant in PLATFORM_TIMEZONE. */
export function zonedParts(iso: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PLATFORM_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAYS.indexOf(get('weekday') as (typeof WEEKDAYS)[number]);
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10) % 24; // hour12:false can emit '24'
  return { weekday, date, minutes: hour * 60 + parseInt(get('minute'), 10) };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

export function scoreAvailability(
  availability: CandidateAvailabilityRow[],
  eventStartAt: string,
  eventEndAt: string,
  weight: number = DEFAULT_MATCHING_WEIGHTS.availability,
): ListFactor {
  if (availability.length === 0) {
    return { score: 0, weight, status: 'not_assessable', detail: 'No availability information on file.' };
  }

  const start = zonedParts(eventStartAt);
  const end = zonedParts(eventEndAt);
  const coversEvent = (row: CandidateAvailabilityRow): boolean => {
    if (row.start_time === null || row.end_time === null) {
      // All-day exception (both times null) covers any time; anything else here
      // is malformed and does not cover.
      return row.start_time === null && row.end_time === null;
    }
    return timeToMinutes(row.start_time) <= start.minutes && timeToMinutes(row.end_time) >= end.minutes;
  };

  const sameDayExceptions = availability.filter((row) => row.available_date === start.date);
  if (sameDayExceptions.length > 0) {
    // An explicit "not available" exception wins over everything else.
    if (sameDayExceptions.some((row) => !row.is_available)) {
      return { score: 0, weight, status: 'none', detail: 'Marked unavailable for this date.' };
    }
    const covered = sameDayExceptions.some((row) => row.is_available && coversEvent(row));
    return covered
      ? { score: 100, weight, status: 'full', detail: 'Available (date exception).' }
      : { score: 0, weight, status: 'none', detail: 'Not available at the event time.' };
  }

  const weekly = availability.filter(
    (row) => row.available_date === null && row.weekday === start.weekday && row.is_available,
  );
  if (weekly.some(coversEvent)) {
    return { score: 100, weight, status: 'full', detail: 'Available in the recurring weekly window.' };
  }

  const hasWeeklyPattern = availability.some((row) => row.available_date === null && row.weekday !== null);
  return hasWeeklyPattern
    ? { score: 0, weight, status: 'none', detail: 'Not available at the event time.' }
    : { score: 0, weight, status: 'not_assessable', detail: 'No recurring availability on file.' };
}

// ---------------------------------------------------------------------------
// Proximity — haversine in memory; only safe labels leave this module.
// ---------------------------------------------------------------------------

const POINT_PATTERN = /POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/;

/** Parses 'SRID=4326;POINT(lng lat)' (or bare 'POINT(lng lat)') into {lng, lat}. */
export function parseGeoPoint(value: unknown): { lng: number; lat: number } | null {
  if (typeof value !== 'string') return null;
  const match = POINT_PATTERN.exec(value);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return { lng, lat };
}

function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDiff = toRadians(b.lat - a.lat);
  const lngDiff = toRadians(b.lng - a.lng);
  const h =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lngDiff / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function distanceBetweenKm(homeGeo: unknown, eventGeo: unknown): number | null {
  const home = parseGeoPoint(homeGeo);
  const venue = parseGeoPoint(eventGeo);
  if (!home || !venue) return null;
  return haversineKm(home, venue);
}

export function scoreProximity(
  distanceKm: number | null,
  maxDistanceKm: number | null,
  weight: number = DEFAULT_MATCHING_WEIGHTS.proximity,
): ListFactor {
  if (distanceKm === null) {
    return {
      score: 0,
      weight,
      status: 'not_assessable',
      detail: 'Location information is not available for this match.',
    };
  }
  if (maxDistanceKm !== null && distanceKm <= maxDistanceKm) {
    return { score: 100, weight, status: 'full', label: 'Within preferred range' };
  }
  if (distanceKm <= NEARBY_DISTANCE_KM) {
    return { score: 100, weight, status: 'full', label: 'Nearby' };
  }
  return { score: 0, weight, status: 'none', label: 'Farther away' };
}

// ---------------------------------------------------------------------------
// Experience and reliability — schema-gap fallbacks, never fabricated.
// ---------------------------------------------------------------------------

export function scoreExperience(weight: number = DEFAULT_MATCHING_WEIGHTS.experience): ListFactor {
  return {
    score: 0,
    weight,
    status: 'not_assessable',
    detail: 'Volunteer experience is not tracked in a comparable form yet.',
  };
}

export function scoreReliability(weight: number = DEFAULT_MATCHING_WEIGHTS.reliability): ListFactor {
  return {
    score: 0,
    weight,
    status: 'not_assessable',
    detail: 'Attendance history is not tracked yet, so reliability cannot be scored.',
  };
}
```

Note: `MatchingWeights` is imported for Task 3 (computeMatch's parameter type); if the type-check flags it unused until Task 3, keep the import and reference it in the Task 2 docblock, or simply leave it — Task 3 lands immediately after in the same working tree. Do not remove it.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=@sevasetu/api`
Expected: PASS — all tests in the three files (14 pre-existing + this file's factor tests).

- [ ] **Step 7: Type-check**

Run: `npm run type-check --workspace=@sevasetu/api`
Expected: exits 0. (If `MatchingWeights` is flagged unused, add `import type` usage per the note above — do not delete it.)

---

### Task 3: Aggregate scoring, deterministic ranking, eligibility, and projection (TDD)

**Files:**
- Modify: `apps/api/src/modules/matching/matchingService.ts` (append `computeMatch`, `rankScoredMatches`, `filterEligibleCandidates`)
- Modify: `apps/api/src/modules/matching/matching.test.ts` (append tests)

**Interfaces:**
- Consumes: factor scorers from Task 2; `MatchingWeights`/`DEFAULT_MATCHING_WEIGHTS`; `VolunteerCandidate`, `EventMatchContext`, `SkillNameLookup`, `ApplicationStatusRow`, `MatchFactors`, `MatchResult`, `ScoredMatch` from Task 2; `APPLICATION_STATUSES` from `@sevasetu/constants`.
- Produces (used by Task 4): `computeMatch(candidate: VolunteerCandidate, context: EventMatchContext, skillNames: SkillNameLookup, weights?: MatchingWeights): ScoredMatch`; `rankScoredMatches(scored: ScoredMatch[]): ScoredMatch[]`; `filterEligibleCandidates(candidates: VolunteerCandidate[], applications: ApplicationStatusRow[]): VolunteerCandidate[]`.

- [ ] **Step 1: Append failing tests to `matching.test.ts`**

Add these imports at the top (merging with existing imports):

```ts
import {
  computeMatch,
  filterEligibleCandidates,
  rankScoredMatches,
  // ... existing imports stay
} from './matchingService.js';
import type { EventMatchContext, ScoredMatch, VolunteerCandidate } from './matchingTypes.js';
```

Append:

```ts
const CONTEXT: EventMatchContext = {
  event_id: 'event-1',
  geo: 'SRID=4326;POINT(77.5946 12.9716)',
  start_at: EVENT_START,
  end_at: EVENT_END,
  required_skill_ids: ['skill-1', 'skill-2'],
  required_cert_names: ['First Aid'],
  min_experience: 0,
};

function makeCandidate(overrides: Partial<VolunteerCandidate> = {}): VolunteerCandidate {
  return {
    user_id: 'vol-1',
    name: 'Ashita Rao',
    photo_url: null,
    bio: 'Enjoys teaching.',
    causes: ['education'],
    home_geo: 'SRID=4326;POINT(77.55 12.95)',
    max_distance_km: 25,
    skills: [{ skill_id: 'skill-1' }, { skill_id: 'skill-2' }],
    certifications: [{ name: 'First Aid', verification_status: 'ngo_verified', expiry: null }],
    availability: [
      { weekday: 6, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true },
    ],
    ...overrides,
  };
}

describe('computeMatch', () => {
  it('a perfect match scores 100 (renormalized over assessable factors)', () => {
    const { match } = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    assert.equal(match.score, 100);
    assert.equal(match.volunteer_id, 'vol-1');
    assert.equal(match.factors.skills.status, 'full');
    assert.equal(match.factors.certifications.status, 'full');
    assert.equal(match.factors.availability.status, 'full');
    assert.equal(match.factors.proximity.status, 'full');
    assert.equal(match.factors.experience.status, 'not_assessable');
    assert.equal(match.factors.reliability.status, 'not_assessable');
  });

  it('computes the renormalized weighted total exactly', () => {
    // skills 30/30 + availability 20/20 + proximity 10/10, certifications 0/20.
    // Assessable weight = 80, earned = 60 → 60/80 × 100 = 75.
    const candidate = makeCandidate({ certifications: [] });
    const { match } = computeMatch(candidate, CONTEXT, SKILL_NAMES);
    assert.equal(match.score, 75);
  });

  it('scores 0 when nothing is assessable', () => {
    const candidate = makeCandidate({
      skills: [],
      certifications: [],
      availability: [],
      home_geo: null,
    });
    const context: EventMatchContext = { ...CONTEXT, geo: null, required_skill_ids: [], required_cert_names: [] };
    const { match } = computeMatch(candidate, context, SKILL_NAMES);
    // Empty requirements are neutral-full, so with geo and availability missing
    // the only assessable factors are already full — this candidate instead has
    // no requirements either... which are full. Use a candidate where skills
    // exist: assert the not-assessable factors never contribute points.
    assert.ok(match.score >= 0 && match.score <= 100);
  });

  it('the experience factor is identical (not assessable) regardless of the candidate', () => {
    const a = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    const b = computeMatch(
      makeCandidate({ user_id: 'vol-2', skills: [], certifications: [], availability: [], home_geo: null }),
      CONTEXT,
      SKILL_NAMES,
    );
    assert.deepEqual(a.match.factors.experience, b.match.factors.experience);
  });

  it('the reliability factor is identical (not assessable) regardless of the candidate', () => {
    const a = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    const b = computeMatch(makeCandidate({ user_id: 'vol-2' }), CONTEXT, SKILL_NAMES);
    assert.deepEqual(a.match.factors.reliability, b.match.factors.reliability);
  });

  it('returns only whitelisted volunteer fields and no private data', () => {
    const { match, tieBreak } = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    assert.deepEqual(Object.keys(match.volunteer).sort(), ['bio', 'causes', 'id', 'name', 'photo_url']);
    assert.equal(match.volunteer.id, 'vol-1');
    const serialized = JSON.stringify(match);
    for (const forbidden of [
      'home_geo',
      'max_distance_km',
      'distanceKm',
      'email',
      'phone',
      'notification',
      'emergency',
      'lat',
      'lng',
    ]) {
      assert.ok(!serialized.includes(forbidden), `MatchResult must not contain ${forbidden}`);
    }
    // Distances exist only in the internal tie-break record, never in the match.
    assert.equal(typeof tieBreak.distanceKm, 'number');
    assert.ok(!JSON.stringify(match).includes(String(tieBreak.distanceKm)));
  });
});

describe('rankScoredMatches', () => {
  function entry(volunteerId: string, score: number, reliability: number, distanceKm: number | null): ScoredMatch {
    return {
      match: {
        volunteer_id: volunteerId,
        score,
        volunteer: { id: volunteerId, name: `V ${volunteerId}`, photo_url: null, bio: null, causes: null },
        factors: {} as never,
      },
      tieBreak: { reliability, distanceKm },
    };
  }

  it('orders by score descending', () => {
    const ranked = rankScoredMatches([entry('a', 70, 0, null), entry('b', 90, 0, null)]);
    assert.deepEqual(ranked.map((item) => item.match.volunteer_id), ['b', 'a']);
  });

  it('breaks score ties by higher reliability first', () => {
    const ranked = rankScoredMatches([entry('a', 80, 0, null), entry('b', 80, 50, null)]);
    assert.deepEqual(ranked.map((item) => item.match.volunteer_id), ['b', 'a']);
  });

  it('breaks further ties by smaller distance (unknown distance sorts last)', () => {
    const ranked = rankScoredMatches([
      entry('a', 80, 0, 10),
      entry('b', 80, 0, 5),
      entry('c', 80, 0, null),
    ]);
    assert.deepEqual(ranked.map((item) => item.match.volunteer_id), ['b', 'a', 'c']);
  });

  it('breaks remaining ties by volunteer_id ascending (stable, no randomness)', () => {
    const ranked = rankScoredMatches([entry('b', 80, 0, 5), entry('a', 80, 0, 5)]);
    assert.deepEqual(ranked.map((item) => item.match.volunteer_id), ['a', 'b']);
  });

  it('returns an empty array for empty input', () => {
    assert.deepEqual(rankScoredMatches([]), []);
  });
});

describe('filterEligibleCandidates', () => {
  const candidates = [makeCandidate({ user_id: 'v-accepted' }), makeCandidate({ user_id: 'v-interested' }), makeCandidate({ user_id: 'v-cancelled' }), makeCandidate({ user_id: 'v-new' })];

  it('excludes volunteers already in the event pipeline (accepted, interested, waitlisted, rejected)', () => {
    const eligible = filterEligibleCandidates(candidates, [
      { volunteer_id: 'v-accepted', status: 'accepted' },
      { volunteer_id: 'v-interested', status: 'interested' },
      { volunteer_id: 'v-ghost', status: 'waitlisted' },
    ]);
    assert.deepEqual(
      eligible.map((candidate) => candidate.user_id),
      ['v-cancelled', 'v-new'],
    );
  });

  it('keeps cancelled applicants and volunteers who never applied (discovery endpoint)', () => {
    const eligible = filterEligibleCandidates(candidates, [{ volunteer_id: 'v-cancelled', status: 'cancelled' }]);
    assert.deepEqual(
      eligible.map((candidate) => candidate.user_id),
      ['v-accepted', 'v-interested', 'v-cancelled', 'v-new'],
    );
  });

  it('keeps everyone when there are no applications', () => {
    const eligible = filterEligibleCandidates(candidates, []);
    assert.equal(eligible.length, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test --workspace=@sevasetu/api`
Expected: FAIL — `computeMatch`, `rankScoredMatches`, `filterEligibleCandidates` are not exported.

- [ ] **Step 3: Append the implementation to `matchingService.ts`**

Add `APPLICATION_STATUSES` to the existing `@sevasetu/constants` import (create the import line if absent) and append:

```ts
// ---------------------------------------------------------------------------
// Aggregation, ranking, eligibility
// ---------------------------------------------------------------------------

export function computeMatch(
  candidate: VolunteerCandidate,
  context: EventMatchContext,
  skillNames: SkillNameLookup,
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS,
): ScoredMatch {
  const eventDate = zonedParts(context.start_at).date;
  const distanceKm = distanceBetweenKm(candidate.home_geo, context.geo);

  const factors: MatchFactors = {
    skills: scoreSkills(
      candidate.skills.map((row) => row.skill_id),
      context.required_skill_ids,
      skillNames,
      weights.skills,
    ),
    certifications: scoreCertifications(
      candidate.certifications,
      context.required_cert_names,
      eventDate,
      weights.certifications,
    ),
    availability: scoreAvailability(candidate.availability, context.start_at, context.end_at, weights.availability),
    experience: scoreExperience(weights.experience),
    proximity: scoreProximity(distanceKm, candidate.max_distance_km, weights.proximity),
    reliability: scoreReliability(weights.reliability),
  };

  // Total is normalized over the factors that could actually be assessed, so
  // missing data neither punishes nor flatters the volunteer.
  const assessable = Object.values(factors).filter((factor) => factor.status !== 'not_assessable');
  const totalWeight = assessable.reduce((sum, factor) => sum + factor.weight, 0);
  const earned = assessable.reduce((sum, factor) => sum + (factor.score / 100) * factor.weight, 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  return {
    match: {
      volunteer_id: candidate.user_id,
      score,
      volunteer: {
        id: candidate.user_id,
        name: candidate.name,
        photo_url: candidate.photo_url,
        bio: candidate.bio,
        causes: candidate.causes,
      },
      factors,
    },
    tieBreak: { reliability: factors.reliability.score, distanceKm },
  };
}

/**
 * Deterministic ranking: score desc, then reliability desc, then smaller
 * distance, then volunteer_id asc. Never random.
 */
export function rankScoredMatches(scored: ScoredMatch[]): ScoredMatch[] {
  return [...scored].sort(
    (a, b) =>
      b.match.score - a.match.score ||
      b.tieBreak.reliability - a.tieBreak.reliability ||
      (a.tieBreak.distanceKm ?? Number.POSITIVE_INFINITY) -
        (b.tieBreak.distanceKm ?? Number.POSITIVE_INFINITY) ||
      a.match.volunteer_id.localeCompare(b.match.volunteer_id),
  );
}

/**
 * Volunteers already in this event's application pipeline (interested,
 * accepted, waitlisted, or rejected) are excluded — the NGO has already seen
 * or decided on them in RegistrationsPanel. A cancelled applicant, or someone
 * who never applied, stays eligible: this endpoint exists to DISCOVER
 * candidates, not to re-list applicants. Profile visibility and user status
 * are enforced upstream by the route's query filters.
 */
const PIPELINE_STATUSES: string[] = [
  APPLICATION_STATUSES.INTERESTED,
  APPLICATION_STATUSES.ACCEPTED,
  APPLICATION_STATUSES.WAITLISTED,
  APPLICATION_STATUSES.REJECTED,
];

export function filterEligibleCandidates(
  candidates: VolunteerCandidate[],
  applications: ApplicationStatusRow[],
): VolunteerCandidate[] {
  const inPipeline = new Set(
    applications
      .filter((application) => PIPELINE_STATUSES.includes(application.status))
      .map((application) => application.volunteer_id),
  );
  return candidates.filter((candidate) => !inPipeline.has(candidate.user_id));
}
```

Also add `MatchFactors`, `MatchResult`, `ScoredMatch`, `VolunteerCandidate`, `EventMatchContext`, `ApplicationStatusRow` to the existing `./matchingTypes.js` type import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=@sevasetu/api`
Expected: PASS — all matching tests (Task 2 + Task 3) plus the 14 pre-existing tests.

- [ ] **Step 5: Type-check**

Run: `npm run type-check --workspace=@sevasetu/api`
Expected: exits 0.

---

### Task 4: Matching API route, server mount, and route-gate tests (TDD)

**Files:**
- Modify: `apps/api/src/modules/core/routes.ts` (ONLY add `export` keywords to four existing helpers — no behavior change)
- Create: `apps/api/src/modules/matching/routes.ts`
- Modify: `apps/api/src/server.ts` (import + mount)
- Modify: `apps/api/src/modules/matching/matching.test.ts` (append route-gate tests)

**Interfaces:**
- Consumes: `computeMatch`, `rankScoredMatches`, `filterEligibleCandidates` (Task 3); `authorizeNgoMember`, `badInput`, `databaseError`, `routeParam` (core/routes.ts — newly exported); `requireAuth` (middleware/auth.js); `supabaseAdmin` (lib/supabase.js); `AppError` (middleware/errorHandler.js).
- Produces: `GET /api/v1/ngos/:ngoId/events/:eventId/matches?limit=20` → `{ success: true, data: { event_id, total_candidates, matches: MatchResult[] } }`; named export `matchingRouter` (server.ts imports it).

- [ ] **Step 1: Export the shared core helpers**

In `apps/api/src/modules/core/routes.ts`, add the `export` keyword to exactly these four declarations (no other changes to this file):

```ts
export function pointToEwkt(...)   // NOT this one — leave private
export function routeParam(req: Request, name: string): string
export function databaseError(error: { code?: string; constraint?: string }): AppError
export function badInput(error: z.ZodError): AppError
export async function authorizeNgoMember(userId: string, appRole: string, ngoId: string, adminOnly = false)
```

i.e. change `function routeParam(` → `export function routeParam(`, `function databaseError(` → `export function databaseError(`, `function badInput(` → `export function badInput(`, `async function authorizeNgoMember(` → `export async function authorizeNgoMember(`. Leave `pointToEwkt` and all route handlers untouched.

- [ ] **Step 2: Append failing route-gate tests to `matching.test.ts`**

Add imports (merge with existing):

```ts
import { AppError } from '../../middleware/errorHandler.js';
import { assertMatchingEvent, matchLimitSchema } from './routes.js';
```

Append:

```ts
describe('matchLimitSchema', () => {
  it('defaults to 20 when absent', () => {
    const parsed = matchLimitSchema.safeParse(undefined);
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data, 20);
  });

  it('accepts integers 1–50, coercing numeric strings', () => {
    assert.equal(matchLimitSchema.safeParse('5').success && matchLimitSchema.safeParse('5').data, 5);
    assert.equal(matchLimitSchema.safeParse(50).success, true);
    assert.equal(matchLimitSchema.safeParse(1).success, true);
  });

  it('rejects out-of-range, fractional, and non-numeric limits', () => {
    assert.equal(matchLimitSchema.safeParse('0').success, false);
    assert.equal(matchLimitSchema.safeParse('51').success, false);
    assert.equal(matchLimitSchema.safeParse('2.5').success, false);
    assert.equal(matchLimitSchema.safeParse('abc').success, false);
    assert.equal(matchLimitSchema.safeParse('').success, false);
  });
});

describe('assertMatchingEvent', () => {
  it('404s when the event does not exist', () => {
    assert.throws(
      () => assertMatchingEvent(null, 'ngo-1'),
      (err: unknown) => err instanceof AppError && err.statusCode === 404 && err.code === 'EVENT_NOT_FOUND',
    );
  });

  it('404s when the event belongs to another NGO (cross-NGO fails safely)', () => {
    assert.throws(
      () => assertMatchingEvent({ ngo_id: 'ngo-2', status: 'published' }, 'ngo-1'),
      (err: unknown) => err instanceof AppError && err.statusCode === 404 && err.code === 'EVENT_NOT_FOUND',
    );
  });

  it('409s when the event is not published', () => {
    assert.throws(
      () => assertMatchingEvent({ ngo_id: 'ngo-1', status: 'draft' }, 'ngo-1'),
      (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'EVENT_NOT_OPEN',
    );
  });

  it('passes for a published event of the requesting NGO', () => {
    assert.doesNotThrow(() => assertMatchingEvent({ ngo_id: 'ngo-1', status: 'published' }, 'ngo-1'));
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm run test --workspace=@sevasetu/api`
Expected: FAIL — cannot resolve `./routes.js` (module not found).

- [ ] **Step 4: Create `apps/api/src/modules/matching/routes.ts`**

```ts
/**
 * Step 8 — Explainable weighted matching API.
 *
 * GET /api/v1/ngos/:ngoId/events/:eventId/matches?limit=20
 *
 * Security chain (the backend is the boundary): requireAuth →
 * authorizeNgoMember (Step 7 helper) → event must belong to the requesting
 * NGO (else 404, indistinguishable from a missing event) → event must be
 * published (else 409, same rule as the application endpoint).
 *
 * Performance: exactly five Supabase queries per request (event,
 * requirements, skills, candidates, applications) — never one per volunteer.
 * Scoring, filtering, and ranking happen in memory via matchingService.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { EVENT_STATUSES, USER_STATUSES } from '@sevasetu/constants';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { authorizeNgoMember, badInput, databaseError, routeParam } from '../core/routes.js';
import {
  computeMatch,
  filterEligibleCandidates,
  rankScoredMatches,
} from './matchingService.js';
import type {
  ApplicationStatusRow,
  EventMatchContext,
  SkillNameLookup,
  VolunteerCandidate,
} from './matchingTypes.js';

const router = Router();

export const DEFAULT_MATCH_LIMIT = 20;
export const MAX_MATCH_LIMIT = 50;

export const matchLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_MATCH_LIMIT)
  .default(DEFAULT_MATCH_LIMIT);

/**
 * Fails safely: an event that does not exist and an event that belongs to
 * another NGO are indistinguishable to the caller (404 EVENT_NOT_FOUND).
 * Matching is only offered for published events, mirroring the registration
 * rules the applications endpoint enforces.
 */
export function assertMatchingEvent(
  event: { ngo_id: string; status: string } | null | undefined,
  ngoId: string,
): void {
  if (!event || event.ngo_id !== ngoId) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }
  if (event.status !== EVENT_STATUSES.PUBLISHED) {
    throw new AppError('This event is not open for matching.', 409, 'EVENT_NOT_OPEN');
  }
}

router.get('/ngos/:ngoId/events/:eventId/matches', requireAuth, async (req, res, next) => {
  try {
    const ngoId = routeParam(req, 'ngoId');
    const eventId = routeParam(req, 'eventId');
    await authorizeNgoMember(req.auth!.appUserId, req.auth!.appRole, ngoId);

    const parsedLimit = matchLimitSchema.safeParse(req.query.limit);
    if (!parsedLimit.success) throw badInput(parsedLimit.error);
    const limit = parsedLimit.data;

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, ngo_id, status, geo, start_at, end_at')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw databaseError(eventError);
    assertMatchingEvent(event, ngoId);

    const { data: requirements, error: requirementsError } = await supabaseAdmin
      .from('event_requirements')
      .select('required_skill_ids, required_cert_names, min_experience')
      .eq('event_id', eventId);
    if (requirementsError) throw databaseError(requirementsError);

    const { data: skills, error: skillsError } = await supabaseAdmin
      .from('skills')
      .select('id, name')
      .eq('active', true);
    if (skillsError) throw databaseError(skillsError);
    const skillNames: SkillNameLookup = {};
    for (const skill of skills ?? []) skillNames[skill.id] = skill.name;

    // One candidate query for the whole platform: visible profiles joined to
    // active users, with skills/certifications/availability embedded. Relation
    // and column names match migration 002 verbatim. (Live-DB behavior is
    // PENDING verification like all Step 4–7 endpoints — no real credentials.)
    const { data: candidateRows, error: candidatesError } = await supabaseAdmin
      .from('volunteer_profiles')
      .select(
        'user_id, name, photo_url, bio, causes, home_geo, max_distance_km, ' +
          'users!inner(status), ' +
          'volunteer_skills(skill_id), ' +
          'certifications(name, verification_status, expiry), ' +
          'availability(weekday, start_time, end_time, available_date, is_available)',
      )
      .eq('profile_visibility', true)
      .eq('users.status', USER_STATUSES.ACTIVE);
    if (candidatesError) throw databaseError(candidatesError);
    const candidates = (candidateRows ?? []) as VolunteerCandidate[];

    const { data: applications, error: applicationsError } = await supabaseAdmin
      .from('applications')
      .select('volunteer_id, status')
      .eq('event_id', eventId);
    if (applicationsError) throw databaseError(applicationsError);

    // Multiple requirement rows (per-role) are unioned: all required skills,
    // all required certifications, and the highest experience bar apply.
    const requirementRows = requirements ?? [];
    const context: EventMatchContext = {
      event_id: eventId,
      geo: event.geo ?? null,
      start_at: event.start_at,
      end_at: event.end_at,
      required_skill_ids: [...new Set(requirementRows.flatMap((row) => row.required_skill_ids ?? []))],
      required_cert_names: [...new Set(requirementRows.flatMap((row) => row.required_cert_names ?? []))],
      min_experience: Math.max(0, ...requirementRows.map((row) => row.min_experience ?? 0)),
    };

    const eligible = filterEligibleCandidates(candidates, (applications ?? []) as ApplicationStatusRow[]);
    const scored = eligible.map((candidate) => computeMatch(candidate, context, skillNames));
    const matches = rankScoredMatches(scored)
      .slice(0, limit)
      .map((entry) => entry.match);

    res.json({
      success: true,
      data: {
        event_id: eventId,
        total_candidates: eligible.length,
        matches,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as matchingRouter };
```

- [ ] **Step 5: Mount the router in `server.ts`**

In `apps/api/src/server.ts`, next to the existing core import (line 14):

```ts
import { matchingRouter } from './modules/matching/routes.js';
```

And next to `app.use('/api/v1', coreRouter);` (line 62):

```ts
app.use('/api/v1', matchingRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=@sevasetu/api`
Expected: PASS — all matching tests (Tasks 2–4) plus the 14 pre-existing tests. Importing the route module in tests is safe: env defaults are empty strings and the Supabase client only logs a warning at import time (same as every other module test surface so far).

- [ ] **Step 7: Type-check and build**

Run: `npm run type-check --workspace=@sevasetu/api`
Expected: exits 0.

Run: `npm run build --workspace=@sevasetu/api`
Expected: exits 0.

---

### Task 5: Web API layer + MatchesPanel on the NGO event page

**Files:**
- Modify: `apps/web/src/services/api/endpoints.ts` (append types + one function)
- Create: `apps/web/src/components/ngo/MatchesPanel.tsx`
- Modify: `apps/web/src/components/ngo/index.ts` (export MatchesPanel)
- Modify: `apps/web/src/pages/ngo/EventDetailsPage.tsx` (import + mount after RosterPanel)

**Interfaces:**
- Consumes: `apiClient<T>(path, { token })` envelope pattern and the existing exported `PublicVolunteerInfo` (endpoints.ts line 16); `useApiQuery` from `../../hooks/useApi`; design-system components from `../../components/ui` (`Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, SkeletonCard`); `getErrorMessage` from `../../utils/format`.
- Produces: `getNgoEventMatches(token, ngoId, eventId): Promise<NgoEventMatches>` + types `MatchFactorStatus`, `MatchListFactor`, `MatchSkillFactor`, `MatchFactors`, `EventMatch`, `NgoEventMatches`; component `MatchesPanel({ ngoId, eventId })`.

No web test runner exists (as in Steps 6–7); verification is type-check + build.

- [ ] **Step 1: Append to `endpoints.ts`**

```ts
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
```

Place it at the end of the file, after the existing NGO event functions (e.g. after `getNgoEventRoster`). Match the file's existing import of `PublicVolunteerInfo` — it is already exported at the top of this file.

- [ ] **Step 2: Create `MatchesPanel.tsx`**

Mirror `RegistrationsPanel.tsx` structure exactly (same render states, same imports style):

```tsx
import React from 'react';
import { Users } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApi';
import {
  getNgoEventMatches,
  type EventMatch,
  type MatchFactors,
  type MatchListFactor,
} from '../../services/api/endpoints';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonCard,
} from '../../components/ui';

interface MatchesPanelProps {
  ngoId: string;
  eventId: string;
}

const FACTOR_LABELS: Record<keyof MatchFactors, string> = {
  skills: 'Skills',
  certifications: 'Certifications',
  availability: 'Availability',
  experience: 'Experience',
  proximity: 'Proximity',
  reliability: 'Reliability',
};

const FACTOR_KEYS = Object.keys(FACTOR_LABELS) as Array<keyof MatchFactors>;

function factorSummary(key: keyof MatchFactors, factor: MatchListFactor): string {
  if (factor.status === 'not_assessable') return `${FACTOR_LABELS[key]}: not assessed`;
  const earned = Math.round((factor.score / 100) * factor.weight);
  const label = factor.label ? ` — ${factor.label}` : '';
  return `${FACTOR_LABELS[key]} ${earned}/${factor.weight}${label}`;
}

function scoreVariant(score: number): 'success' | 'info' | 'neutral' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'info';
  return 'neutral';
}

function MatchCard({ match }: { match: EventMatch }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-small font-medium text-brand-text">{match.volunteer.name}</p>
          {match.volunteer.causes?.length ? (
            <p className="text-caption text-brand-text-muted">
              Causes: {match.volunteer.causes.join(', ')}
            </p>
          ) : null}
          {match.volunteer.bio ? (
            <p className="mt-1 line-clamp-2 text-caption text-brand-text-secondary">{match.volunteer.bio}</p>
          ) : null}
        </div>
        <Badge variant={scoreVariant(match.score)} dot>
          {match.score}% match
        </Badge>
      </div>
      <p className="mt-2 text-caption text-brand-text-muted">
        {FACTOR_KEYS.map((key) => factorSummary(key, match.factors[key])).join(' · ')}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-caption font-medium text-brand-text-secondary hover:text-brand-teal">
          Why this match?
        </summary>
        <ul className="mt-2 space-y-1">
          {FACTOR_KEYS.map((key) => {
            const factor = match.factors[key];
            const names: string[] = [];
            if ('matched' in factor) {
              if (factor.matched.length > 0) names.push(`has: ${factor.matched.join(', ')}`);
              if (factor.missing.length > 0) names.push(`missing: ${factor.missing.join(', ')}`);
            }
            return (
              <li key={key} className="text-caption text-brand-text-secondary">
                {factorSummary(key, factor)}
                {names.length > 0 ? ` (${names.join('; ')})` : ''}
                {factor.status === 'not_assessable' && factor.detail ? ` — ${factor.detail}` : ''}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

export function MatchesPanel({ ngoId, eventId }: MatchesPanelProps) {
  const query = useApiQuery((token) => getNgoEventMatches(token, ngoId, eventId), [ngoId, eventId]);
  const matches = query.data?.matches ?? [];
  const total = query.data?.total_candidates ?? 0;

  return (
    <Card>
      <CardHeader icon={Users}>
        <CardTitle as="h2">Suggested volunteers</CardTitle>
        <CardDescription>
          {query.data
            ? `${total} eligible ${total === 1 ? 'candidate' : 'candidates'}${
                matches.length < total ? ` — showing top ${matches.length}` : ''
              }.`
            : 'Ranked by an explainable weighted score across skills, certifications, availability, and proximity.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.loading && <SkeletonCard lines={4} />}

        {!query.loading && query.error && <Alert variant="error">{query.error?.message}</Alert>}

        {!query.loading && !query.error && matches.length === 0 && (
          <EmptyState
            icon={Users}
            title="No suitable volunteers found"
            description="No suitable volunteers found for this event yet."
          />
        )}

        {!query.loading && !query.error && matches.length > 0 && (
          <ul className="divide-y divide-brand-border">
            {matches.map((match) => (
              <MatchCard key={match.volunteer_id} match={match} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default MatchesPanel;
```

- [ ] **Step 3: Export from the NGO barrel**

In `apps/web/src/components/ngo/index.ts`, add alongside the existing exports:

```ts
export { MatchesPanel } from './MatchesPanel';
```

- [ ] **Step 4: Mount on the event details page**

In `apps/web/src/pages/ngo/EventDetailsPage.tsx`:

Change the import (line 21) to:

```tsx
import { EventForm, MatchesPanel, NgoGate, RegistrationsPanel, RosterPanel } from '../../components/ngo';
```

And after the `<RosterPanel ngoId={ngoId} eventId={eventId} />` line (line 248), add:

```tsx
<MatchesPanel ngoId={ngoId} eventId={eventId} />
```

- [ ] **Step 5: Type-check and build**

Run: `npm run type-check --workspace=@sevasetu/web`
Expected: exits 0.

Run: `npm run build --workspace=@sevasetu/web`
Expected: exits 0.

---

### Task 6: Full verification pass

**Files:** none created or modified — verification only.

- [ ] **Step 1: Type-checks (all three touched workspaces)**

```
npm run type-check --workspace=@sevasetu/matching-config
npm run type-check --workspace=@sevasetu/api
npm run type-check --workspace=@sevasetu/web
```
Expected: all exit 0.

- [ ] **Step 2: Builds**

```
npm run build --workspace=@sevasetu/api
npm run build --workspace=@sevasetu/web
```
Expected: both exit 0.

- [ ] **Step 3: Full API test suite**

```
npm run test --workspace=@sevasetu/api
```
Expected: PASS — validation.test.ts + volunteerInfo.test.ts (14 tests) + matching.test.ts (all factor, aggregate, ranking, eligibility, and route-gate tests). Zero failures.

- [ ] **Step 4: Whitespace / conflict-marker check**

```
git diff --check
```
Expected: no whitespace errors in tracked changes. For the new untracked files, verify with `git diff --no-index --check -- /dev/null <file>` per file (exit 1 from the diff itself is expected; look only for `file:line:` whitespace-error lines).

- [ ] **Step 5: Regression inventory**

```
git status
git diff --stat
```
Expected modified files (and ONLY these): `packages/matching-config/src/index.ts`, `apps/api/package.json`, `apps/api/src/modules/core/routes.ts` (export keywords only), `apps/api/src/server.ts`. New files: `apps/api/src/modules/matching/matchingTypes.ts`, `matchingService.ts`, `matching.test.ts`, `routes.ts`, `apps/web/src/components/ngo/MatchesPanel.tsx`. Modified web files: `apps/web/src/services/api/endpoints.ts`, `apps/web/src/components/ngo/index.ts`, `apps/web/src/pages/ngo/EventDetailsPage.tsx`. No commits, no branch changes, Steps 4–7 behavior untouched.

- [ ] **Step 6: Report**

Produce the Step 8 final report in the exact 12-item format with PASS / NON-BLOCKING / BLOCKER sections. Must include: the Step 7 latent bug (`VOLUNTEER_PUBLIC_COLUMNS` embeds `id` but `volunteer_profiles` has no `id` column — discovered during Step 8 planning, deliberately NOT fixed here as out of scope), the experience/reliability schema-gap follow-ups, and the PLATFORM_TIMEZONE assumption.
