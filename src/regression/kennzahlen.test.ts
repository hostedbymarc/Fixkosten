import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kennzahlen } from './kennzahlen';

// Golden file: computed with main 9a97477 (before the Fixkostenkonto sprint) by the same helper.
const GOLDEN = 'tests/regression/kennzahlen-vor-fixkostenkonto.json';

describe('Regression: bestehende Kennzahlen unverändert', () => {
  it('Ø pro Monat, Frei verfügbar, Vermögensaufbau, Sparquote, Plan vs. Ist, Jahresvorschau, geplante Änderungen, Format', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    expect(JSON.parse(JSON.stringify(kennzahlen()))).toEqual(golden);
  });
});
