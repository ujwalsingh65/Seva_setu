import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  candidateCoversShift,
  candidateHasRequiredCertifications,
  candidateHasRequiredSkills,
  intervalsOverlap,
  scheduleEvent,
  type SchedulingCandidate,
  type SchedulingShift,
} from './schedulingService.js';

// 2026-10-10T13:30:00Z–16:30:00Z is Saturday 19:00–22:00 in Asia/Kolkata.
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
    role: 'Registration',
    headcount: 1,
    start_at: EVENT_START,
    end_at: EVENT_END,
    required_skill_ids: [],
    required_cert_names: [],
    ...overrides,
  };
}

function run(shifts: SchedulingShift[], candidates: SchedulingCandidate[], busy: Array<{ volunteer_id: string; start_at: string; end_at: string }> = []) {
  return scheduleEvent({
    eventId: 'event-1',
    eventStartAt: EVENT_START,
    eventEndAt: EVENT_END,
    eventGeo: null,
    shifts,
    candidates,
    busy,
  });
}

describe('intervalsOverlap', () => {
  it('detects real overlaps including touching-boundary non-overlaps', () => {
    assert.equal(intervalsOverlap('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z', '2026-10-10T10:30:00Z', '2026-10-10T11:30:00Z'), true);
    assert.equal(intervalsOverlap('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z', '2026-10-10T11:00:00Z', '2026-10-10T12:00:00Z'), false);
  });
});

