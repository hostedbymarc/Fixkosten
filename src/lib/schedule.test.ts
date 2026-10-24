import { describe, expect, it } from 'vitest';
import { planDescription, scheduleLabel } from '../components/Chips';
import type { PlanEntry } from './types';

const plan = (frequency: PlanEntry['frequency'], dueMonths: number[], extra: Partial<PlanEntry> = {}): PlanEntry => ({ validFrom: '2026-10', amount: 14, frequency, dueMonths, ...extra });

describe('Rhythmus-Label: Fälligkeitsmonate immer sichtbar', () => {
  it('Quartal zeigt die Monate wie halbjährlich und jährlich', () => {
    expect(scheduleLabel(plan('quarterly', [1, 4, 7, 10]))).toBe('Quartal · Jän, Apr, Jul, Okt');
    expect(scheduleLabel(plan('quarterly', [11, 2, 5, 8]))).toBe('Quartal · Feb, Mai, Aug, Nov');
    expect(scheduleLabel(plan('semiannual', [6, 12]))).toBe('Halbjährlich · Jun, Dez');
    expect(scheduleLabel(plan('annual', [12], { dueDay: 1 }), '2026-12')).toBe('Jährlich · 1.12.');
    expect(scheduleLabel(plan('monthly', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });

  it('Positionen-Liste und Detail-Sheet: dieselben Monate', () => {
    expect(planDescription(plan('quarterly', [1, 4, 7, 10]))).toBe('Quartal · Jän, Apr, Jul, Okt');
  });
});
