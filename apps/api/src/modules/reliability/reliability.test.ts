import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canViewVolunteerReliability,
  isRecordableApplicationStatus,
} from './routes.js';
import {
  computeReliability,
  countHistory,
  summarizeReliabilityForMatching,
  type ParticipationOutcomeLike,
} from './reliabilityService.js';

const row = (status: string, cancellation_source: string | null = null): ParticipationOutcomeLike => ({
  status,
  cancellation_source,
});

describe('participation outcomes recorded correctly (attended / late / no-show / volunteer cancellation)', () => {
  it('attended rows count as present evidence', () => {
    const history = countHistory([row('attended')]);
    assert.equal(history.attended, 1);
    assert.equal(history.eligible_events, 1);
  });

  it('late rows count as attended-but-flagged evidence', () => {
    const history = countHistory([row('late')]);
    assert.equal(history.late, 1);
    assert.equal(history.eligible_events, 1);
  });

  it('no-show rows are penalized evidence', () => {
    const history = countHistory([row('no_show')]);
    assert.equal(history.no_show, 1);
    assert.equal(history.eligible_events, 1);
  });

  it('volunteer cancellations are penalized evidence', () => {
    const history = countHistory([row('cancelled', 'volunteer')]);
    assert.equal(history.volunteer_cancelled, 1);
    assert.equal(history.eligible_events, 1);
  });

  it('NGO/event/system cancellations are NOT penalized', () => {
    for (const source of ['ngo', 'event', 'system']) {
      const history = countHistory([row('cancelled', source)]);
      assert.equal(history.volunteer_cancelled, 0);
      assert.equal(history.event_cancelled, 1);
      assert.equal(history.eligible_events, 0, `source ${source} must not count against the volunteer`);
    }
  });
});

describe('computeReliability', () => {
  it('a perfect, established history scores 100 with full explanation', () => {
    const rows = Array.from({ length: 6 }, () => row('attended'));
    const result = computeReliability(rows);
    assert.equal(result.status, 'established');
    assert.equal(result.score, 100);
    assert.deepEqual(result.history, {
      eligible_events: 6,
      attended: 6,
      late: 0,
      no_show: 0,
      volunteer_cancelled: 0,
      event_cancelled: 0,
    });
    assert.equal(result.factors?.attendance.earned, 50);
    assert.equal(result.factors?.no_show.earned, 25);
    assert.equal(result.factors?.cancellations.earned, 15);
    assert.equal(result.factors?.consistency.earned, 10);
    assert.ok(result.explanation.includes('6 attended'));
  });

  it('a mixed history produces the documented weighted score', () => {
    // 6 attended, 1 late, 1 no_show, 1 volunteer-cancelled, 1 event-cancelled.
    const rows = [
      ...Array.from({ length: 6 }, () => row('attended')),
      row('late'),
      row('no_show'),
      row('cancelled', 'volunteer'),
      row('cancelled', 'ngo'),
    ];
    const result = computeReliability(rows);
    // eligible = 9; attendance 7/9→78*(.50)=39, no_show 8/9→89*(.25)=22,
    // cancellations 8/9→89*(.15)=13, consistency 9/5→100*(.10)=10 → 84
    assert.equal(result.status, 'established');
    assert.equal(result.score, 84);
    assert.equal(result.history.event_cancelled, 1);
    assert.ok(result.explanation.includes('9 recorded events'));
  });

  it('no-shows reduce the score via the no-show factor', () => {
    const clean = computeReliability(Array.from({ length: 5 }, () => row('attended')));
    const dirty = computeReliability([...Array.from({ length: 4 }, () => row('attended')), row('no_show')]);
    assert.ok(clean.score! > dirty.score!);
    assert.equal(dirty.factors?.no_show.explanation, '1 of 5 recorded events were no-shows.');
  });

  it('volunteer cancellations reduce the score via the cancellations factor', () => {
    const clean = computeReliability(Array.from({ length: 5 }, () => row('attended')));
    const dirty = computeReliability([...Array.from({ length: 4 }, () => row('attended')), row('cancelled', 'volunteer')]);
    assert.ok(clean.score! > dirty.score!);
  });

  it('NGO cancellations do not reduce the score', () => {
    const base = computeReliability(Array.from({ length: 5 }, () => row('attended')));
    const withCancelled = computeReliability([...Array.from({ length: 5 }, () => row('attended')), row('cancelled', 'ngo')]);
    assert.equal(withCancelled.score, base.score);
    assert.equal(withCancelled.history.event_cancelled, 1);
  });

  it('NO DATA ≠ BAD RELIABILITY: empty history → score null, insufficient_data', () => {
    const result = computeReliability([]);
    assert.equal(result.score, null);
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.label, 'Building history');
    assert.equal(result.factors, null);
    assert.ok(result.explanation.includes('Not enough'));
  });

  it('below the minimum evidence threshold there is never a numeric score', () => {
    for (const n of [1, 2]) {
      const result = computeReliability(Array.from({ length: n }, () => row('attended')));
      assert.equal(result.status, 'insufficient_data');
      assert.equal(result.score, null);
    }
  });

  it('3-4 records → provisional with a real score; 5+ → established', () => {
    const three = computeReliability(Array.from({ length: 3 }, () => row('attended')));
    assert.equal(three.status, 'provisional');
    assert.ok(typeof three.score === 'number');
    const five = computeReliability(Array.from({ length: 5 }, () => row('attended')));
    assert.equal(five.status, 'established');
  });

  it('returns a deterministic factor breakdown with weights summing to 100', () => {
    const rows = [...Array.from({ length: 5 }, () => row('attended')), row('no_show'), row('late')];
    const result = computeReliability(rows);
    const weights = [
      result.factors!.attendance.weight,
      result.factors!.no_show.weight,
      result.factors!.cancellations.weight,
      result.factors!.consistency.weight,
    ];
    assert.deepEqual(weights, [50, 25, 15, 10]);
    assert.equal(
      result.score,
      result.factors!.attendance.earned +
        result.factors!.no_show.earned +
        result.factors!.cancellations.earned +
        result.factors!.consistency.earned,
    );
  });

  it('never exposes private volunteer fields in the result', () => {
    const result = computeReliability(Array.from({ length: 5 }, () => row('attended')));
    const serialized = JSON.stringify(result);
    for (const forbidden of ['email', 'phone', 'home_geo', 'max_distance_km', 'notification', 'lng', 'POINT']) {
      assert.ok(!serialized.includes(forbidden), `reliability result must not include ${forbidden}`);
    }
  });
});

