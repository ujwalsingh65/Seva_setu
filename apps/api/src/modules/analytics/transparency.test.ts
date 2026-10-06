import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNgoTransparency, type TransparencyEvidence } from './transparencyService.js';

let seq = 0;
function row(overrides: Partial<TransparencyEvidence> = {}): TransparencyEvidence {
  seq += 1;
  return {
    event_id: `e${seq}`,
    volunteer_id: `v${seq}`,
    status: 'attended',
    cancellation_source: null,
    participation_hours: null,
    event_type: 'standard',
    event_status: 'completed',
    event_visibility: 'public',
    event_title: `Event ${seq}`,
    event_start_at: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

describe('buildNgoTransparency', () => {
  it('counts verified participation = attended or late only', () => {
    const result = buildNgoTransparency([
      row(),
      row({ status: 'late' }),
      row({ status: 'no_show' }),
      row({ status: 'cancelled', cancellation_source: 'volunteer' }),
      row({ status: 'cancelled', cancellation_source: 'ngo' }),
      row({ status: 'cancelled', cancellation_source: 'event' }),
    ]);
    assert.equal(result.verified_participations, 2);
  });

  it('unique volunteers and returning volunteers are distinct-event based', () => {
    const result = buildNgoTransparency([
      row({ volunteer_id: 'v1', event_id: 'e1' }),
      row({ volunteer_id: 'v1', event_id: 'e2' }),
      row({ volunteer_id: 'v2', event_id: 'e1' }),
      row({ volunteer_id: 'v2', event_id: 'e1', status: 'late' }),
    ]);
    assert.equal(result.unique_volunteers, 2);
    assert.equal(result.returning_volunteers, 1);
  });

  it('service hours sum only over attended/late, and report not_recorded honestly', () => {
    const withHours = buildNgoTransparency([
      row({ participation_hours: 4 }),
      row({ status: 'late', participation_hours: 2 }),
      row({ status: 'no_show', participation_hours: 99 }),
    ]);
    assert.equal(withHours.verified_service_hours, 6);
    assert.equal(withHours.service_hours_status, 'recorded');

    const withoutHours = buildNgoTransparency([row()]);
    assert.equal(withoutHours.verified_service_hours, null);
    assert.equal(withoutHours.service_hours_status, 'not_recorded');
  });

  it('emergency events require real emergency participation', () => {
    const result = buildNgoTransparency([
      row({ event_type: 'emergency' }),
      row({ event_type: 'emergency', status: 'no_show' }),
    ]);
    assert.equal(result.emergency_events_supported, 1);
  });

  it('draft and cancelled events are never counted; ngo_only counts to aggregates but not to recent public events', () => {
    const result = buildNgoTransparency([
      row({ event_id: 'draft', event_status: 'draft' }),
      row({ event_id: 'cancelled', event_status: 'cancelled' }),
      row({ event_id: 'private', event_visibility: 'ngo_only' }),
    ]);
    assert.equal(result.completed_events, 1); // only completed event counts
    assert.equal(result.verified_participations, 1); // draft/cancelled rows excluded; ngo_only row retained
    assert.deepEqual(result.recent_events.map((e) => e.event_id), []); // ngo_only not publicly listed
  });

  it('no trust score, no ratings, deterministic for identical input', () => {
    const rows = [row({ participation_hours: 3 }), row({ status: 'late', event_type: 'emergency' })];
    const a = buildNgoTransparency(rows);
    assert.deepEqual(a, buildNgoTransparency(rows));
    assert.ok(!('trust_score' in a) && !('rating' in a));
    assert.ok(a.verified_service_hours === 3);
  });
});
