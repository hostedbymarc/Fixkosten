import { describe, expect, it } from 'vitest';
import { FEATURE_REMINDERS } from './features';

describe('feature flags', () => {
  it('reminders are switched off (UI hidden, data kept)', () => {
    expect(FEATURE_REMINDERS).toBe(false);
  });
});