describe('summarizeReliabilityForMatching', () => {
  it('passes through insufficient status with null score', () => {
    const summary = summarizeReliabilityForMatching([row('attended')]);
    assert.equal(summary.status, 'insufficient_data');
    assert.equal(summary.score, null);
  });

  it('returns the established score and counts', () => {
    const summary = summarizeReliabilityForMatching(Array.from({ length: 5 }, () => row('attended')));
    assert.equal(summary.status, 'established');
    assert.equal(summary.score, 100);
    assert.equal(summary.attended, 5);
  });
});

describe('authorization predicates', () => {
  it('a volunteer can view only their own record', () => {
    assert.equal(
      canViewVolunteerReliability({ appUserId: 'u1', volunteerId: 'u1', ngoStaffHasVolunteer: false }),
      true,
    );
    assert.equal(
      canViewVolunteerReliability({ appUserId: 'u2', volunteerId: 'u1', ngoStaffHasVolunteer: false }),
      false,
    );
  });

  it('NGO staff can view only when an operational tie exists', () => {
    assert.equal(
      canViewVolunteerReliability({ appUserId: 'ngo-user', volunteerId: 'u1', ngoStaffHasVolunteer: true }),
      true,
    );
    assert.equal(
      canViewVolunteerReliability({ appUserId: 'ngo-user', volunteerId: 'u1', ngoStaffHasVolunteer: false }),
      false,
    );
  });

  it('duplicate-ish safety: only acceptable application states are recordable', () => {
    assert.equal(isRecordableApplicationStatus('accepted'), true);
    assert.equal(isRecordableApplicationStatus('cancelled'), true);
    assert.equal(isRecordableApplicationStatus('interested'), false);
    assert.equal(isRecordableApplicationStatus('waitlisted'), false);
    assert.equal(isRecordableApplicationStatus('rejected'), false);
  });
});

describe('participation validation schema', () => {
  it('rejects cancelled status without a cancellation_source', async () => {
    const { recordParticipationSchema } = await import('@sevasetu/validation');
    const parsed = recordParticipationSchema.safeParse({
      outcomes: [{ volunteer_id: crypto.randomUUID(), status: 'cancelled' }],
    });
    assert.equal(parsed.success, false);
  });

  it('rejects cancellation_source on non-cancelled statuses', async () => {
    const { recordParticipationSchema } = await import('@sevasetu/validation');
    const parsed = recordParticipationSchema.safeParse({
      outcomes: [{ volunteer_id: crypto.randomUUID(), status: 'attended', cancellation_source: 'volunteer' }],
    });
    assert.equal(parsed.success, false);
  });

  it('rejects check-out before check-in', async () => {
    const { recordParticipationSchema } = await import('@sevasetu/validation');
    const parsed = recordParticipationSchema.safeParse({
      outcomes: [
        {
          volunteer_id: crypto.randomUUID(),
          status: 'attended',
          check_in_at: '2026-10-10T10:00:00Z',
          check_out_at: '2026-10-10T09:00:00Z',
        },
      ],
    });
    assert.equal(parsed.success, false);
  });

  it('accepts a well-formed outcome', async () => {
    const { recordParticipationSchema } = await import('@sevasetu/validation');
    const parsed = recordParticipationSchema.safeParse({
      outcomes: [
        {
          volunteer_id: crypto.randomUUID(),
          status: 'cancelled',
          cancellation_source: 'volunteer',
        },
      ],
    });
    assert.equal(parsed.success, true);
  });
});
