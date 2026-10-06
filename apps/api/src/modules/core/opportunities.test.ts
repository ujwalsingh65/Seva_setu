import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterPublicEvents, projectRequirements } from './opportunities.js';

const base = {
  title: 'Weekend Food Distribution',
  description: 'Help pack meals',
  cause: 'hunger',
  venue: 'Community Hall',
  start_at: '2026-10-17T10:00:00Z',
  visibility: 'public',
  status: 'published',
  capacity: 10,
  event_type: 'standard',
  urgency: null,
  registration_mode: 'open',
  id: 'e1',
};

describe('filterPublicEvents', () => {
  it('keeps only public + published events', () => {
    const events = [base, { ...base, id: 'e2', visibility: 'ngo_only' }, { ...base, id: 'e3', status: 'draft' }];
    assert.deepEqual(filterPublicEvents(events, {}, {}).map((e) => e.id), ['e1']);
  });

  it('applies search, cause, date, type, urgency, registration mode, capacity filters', () => {
    const events = [
      base,
      { ...base, id: 'e2', cause: 'education' },
      { ...base, id: 'e3', event_type: 'emergency', urgency: 'high' },
      { ...base, id: 'e4', registration_mode: 'approval_required' },
      { ...base, id: 'e5', start_at: '2026-11-17T10:00:00Z' },
    ];
    assert.equal(filterPublicEvents(events, {}, { cause: 'hunger' }).length, 4);
    assert.equal(filterPublicEvents(events, {}, { search: 'food' }).length, 5);
    assert.equal(filterPublicEvents(events, {}, { type: 'emergency' }).length, 1);
    assert.equal(filterPublicEvents(events, {}, { urgency: 'high' }).length, 1);
    assert.equal(filterPublicEvents(events, {}, { registrationMode: 'approval_required' }).length, 1);
    assert.equal(filterPublicEvents(events, {}, { to: '2026-10-31T00:00:00Z' }).length, 4);
    assert.deepEqual(filterPublicEvents(events, { e1: 10 }, { hasCapacity: true }).map((e) => e.id), ['e2', 'e3', 'e4', 'e5']);
  });

  it('is deterministic for identical inputs', () => {
    const events = [base, { ...base, id: 'e2', cause: 'education' }];
    assert.deepEqual(filterPublicEvents(events, {}, { search: 'weekend' }), filterPublicEvents(events, {}, { search: 'weekend' }));
  });
});

describe('projectRequirements', () => {
  it('maps skill ids to sorted public names and sorts certs', () => {
    const projected = projectRequirements(
      [{ role: 'Registration', headcount: 2, required_skill_ids: ['s1', 'unknown'], required_cert_names: ['CPR', 'First Aid'], min_experience: 0 }],
      { s1: 'Communication' },
    );
    assert.deepEqual(projected, [
      { role: 'Registration', headcount: 2, required_skills: ['Communication', 'Unlisted skill'], required_certifications: ['CPR', 'First Aid'], min_experience: 0 },
    ]);
  });
});
