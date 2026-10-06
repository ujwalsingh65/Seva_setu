import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateVolunteerKarma, karmaForParticipation, karmaLevelFor } from './karmaService.js';

const row = (overrides: Record<string, unknown> = {}) => ({
  event_id: 'e1',
  status: 'attended',
  cancellation_source: null,
  participation_hours: null,
  event_type: 'standard',
  event_start_at: '2026-10-01T00:00:00Z',
  event_title: 'Food Drive',
  ...overrides,
});

describe('karmaForParticipation', () => {
  it('attended = 10, late = 7, everything else = 0', () => {
    assert.equal(karmaForParticipation('attended', null, 'standard').points, 10);
    assert.equal(karmaForParticipation('late', null, 'standard').points, 7);
    assert.equal(karmaForParticipation('no_show', null, 'standard').points, 0);
    assert.equal(karmaForParticipation('cancelled', null, 'standard').points, 0);
  });

  it('verified hours add 2/hr, capped at 10', () => {
    assert.equal(karmaForParticipation('attended', 4, 'standard').points, 10 + 8);
    assert.equal(karmaForParticipation('attended', 100, 'standard').points, 10 + 10);
    assert.equal(karmaForParticipation('late', 0, 'standard').points, 7);
  });

  it('emergency bonus requires a real emergency event AND attendance', () => {
    assert.equal(karmaForParticipation('attended', null, 'emergency').points, 15);
    assert.equal(karmaForParticipation('late', 2, 'emergency').points, 7 + 4 + 5);
    // An invitation without participation does not create a row at all; a row
    // with no_show on an emergency event earns nothing.
    assert.equal(karmaForParticipation('no_show', null, 'emergency').points, 0);
  });
});

describe('calculateVolunteerKarma', () => {
  it('aggregates a deterministic, explainable breakdown', () => {
    const result = calculateVolunteerKarma([
      row({ event_id: 'e1', participation_hours: 4 }),
      row({ event_id: 'e2', status: 'late', participation_hours: 2, event_start_at: '2026-10-05T00:00:00Z' }),
      row({ event_id: 'e3', status: 'attended', event_type: 'emergency', event_start_at: '2026-10-08T00:00:00Z' }),
      row({ event_id: 'e4', status: 'no_show' }),
      row({ event_id: 'e5', status: 'cancelled', cancellation_source: 'ngo' }),
      row({ event_id: 'e6', status: 'cancelled', cancellation_source: 'volunteer' }),
    ]);
    assert.deepEqual(result.breakdown, { participation: 10 + 7 + 10, verified_service: 8 + 4, emergency_contribution: 5 });
    assert.equal(result.total_karma, 27 + 12 + 5);
    assert.equal(result.participated_events, 3);
    assert.equal(result.verified_service_hours, 6);
    assert.equal(result.emergency_contributions, 1);
    assert.equal(result.recent_contributions[0].event_id, 'e3'); // sorted newest first
  });

  it('no history → zero, null hours, empty recent (no fake impact)', () => {
    const result = calculateVolunteerKarma([]);
    assert.equal(result.total_karma, 0);
    assert.equal(result.level, 'Emerging Contributor');
    assert.equal(result.verified_service_hours, null);
    assert.deepEqual(result.recent_contributions, []);
  });

  it('no-show + cancellations only → zero total', () => {
    const result = calculateVolunteerKarma([
      row({ status: 'no_show' }),
      row({ status: 'cancelled', cancellation_source: 'system' }),
      row({ status: 'cancelled', cancellation_source: 'volunteer' }),
    ]);
    assert.equal(result.total_karma, 0);
    assert.equal(result.participated_events, 0);
  });

  it('levels follow centralized thresholds', () => {
    assert.equal(karmaLevelFor(0), 'Emerging Contributor');
    assert.equal(karmaLevelFor(49), 'Emerging Contributor');
    assert.equal(karmaLevelFor(50), 'Active Contributor');
    assert.equal(karmaLevelFor(150), 'Committed Contributor');
    assert.equal(karmaLevelFor(300), 'Community Champion');
  });

  it('is deterministic for identical input', () => {
    const rows = [row(), row({ event_id: 'e2', status: 'late' })];
    assert.deepEqual(calculateVolunteerKarma(rows), calculateVolunteerKarma(rows));
  });
});
