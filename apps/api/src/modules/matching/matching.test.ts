import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeMatch,
  distanceBetweenKm,
  filterEligibleCandidates,
  parseGeoPoint,
  rankScoredMatches,
  scoreAvailability,
  scoreCertifications,
  scoreExperience,
  scoreProximity,
  scoreReliability,
  scoreSkills,
  zonedParts,
} from './matchingService.js';
import type {
  CandidateCertificationRow,
  EventMatchContext,
  ScoredMatch,
  VolunteerCandidate,
} from './matchingTypes.js';
import { AppError } from '../../middleware/errorHandler.js';
import { assertMatchingEvent, matchLimitSchema } from './routes.js';

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

  it('reliability is not_assessable when no history exists (insufficient data — never zero)', () => {
    const factor = scoreReliability();
    assert.equal(factor.score, 0);
    assert.equal(factor.status, 'not_assessable');
    assert.equal(factor.weight, 10);
    assert.equal(factor.detail, 'Reliability history is still being established.');
  });

  it('reliability is not_assessable for insufficient_data even with a provisional-shaped summary', () => {
    const factor = scoreReliability({ status: 'insufficient_data', score: null, attended: 1, late: 0, no_show: 0, volunteer_cancelled: 0 });
    assert.equal(factor.status, 'not_assessable');
    assert.equal(factor.detail, 'Reliability history is still being established.');
  });

  it('established reliability feeds the real score in as a full/strong factor', () => {
    const factor = scoreReliability({ status: 'established', score: 92, attended: 7, late: 0, no_show: 0, volunteer_cancelled: 0 });
    assert.equal(factor.score, 92);
    assert.equal(factor.status, 'full');
    assert.equal(factor.label, 'Strong reliability history');
    assert.equal(factor.detail, '7 attended, 0 no-shows.');
    assert.equal(factor.weight, 10);
  });

  it('a provisional middle score maps to partial with an honest label', () => {
    const factor = scoreReliability({ status: 'provisional', score: 60, attended: 3, late: 0, no_show: 1, volunteer_cancelled: 0 });
    assert.equal(factor.status, 'partial');
    assert.equal(factor.label, 'Mixed reliability history');
  });

  it('an established zero score stays an honest none — never hidden', () => {
    const factor = scoreReliability({ status: 'established', score: 0, attended: 0, late: 0, no_show: 5, volunteer_cancelled: 0 });
    assert.equal(factor.status, 'none');
    assert.equal(factor.score, 0);
  });
});

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

  it('scores 100 when the only assessable factors are neutral-full (empty requirements)', () => {
    const candidate = makeCandidate({
      skills: [],
      certifications: [],
      availability: [],
      home_geo: null,
    });
    const context: EventMatchContext = { ...CONTEXT, geo: null, required_skill_ids: [], required_cert_names: [] };
    const { match } = computeMatch(candidate, context, SKILL_NAMES);
    // Empty requirements are neutral-full; availability/proximity/experience/
    // reliability are not assessable for this candidate. Renormalization over
    // the assessable factors (skills 30 + certifications 20, both full) is
    // 50/50 → 100.
    assert.equal(match.score, 100);
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

  it('the reliability factor is identical (not assessable) when neither candidate has evidence', () => {
    const a = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    const b = computeMatch(makeCandidate({ user_id: 'vol-2' }), CONTEXT, SKILL_NAMES);
    assert.deepEqual(a.match.factors.reliability, b.match.factors.reliability);
  });

  it('Step 9: an established reliability score enters the match; total renormalizes honestly', () => {
    const candidate = makeCandidate({
      reliability: { status: 'established', score: 100, attended: 7, late: 0, no_show: 0, volunteer_cancelled: 0 },
    });
    const { match } = computeMatch(candidate, CONTEXT, SKILL_NAMES);
    assert.equal(match.factors.reliability.score, 100);
    assert.equal(match.factors.reliability.status, 'full');
    assert.equal(match.score, 100);
  });

  it('Step 9: insufficient reliability keeps the Step 8 fallback (not_assessable, no penalty)', () => {
    const candidate = makeCandidate({
      reliability: { status: 'insufficient_data', score: null, attended: 0, late: 0, no_show: 0, volunteer_cancelled: 0 },
    });
    const { match } = computeMatch(candidate, CONTEXT, SKILL_NAMES);
    assert.equal(match.factors.reliability.status, 'not_assessable');
    assert.equal(match.score, 100); // same renormalized total as Step 8's gap behavior
  });

  it('Step 9: a weak established reliability lowers the total via its 10-point weight', () => {
    const perfect = computeMatch(makeCandidate(), CONTEXT, SKILL_NAMES);
    const weak = computeMatch(
      makeCandidate({
        reliability: { status: 'established', score: 40, attended: 2, late: 0, no_show: 3, volunteer_cancelled: 0 },
      }),
      CONTEXT,
      SKILL_NAMES,
    );
    assert.ok(weak.match.score < perfect.match.score);
    const serialized = JSON.stringify(weak.match.factors.reliability);
    assert.ok(serialized.includes('no-shows'));
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

describe('matchLimitSchema', () => {
  it('defaults to 20 when absent', () => {
    const parsed = matchLimitSchema.safeParse(undefined);
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data, 20);
  });

  it('accepts integers 1–50, coercing numeric strings', () => {
    const parsed = matchLimitSchema.safeParse('5');
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data, 5);
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
