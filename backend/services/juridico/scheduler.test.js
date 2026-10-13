import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { startJuridicoScheduler, stopJuridicoScheduler } from './scheduler.js';

afterEach(() => stopJuridicoScheduler());

test('schedulerStartsOnlyOnce', () => {
  const first = startJuridicoScheduler();
  const second = startJuridicoScheduler();
  assert.equal(first, second);
  assert.ok(first);
});
