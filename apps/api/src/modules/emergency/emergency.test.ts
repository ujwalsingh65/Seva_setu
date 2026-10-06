import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeEmergencyStaffingStatus,
  isValidInvitationTransition,
  passesHardConstraints,
  rankEmergencyCandidates,
  selectNextBackup,
  splitPrimaryAndBackup,
} from './emergencyService.js';
import type { SchedulingCandidate, SchedulingShift } from '../scheduling/schedulingService.js';

const EVENT_START = '2026-10-10T13:30:00Z';
const EVENT_END = '2026-10-10T16:30:00Z';

function saturdayWindow() {
  return [{ weekday: 6, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true }];
}

function makeCandidate(overrides: Partial<SchedulingCandidate> = {}): SchedulingCandidate {
  return {
    user_id: 'vol-1',
    name: 'Volunteer',
    photo_url: null,
    bio: null,
    causes: null,
    home_geo: null,
    max_distance_km: null,
    skills: [],
    certifications: [],
    availability: saturdayWindow(),
    reliability: null,
    ...overrides,
  };
}

function makeShift(overrides: Partial<SchedulingShift> = {}): SchedulingShift {
  return {
    id: 'shift-1',
    requirement_id: 'req-1',
    role: 'Logistics',
    headcount: 2,
    start_at: EVENT_START,
    end_at: EVENT_END,
    required_skill_ids: [],
    required_cert_names: [],
    ...overrides,
  };
}

describe('invitation transitions', () => {
  it('allows only documented transitions', () => {
    assert.equal(isValidInvitationTransition('pending', 'accepted'), true);
    assert.equal(isValidInvitationTransition('pending', 'declined'), true);
    assert.equal(isValidInvitationTransition('pending', 'expired'), true);
    assert.equal(isValidInvitationTransition('pending', 'cancelled'), true);
    assert.equal(isValidInvitationTransition('declined', 'accepted'), false);
    assert.equal(isValidInvitationTransition('expired', 'accepted'), false);
    assert.equal(isValidInvitationTransition('accepted', 'declined'), false);
  });
});

describe('staffing status', () => {
  it('Filled requires confirmed capacity, never mere invitations', () => {
    assert.equal(computeEmergencyStaffingStatus(3, 0), 'unfilled');
    assert.equal(computeEmergencyStaffingStatus(3, 1), 'partially_filled');
    assert.equal(computeEmergencyStaffingStatus(3, 3), 'filled');
    assert.equal(computeEmergencyStaffingStatus(3, 5), 'filled');
    assert.equal(computeEmergencyStaffingStatus(0, 0), 'unfilled');
  });
});

describe('hard constraints', () => {
  it('unavailable candidate fails the gate even with infinite match score later', () => {
    const candidate = makeCandidate({
      availability: [{ weekday: 0, start_time: '18:00:00', end_time: '20:00:00', available_date: null, is_available: true }],
    });
    assert.equal(passesHardConstraints(candidate, makeShift(), [], '2026-10-10', null, null), false);
  });

  it('date-specific unavailable exception overrides a covering window', () => {
    const candidate = makeCandidate({
      availability: [
        ...saturdayWindow(),
        { weekday: null, start_time: null, end_time: null, available_date: '2026-10-10', is_available: false },
      ],
    });
    assert.equal(passesHardConstraints(candidate, makeShift(), [], '2026-10-10', null, null), false);
  });

  it('committed overlapping interval fails the gate', () => {
    const candidate = makeCandidate();
    const busy = [{ volunteer_id: 'vol-1', start_at: '2026-10-10T15:00:00Z', end_at: '2026-10-10T17:00:00Z' }];
    assert.equal(passesHardConstraints(candidate, makeShift(), busy, '2026-10-10', null, null), false);
  });

  it('max distance is enforced only when geo is present', () => {
    const candidate = makeCandidate({ home_geo: 'SRID=4326;POINT(77.5946 12.9716)' });
    const eventGeo = 'SRID=4326;POINT(72.8777 19.0760)'; // ~843 km away
    assert.equal(passesHardConstraints(candidate, makeShift(), [], '2026-10-10', 50, eventGeo), false);
    assert.equal(passesHardConstraints(candidate, makeShift(), [], '2026-10-10', 1000, eventGeo), true);
    assert.equal(passesHardConstraints(candidate, makeShift(), [], '2026-10-10', 50, null), true); // no venue geo → no distance claim
  });
});

