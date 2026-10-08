import { describe, expect, it } from 'vitest';
import { CATEGORY_SLOTS, IMMOS_COLOR_KEY, categoryColor, categoryKey } from './categoryColors';

describe('category colours: stored keys stay, tokens change', () => {
  it('keeps the phase-2 hex strings as keys (data in DB and backups)', () => {
    expect(CATEGORY_SLOTS.map((s) => s.key)).toEqual([
      '#2E2E8A',
      '#5B5BD6',
      '#9494E8',
      '#0F766E',
      '#B08968',
      '#52525B',
      '#A1A1AA',
      '#27272A',
    ]);
    expect(IMMOS_COLOR_KEY).toBe('#2E2E8A');
  });

  it('paints every key with its token', () => {
    CATEGORY_SLOTS.forEach((s, i) => expect(categoryColor(s.key)).toBe(`var(--cat-${i + 1})`));
    expect(categoryColor('#0f766e')).toBe('var(--cat-4)'); // case-insensitive
  });

  it('maps values from the short-lived indigo palette onto a slot', () => {
    expect(categoryKey('#5F5BF0')).toBe('#5B5BD6');
    expect(categoryColor('#D9467A')).toBe('var(--cat-5)');
  });

  it('shows unknown stored values unchanged', () => {
    expect(categoryKey('#123456')).toBeNull();
    expect(categoryColor('#123456')).toBe('#123456');
  });
});
