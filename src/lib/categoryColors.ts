// Category colours are stored in the database (and in backups) as the hex strings of the
// original phase-2 palette. Since the Erbse rebrand they are only KEYS: the colour on screen
// comes from the --cat-N tokens in src/styles/tokens.css (light and dark). Never change
// these strings – existing data contains them.

export interface CategorySlot {
  /** stored value (DB key) */
  key: string;
  name: string;
  /** CSS colour shown for this slot */
  color: string;
}

export const CATEGORY_SLOTS: readonly CategorySlot[] = [
  { key: '#2E2E8A', name: 'Nachtblau', color: 'var(--cat-1)' },
  { key: '#5B5BD6', name: 'Blau', color: 'var(--cat-2)' },
  { key: '#9494E8', name: 'Lavendel', color: 'var(--cat-3)' },
  { key: '#0F766E', name: 'Petrol', color: 'var(--cat-4)' },
  { key: '#B08968', name: 'Beere', color: 'var(--cat-5)' },
  { key: '#52525B', name: 'Schiefer', color: 'var(--cat-6)' },
  { key: '#A1A1AA', name: 'Taupe', color: 'var(--cat-7)' },
  { key: '#27272A', name: 'Graphit', color: 'var(--cat-8)' },
];

/** Key of the "Meine Immos" category the v2 migration creates. */
export const IMMOS_COLOR_KEY = CATEGORY_SLOTS[0]!.key;
/** Preselected for a new category. */
export const DEFAULT_COLOR_KEY = CATEGORY_SLOTS[1]!.key;

// values saved with the short-lived indigo palette (Oct 2026) → nearest slot
const ALIASES: Record<string, string> = {
  '#8B4FD8': '#9494E8',
  '#5F5BF0': '#5B5BD6',
  '#3B36B8': '#2E2E8A',
  '#2F7BEA': '#5B5BD6',
  '#0E9AA7': '#0F766E',
  '#1F9D5C': '#0F766E',
  '#C98A0E': '#B08968',
  '#E0662F': '#B08968',
  '#D9467A': '#B08968',
};

function slotFor(stored: string): CategorySlot | undefined {
  const upper = stored.trim().toUpperCase();
  const key = ALIASES[upper] ?? upper;
  return CATEGORY_SLOTS.find((s) => s.key === key);
}

/** The slot key a stored value belongs to (for the picker), or null for unknown values. */
export function categoryKey(stored: string): string | null {
  return slotFor(stored)?.key ?? null;
}

/** CSS colour to paint a category with; unknown stored values are shown as they are. */
export function categoryColor(stored: string): string {
  return slotFor(stored)?.color ?? stored;
}