describe('schedulingService.scheduleEvent', () => {
  it('generates a draft assignment for an eligible volunteer', () => {
    const result = run([makeShift()], [makeCandidate()]);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].volunteer_id, 'vol-1');
    assert.equal(result.gaps.length, 0);
    assert.ok(result.assignments[0].explanation.includes('available for the full shift'));
  });

  it('never assigns a volunteer who is unavailable for the shift', () => {
    const candidate = makeCandidate({
      availability: [{ weekday: 0, start_time: '18:00:00', end_time: '23:00:00', available_date: null, is_available: true }],
    });
    const result = run([makeShift()], [candidate]);
    assert.equal(result.assignments.length, 0);
    assert.equal(result.gaps[0].reason, 'Accepted volunteers were unavailable for this shift window.');
  });

  it('a date-specific unavailable exception overrides a covering recurring window', () => {
    const candidate = makeCandidate({
      availability: [
        ...saturdayWindow(),
        { weekday: null, start_time: null, end_time: null, available_date: '2026-10-10', is_available: false },
      ],
    });
    const result = run([makeShift()], [candidate]);
    assert.equal(result.assignments.length, 0);
  });

  it('a volunteer available only part of the event is not double-booked into overlapping shifts', () => {
    const candidate = makeCandidate({
      availability: [{ weekday: 6, start_time: '18:00:00', end_time: '20:00:00', available_date: null, is_available: true }],
    });
    const early = makeShift({ id: 's-early', start_at: '2026-10-10T13:30:00Z', end_at: '2026-10-10T14:30:00Z' }); // 19:00–20:00 IST
    const late = makeShift({ id: 's-late', start_at: '2026-10-10T15:30:00Z', end_at: '2026-10-10T16:30:00Z' }); // 21:00–22:00 IST
    const result = run([early, late], [candidate]);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].shift_id, 's-early');
    assert.ok(result.gaps.some((gap) => gap.shift_id === 's-late'));
  });

  it('respects required skills, certifications, and documenting experience gaps', () => {
    const skilled = makeCandidate({ user_id: 'skilled', skills: [{ skill_id: 'k1' }] });
    const unskilled = makeCandidate({ user_id: 'unskilled' });
    const shift = makeShift({ required_skill_ids: ['k1'] });
    const result = run([shift], [unskilled, skilled]);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].volunteer_id, 'skilled');

    const certShift = makeShift({ required_cert_names: ['First Aid'] });
    const certified = makeCandidate({
      user_id: 'cert',
      certifications: [{ name: 'First Aid', verification_status: 'ngo_verified', expiry: null }],
    });
    const expired = makeCandidate({
      user_id: 'expired',
      certifications: [{ name: 'First Aid', verification_status: 'ngo_verified', expiry: '2026-10-01' }],
    });
    const certResult = run([certShift], [expired, certified]);
    assert.equal(certResult.assignments.length, 1);
    assert.equal(certResult.assignments[0].volunteer_id, 'cert');
  });

  it('a candidate blocked by an overlapping busy interval is not assigned', () => {
    const result = run(
      [makeShift()],
      [makeCandidate()],
      [{ volunteer_id: 'vol-1', start_at: '2026-10-10T14:00:00Z', end_at: '2026-10-10T15:00:00Z' }],
    );
    assert.equal(result.assignments.length, 0);
    assert.equal(result.gaps[0].reason, 'Eligible volunteers were unavailable due to overlapping assignments.');
  });

  it('the same volunteer is never assigned to overlapping shifts in one run', () => {
    const a = makeShift({ id: 'a', start_at: '2026-10-10T13:30:00Z', end_at: '2026-10-10T15:00:00Z' });
    const b = makeShift({ id: 'b', start_at: '2026-10-10T14:00:00Z', end_at: '2026-10-10T16:30:00Z' });
    const result = run([a, b], [makeCandidate(), makeCandidate({ user_id: 'vol-2' })]);
    const byVolunteer = new Map<string, string[]>();
    for (const assignment of result.assignments) {
      byVolunteer.set(assignment.volunteer_id, [...(byVolunteer.get(assignment.volunteer_id) ?? []), assignment.shift_id]);
    }
    for (const shifts of byVolunteer.values()) {
      assert.ok(!(shifts.includes('a') && shifts.includes('b')), 'no volunteer on both overlapping shifts');
    }
  });

  it('uses Step 9 reliability as a ranking factor without inventing one', () => {
    const established = makeCandidate({
      user_id: 'reliable',
      reliability: { status: 'established', score: 100, attended: 8, late: 0, no_show: 0, volunteer_cancelled: 0 },
    });
    const noHistory = makeCandidate({ user_id: 'newbie', reliability: null });
    // Identical skills/availability → match scores tie; reliability must decide.
    const result = run([makeShift()], [noHistory, established]);
    assert.equal(result.assignments[0].volunteer_id, 'reliable');
  });

  it('balances workload across similarly-qualified volunteers', () => {
    const v1 = makeCandidate({ user_id: 'vol-a' });
    const v2 = makeCandidate({ user_id: 'vol-b' });
    const s1 = makeShift({ id: 's1', start_at: '2026-10-10T13:30:00Z', end_at: '2026-10-10T14:30:00Z' });
    const s2 = makeShift({ id: 's2', start_at: '2026-10-10T15:00:00Z', end_at: '2026-10-10T16:30:00Z' });
    const result = run([s1, s2], [v1, v2]);
    const assignedTo = new Map<string, number>();
    for (const assignment of result.assignments) assignedTo.set(assignment.volunteer_id, (assignedTo.get(assignment.volunteer_id) ?? 0) + 1);
    assert.deepEqual([...assignedTo.values()].sort(), [1, 1]);
  });

  it('reports staffing gaps with accurate counts and honest reasons', () => {
    const shift = makeShift({ headcount: 3 });
    const result = run([shift], [makeCandidate()]);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.gaps.length, 1);
    assert.deepEqual(
      { required: result.gaps[0].required, assigned: result.gaps[0].assigned, unfilled: result.gaps[0].unfilled },
      { required: 3, assigned: 1, unfilled: 2 },
    );
  });

  it('does not fabricate assignments when nobody is eligible', () => {
    const result = run([makeShift({ required_skill_ids: ['k-missing'] })], [makeCandidate()]);
    assert.equal(result.assignments.length, 0);
    assert.equal(result.gaps[0].reason, 'No accepted volunteer meets the required skills/certifications.');
  });

  it('rejects invalid shift intervals deterministically', () => {
    const bad = makeShift({ id: 'bad', start_at: EVENT_END, end_at: EVENT_START });
    const result = run([bad], [makeCandidate()]);
    assert.equal(result.assignments.length, 0);
    assert.deepEqual(result.rejected_shifts.map((row) => row.shift_id), ['bad']);
  });

  it('rejects shifts outside the event window', () => {
    const outside = makeShift({ id: 'out', start_at: '2026-10-11T13:30:00Z', end_at: '2026-10-11T16:30:00Z' });
    const result = run([outside], [makeCandidate()]);
    assert.equal(result.assignments.length, 0);
    assert.equal(result.rejected_shifts[0].shift_id, 'out');
  });

  it('is deterministic: identical inputs produce identical output', () => {
    const candidates = [
      makeCandidate({ user_id: 'v-1' }),
      makeCandidate({ user_id: 'v-2', skills: [{ skill_id: 'k' }] }),
      makeCandidate({ user_id: 'v-3' }),
    ];
    const shifts = [makeShift({ id: 's1', headcount: 2 }), makeShift({ id: 's2', start_at: '2026-10-10T15:00:00Z' })];
    const first = run(shifts, candidates);
    const second = run(shifts, candidates);
    assert.deepEqual(first, second);
  });
});

describe('hard gates', () => {
  it('skill/cert/availability gates are independently testable', () => {
    const candidate = makeCandidate();
    assert.equal(candidateHasRequiredSkills(candidate, []), true);
    assert.equal(candidateHasRequiredSkills(candidate, ['x']), false);
    assert.equal(candidateHasRequiredCertifications(candidate, [], '2026-10-10'), true);
    assert.equal(candidateCoversShift(candidate, makeShift()), true);
    assert.equal(candidateCoversShift(candidate, makeShift({ end_at: '2026-10-10T18:00:00Z' })), false);
  });
});