describe('rankEmergencyCandidates', () => {
  it('is deterministic and reuses Step 8 match score', () => {
    const candidates = [
      makeCandidate({ user_id: 'v-1' }),
      makeCandidate({ user_id: 'v-2' }),
      makeCandidate({ user_id: 'v-3', skills: [] }),
    ];
    const shift = makeShift();
    const a = rankEmergencyCandidates({
      shift,
      candidates,
      busy: [],
      shiftDate: '2026-10-10',
      maxDistanceKm: null,
      eventGeo: null,
      eventStartAt: EVENT_START,
      eventEndAt: EVENT_END,
      eventId: 'e-1',
      skillNames: {},
    });
    const b = rankEmergencyCandidates({
      shift,
      candidates,
      busy: [],
      shiftDate: '2026-10-10',
      maxDistanceKm: null,
      eventGeo: null,
      eventStartAt: EVENT_START,
      eventEndAt: EVENT_END,
      eventId: 'e-1',
      skillNames: {},
    });
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
  });

  it('excludes hard-constraint failures from the ranked list', () => {
    const unavailable = makeCandidate({
      user_id: 'busy',
      availability: [{ weekday: 0, start_time: '18:00:00', end_time: '20:00:00', available_date: null, is_available: true }],
    });
    const ranked = rankEmergencyCandidates({
      shift: makeShift(),
      candidates: [unavailable, makeCandidate({ user_id: 'ok' })],
      busy: [],
      shiftDate: '2026-10-10',
      maxDistanceKm: null,
      eventGeo: null,
      eventStartAt: EVENT_START,
      eventEndAt: EVENT_END,
      eventId: 'e-1',
      skillNames: {},
    });
    assert.deepEqual(ranked.map((row) => row.volunteer_id), ['ok']);
  });

  it('prefers an established high-reliability volunteer on an otherwise tied score', () => {
    const strong = makeCandidate({
      user_id: 'strong',
      reliability: { status: 'established', score: 100, attended: 6, late: 0, no_show: 0, volunteer_cancelled: 0 },
    });
    const none = makeCandidate({ user_id: 'insufficient', reliability: null });
    const ranked = rankEmergencyCandidates({
      shift: makeShift(),
      candidates: [none, strong],
      busy: [],
      shiftDate: '2026-10-10',
      maxDistanceKm: null,
      eventGeo: null,
      eventStartAt: EVENT_START,
      eventEndAt: EVENT_END,
      eventId: 'e-1',
      skillNames: {},
    });
    // Established 100 forces a higher total match score than insufficient.
    assert.equal(ranked[0].volunteer_id, 'strong');
  });
});

describe('primary/backup split and promotion', () => {
  it('splitPrimaryAndBackup never exceeds primaries beyond requirement', () => {
    const { primary, backup } = splitPrimaryAndBackup([1, 2, 3, 4, 5], 2, 3);
    assert.deepEqual(primary, [1, 2]);
    assert.deepEqual(backup, [3, 4, 5]);
  });

  it('selectNextBackup promotes the first not-yet-invited backup, in rank order', () => {
    const next = selectNextBackup([
      { volunteer_id: 'b1', invited: true },
      { volunteer_id: 'b2', invited: false },
    ]);
    assert.deepEqual(next, { volunteer_id: 'b2' });
    assert.equal(selectNextBackup([{ volunteer_id: 'b1', invited: true }]), null);
  });
});
