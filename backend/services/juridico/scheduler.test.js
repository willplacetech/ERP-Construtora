import { jest } from '@jest/globals';
import { startJuridicoScheduler, stopJuridicoScheduler } from './scheduler.js';

afterEach(() => stopJuridicoScheduler());

test('schedulerStartsOnlyOnce', () => {
    const first = startJuridicoScheduler();
    const second = startJuridicoScheduler();
    expect(first).toBe(second);
    expect(first).toBeTruthy();
});