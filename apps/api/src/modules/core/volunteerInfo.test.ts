import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import { APPLICATION_STATUSES } from '@sevasetu/constants';
import {
  countAcceptedByEvent,
  projectVolunteerInfo,
  selectAccepted,
} from './volunteerInfo.js';

describe('projectVolunteerInfo', () => {
  it('projects only the security-permitted volunteer fields', () => {
    const projected = projectVolunteerInfo({
      id: 'user-1',
      name: 'Asha Rao',
      photo_url: 'https://example.com/a.png',
      bio: 'Community volunteer',
      causes: ['Health', 'Education'],
      home_geo: 'SRID=4326;POINT(77.59 12.97)',
      max_distance_km: 15,
      emergency_available: true,
      notification_preferences: { email: true },
      email: 'asha@example.com',
    });
    assert.deepEqual(projected, {
      id: 'user-1',
      name: 'Asha Rao',
      photo_url: 'https://example.com/a.png',
      bio: 'Community volunteer',
      causes: ['Health', 'Education'],
    });
  });

  it('fills non-permitted optional fields with null and drops extras', () => {
    const projected = projectVolunteerInfo({ id: 'user-2', name: 'Vikram', phone: '+91-90000-00000' });
    assert.deepEqual(projected, {
      id: 'user-2',
      name: 'Vikram',
      photo_url: null,
      bio: null,
      causes: null,
    });
  });

  it('returns null for null, undefined, or non-object input', () => {
    assert.equal(projectVolunteerInfo(null), null);
    assert.equal(projectVolunteerInfo(undefined), null);
    assert.equal(projectVolunteerInfo('profile'), null);
  });

  it('returns null when id or name is missing or mistyped', () => {
    assert.equal(projectVolunteerInfo({ name: 'No id' }), null);
    assert.equal(projectVolunteerInfo({ id: 'user-3', name: 42 }), null);
  });
});

describe('countAcceptedByEvent', () => {
  it('counts rows per event id', () => {
    assert.deepEqual(
      countAcceptedByEvent([{ event_id: 'e1' }, { event_id: 'e1' }, { event_id: 'e2' }]),
      { e1: 2, e2: 1 },
    );
  });

  it('returns an empty record for no rows', () => {
    assert.deepEqual(countAcceptedByEvent([]), {});
  });
});

void test('selectAccepted keeps only accepted rows in original order', () => {
  const rows = [
    { id: 'a', status: APPLICATION_STATUSES.INTERESTED },
    { id: 'b', status: APPLICATION_STATUSES.ACCEPTED },
    { id: 'c', status: APPLICATION_STATUSES.WAITLISTED },
    { id: 'd', status: APPLICATION_STATUSES.REJECTED },
    { id: 'e', status: APPLICATION_STATUSES.ACCEPTED },
  ];
  assert.deepEqual(selectAccepted(rows), [
    { id: 'b', status: 'accepted' },
    { id: 'e', status: 'accepted' },
  ]);
});

void test('selectAccepted tolerates empty, null, and undefined input', () => {
  assert.deepEqual(selectAccepted([]), []);
  assert.deepEqual(selectAccepted(null), []);
  assert.deepEqual(selectAccepted(undefined), []);
});
