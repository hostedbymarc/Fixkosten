// Einheitliche Ladeanimation: all four tabs come in through the same component (src/components/Screen.tsx),
// which plays the one entrance (src/lib/entrance.ts). No screen has an entrance of its own, no spinner.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCREENS = {
  monat: 'src/screens/MonthScreen.tsx',
  positionen: 'src/screens/PositionsScreen.tsx',
  analyse: 'src/screens/AnalyseScreen.tsx',
  einstellungen: 'src/screens/SettingsScreen.tsx',
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const source = files('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f));

describe('Einheitliche Ladeanimation (grep)', () => {
  it.each(Object.entries(SCREENS))('%s: Wurzel ist <Screen name="…">', (route, file) => {
    const s = readFileSync(file, 'utf8');
    expect(s).toContain("import { Screen } from '../components/Screen';");
    expect(s).toMatch(new RegExp(`<Screen\\s+name="${route}"`));
    expect(s).not.toMatch(/playEntrance|\.animate\(/);
  });

  it('playEntrance nur in entrance.ts und Screen.tsx', () => {
    const users = source.filter((f) => readFileSync(f, 'utf8').includes('playEntrance'));
    expect(users.sort()).toEqual(['src/components/Screen.tsx', 'src/lib/entrance.ts']);
  });

  it('Tabwechsel: keine eigene Einflug-Animation – nur Ausblenden des alten Inhalts, der neue kommt über Screen/playEntrance', () => {
    const t = readFileSync('src/lib/tabTransition.ts', 'utf8');
    // exactly one animation there: the old screen's fade (opacity only)
    expect(t.match(/\.animate\(/g)).toHaveLength(1);
    expect(t).toMatch(/\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/);
    expect(t).not.toMatch(/transform|translate|startViewTransition/);
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).not.toMatch(/view-transition|@keyframes tab-(in|out)|--tab-from/);
    // the card keyframes exist once, in entrance.ts
    const rising = source.filter((f) => /translateY\(14px\)/.test(readFileSync(f, 'utf8')));
    expect(rising).toEqual(['src/lib/entrance.ts']);
  });

  it('kein Spinner: keine Lade-Erbsen mehr in der App', () => {
    expect(source.filter((f) => /anim-pea|<Loader\b/.test(readFileSync(f, 'utf8')))).toEqual([]);
    expect(readFileSync('src/index.css', 'utf8')).not.toMatch(/\.anim-pea|pea-pulse/);
  });
});
