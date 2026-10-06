import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNgoEngagement,
  buildVolunteerEngagement,
  classifyEngagement,
  type EngagementRecord,
} from './analyticsService.js';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString();

function record(overrides: Partial<EngagementRecord> = {}): EngagementRecord {
  return {
    volunteer_id: 'v1',
    event_id: 'e1',
    status: 'attended',
    cancellation_source: null,
    participation_hours: null,
    event_start_at: iso(10),
    event_type: 'standard',
    event_title: 'Food Drive',
    ...overrides,
  };
}

describe('classifyEngagement', () => {
  it('no history → new (never inactive)', () => {
    const result = classifyEngagement([], NOW);
    assert.equal(result.status, 'new');
  });

  it('attended 10 days ago → active', () => {
    assert.equal(classifyEngagement([record()], NOW).status, 'active');
  });

  it('attended 60 days ago → engaged', () => {
    assert.equal(classifyEngagement([record({ event_start_at: iso(60) })], NOW).status, 'engaged');
  });

  it('attended 120 days ago → at_risk', () => {
    assert.equal(classifyEngagement([record({ event_start_at: iso(120) })], NOW).status, 'at_risk');
  });

  it('attended 200 days ago → inactive', () => {
    assert.equal(classifyEngagement([record({ event_start_at: iso(200) })], NOW).status, 'inactive');
  });

  it('records but no attendance → at_risk, never "new" or "inactive"', () => {
    assert.equal(classifyEngagement([record({ status: 'no_show' })], NOW).status, 'at_risk');
    assert.equal(classifyEngagement([record({ status: 'cancelled', cancellation_source: 'volunteer' })], NOW).status, 'at_risk');
  });

  it('boundary: exactly 30 days → active; exactly 90 → engaged; exactly 180 → at_risk', () => {
    assert.equal(classifyEngagement([record({ event_start_at: iso(30) })], NOW).status, 'active');
    assert.equal(classifyEngagement([record({ event_start_at: iso(90) })], NOW).status, 'engaged');
    assert.equal(classifyEngagement([record({ event_start_at: iso(180) })], NOW).status, 'at_risk');
  });
});

describe('buildVolunteerEngagement', () => {
  it('aggregates attendance, hours, emergency events, and recent activity', () => {
    const result = buildVolunteerEngagement('v1', [
      record({ event_id: 'e1', participation_hours: 4 }),
      record({ event_id: 'e2', status: 'late', participation_hours: 2, event_start_at: iso(5), event_type: 'emergency', event_title: 'Flood Relief' }),
      record({ event_id: 'e3', status: 'no_show', event_start_at: iso(3) }),
      record({ event_id: 'e4', status: 'cancelled', cancellation_source: 'ngo', event_start_at: iso(2) }),
    ], NOW);
    assert.equal(result.totals.events_participated, 2);
    assert.equal(result.totals.attended, 1);
    assert.equal(result.totals.late, 1);
    assert.equal(result.totals.no_show, 1);
    assert.equal(result.totals.event_cancelled, 1);
    assert.equal(result.totals.service_hours, 6);
    assert.equal(result.totals.emergency_events, 1);
    assert.equal(result.attendance_rate, 67);
    assert.equal(result.recent_activity.length, 4);
    assert.equal(result.status, 'active');
  });

  it('service hours null when never recorded; volunteer cancellation penalizes eligibility only', () => {
    const result = buildVolunteerEngagement('v1', [record({ participation_hours: null })], NOW);
    assert.equal(result.totals.service_hours, null);
    const cancelled = buildVolunteerEngagement('v1', [record({ status: 'cancelled', cancellation_source: 'volunteer' })], NOW);
    assert.equal(cancelled.totals.volunteer_cancelled, 1);
    assert.equal(cancelled.attendance_rate, 0);
    assert.equal(cancelled.status, 'at_risk');
  });

  it('no history → zeros, null rates, empty activity, status new', () => {
    const result = buildVolunteerEngagement('v1', [], NOW);
    assert.equal(result.status, 'new');
    assert.equal(result.attendance_rate, null);
    assert.deepEqual(result.recent_activity, []);
    assert.equal(result.totals.events_participated, 0);
  });
});

describe('buildNgoEngagement', () => {
  it('counts distribution across statuses and the returning rate deterministically', () => {
    const rows = [
      record({ volunteer_id: 'v1' }), // active
      record({ volunteer_id: 'v1', event_id: 'e2', event_start_at: iso(6) }), // v1 repeat
      record({ volunteer_id: 'v2', event_start_at: iso(60) }), // engaged
      record({ volunteer_id: 'v3', event_start_at: iso(150) }), // at_risk
      record({ volunteer_id: 'v4', status: 'no_show' }), // at_risk
    ];
    const result = buildNgoEngagement(rows, NOW);
    assert.deepEqual(result.volunteers, { total: 4, active: 1, engaged: 1, at_risk: 2, inactive: 0, new: 0 });
    assert.equal(result.returning_volunteer_rate, 33); // 1 of 3 with >=1 event returned
    assert.equal(result.attendance_rate, 80);
    assert.ok(result.insights.some((insight) => insight.includes('not participated recently')));
  });

  it('trend direction follows the 30d vs prior-30d windows', () => {
    const up = buildNgoEngagement([record({ event_start_at: iso(5) }), record({ event_id: 'e2', event_start_at: iso(10) }), record({ event_start_at: iso(40) })], NOW);
    assert.equal(up.trend.direction, 'up');
    const down = buildNgoEngagement([record({ event_start_at: iso(40) }), record({ event_id: 'e2', event_start_at: iso(50) }), record({ event_start_at: iso(5) })], NOW);
    assert.equal(down.trend.direction, 'down');
    const flat = buildNgoEngagement([record({ event_start_at: iso(5) }), record({ event_start_at: iso(40) })], NOW);
    assert.equal(flat.trend.direction, 'flat');
  });

  it('identical input yields identical output', () => {
    const rows = [record(), record({ volunteer_id: 'v2', event_start_at: iso(45) })];
    assert.deepEqual(buildNgoEngagement(rows, NOW), buildNgoEngagement(rows, NOW));
  });

  it('empty input returns honest zeros, not fake insights', () => {
    const result = buildNgoEngagement([], NOW);
    assert.deepEqual(result.volunteers, { total: 0, active: 0, engaged: 0, at_risk: 0, inactive: 0, new: 0 });
    assert.equal(result.returning_volunteer_rate, null);
    assert.equal(result.attendance_rate, null);
    assert.equal(result.trend.direction, 'flat');
    assert.ok(result.insights[0].includes('No strong engagement signals'));
  });
});
