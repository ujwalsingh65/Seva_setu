import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationDecisionSchema,
  createAvailabilitySchema,
  jsonObjectSchema,
} from '@sevasetu/validation';

test('availability accepts a recurring weekly window', () => {
  const parsed = createAvailabilitySchema.safeParse({
    weekday: 1,
    start_time: '09:00',
    end_time: '17:00',
    available_date: null,
    is_available: true,
    recurrence: null,
  });

  assert.equal(parsed.success, true);
});

test('availability accepts a date-specific all-day exception', () => {
  const parsed = createAvailabilitySchema.safeParse({
    weekday: null,
    start_time: null,
    end_time: null,
    available_date: '2026-10-05',
    is_available: false,
    recurrence: null,
  });

  assert.equal(parsed.success, true);
});

test('availability rejects incomplete recurring windows and mixed recurrence forms', () => {
  const incompleteWeeklyWindow = createAvailabilitySchema.safeParse({
    weekday: 1,
    start_time: '09:00',
    end_time: null,
    available_date: null,
    is_available: true,
    recurrence: null,
  });
  const mixedWindow = createAvailabilitySchema.safeParse({
    weekday: 1,
    start_time: '09:00',
    end_time: '17:00',
    available_date: '2026-10-05',
    is_available: true,
    recurrence: null,
  });

  assert.equal(incompleteWeeklyWindow.success, false);
  assert.equal(mixedWindow.success, false);
});

test('availability rejects invalid dates and reversed time windows', () => {
  const invalidDate = createAvailabilitySchema.safeParse({
    weekday: null,
    start_time: null,
    end_time: null,
    available_date: '2026-02-30',
    is_available: false,
    recurrence: null,
  });
  const reversedTimes = createAvailabilitySchema.safeParse({
    weekday: 1,
    start_time: '17:00',
    end_time: '09:00',
    available_date: null,
    is_available: true,
    recurrence: null,
  });

  assert.equal(invalidDate.success, false);
  assert.equal(reversedTimes.success, false);
});

test('application review accepts only documented decision statuses', () => {
  assert.equal(applicationDecisionSchema.safeParse({ status: 'accepted' }).success, true);
  assert.equal(applicationDecisionSchema.safeParse({ status: 'rejected' }).success, true);
  assert.equal(applicationDecisionSchema.safeParse({ status: 'pending' }).success, false);
});

test('JSONB contact/preferences reject non-JSON values', () => {
  assert.equal(jsonObjectSchema.safeParse({ phone: '+10000000000' }).success, true);
  assert.equal(jsonObjectSchema.safeParse({ invalid: Number.NaN }).success, false);
});
