// polster-loeschen-rueckfrage: an emptied field asks first (UI, see e2e/polster-loeschen-rueckfrage.spec.ts);
// „Löschen“ of the Stand removes the Polster, its moves and the months confirmed, so a new Stand can be saved again.
// A backup from before polster-feinschliff (a Polster with a month confirmed, no cushionMoves) imports with the same
// Stand, the history „Stand eingetragen“ + the month, and the invariant kept. Invented data only.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { exportBackup, importIntoEmpty, parseBackup } from './backup';
import { FixkostenDB } from './db';
import { addCushionMove, confirmCushion, setCushionBalance, setCushionGoal } from './kontoActions';
import { cushionBroken, KONTO_KEY, readKonto } from './settings';

const opened: FixkostenDB[] = [];
function newDb(): FixkostenDB {
  const db = new FixkostenDB(`polster-loeschen-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const DAY = new Date(2026, 10, 24);
const LATER = new Date(2026, 10, 26);
const P = '2026-12';
const sum = (moves: { amount: number }[]) => moves.reduce((a, m) => a + m.amount, 0);

describe('„Löschen“ nach leerem „Aktueller Stand“', () => {
  it('entfernt Polster, Verlauf und bestätigte Monate; ein neuer Stand lässt sich danach speichern', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P, 300000, DAY, 300000);
    await setCushionBalance(db, null, LATER);
    const s = await readKonto(db);
    expect(s).toMatchObject({ cushionBalance: null, cushionMoves: [], cushionConfirmed: {}, cushionSurplus: {}, cushionGoal: 2000000 });
    expect(cushionBroken(s)).toBeNull();
    // without the reset the month confirmed would block every new Stand (no move of its own)
    await setCushionBalance(db, 500000, LATER);
    const again = await readKonto(db);
    expect(again.cushionMoves).toEqual([{ id: 'start', date: '2026-11-26', amount: 500000, source: 'start' }]);
    expect(cushionBroken(again)).toBeNull();
  });
  it('leeres „Polster-Ziel“ + „Löschen“: nur das Ziel geht, Stand und Verlauf bleiben', async () => {
    const db = newDb();
    await setCushionGoal(db, 2000000);
    await setCushionBalance(db, 1400000, DAY);
    await confirmCushion(db, P, 300000, DAY, 300000);
    const before = await readKonto(db);
    await setCushionGoal(db, null);
    const s = await readKonto(db);
    expect(s.cushionGoal).toBeNull();
    expect([s.cushionBalance, s.cushionMoves, s.cushionConfirmed]).toEqual([before.cushionBalance, before.cushionMoves, before.cushionConfirmed]);
  });
});

describe('Sicherung aus der Zeit vor polster-feinschliff (#61)', () => {
  it('Polster mit bestätigtem Monat, ohne cushionMoves: Stand gleich, Verlauf = Stand eingetragen + Monat, Invariante erfüllt', async () => {
    const source = newDb();
    const file = JSON.parse(JSON.stringify(await exportBackup(source))) as { settings?: Record<string, unknown> };
    // the Polster as polster-ziel (#60) stored it: Stand, date, goal, rule, stages, the month confirmed – no moves
    file.settings = {
      ...(file.settings ?? {}),
      fixkostenkonto: {
        enabled: true,
        cushionGoal: 2000000,
        cushionBalance: 1700000,
        cushionBalanceDate: '2026-11-20',
        cushionRule: 'all',
        cushionShare: 50,
        cushionMilestones: [75],
        cushionConfirmed: { [P]: 300000 },
      },
    };
    const db = newDb();
    await importIntoEmpty(db, parseBackup(file));
    const s = await readKonto(db);
    expect(s.cushionBalance).toBe(1700000);
    expect(s.cushionMoves).toEqual([
      { id: 'start', date: '2026-11-20', amount: 1400000, source: 'start' },
      { id: `m-${P}`, date: '2026-11-20', amount: 300000, source: 'split' },
    ]);
    expect(sum(s.cushionMoves)).toBe(s.cushionBalance);
    expect(s.cushionConfirmed).toEqual({ [P]: 300000 });
    expect(cushionBroken(s)).toBeNull();
    // the next write keeps it: the repaired moves are stored, the Stand stays the sum
    await addCushionMove(db, 20000, 'Bonus', LATER);
    const stored = (await db.meta.get(KONTO_KEY))!.value as { cushionBalance: number; cushionMoves: { id: string; amount: number }[] };
    expect(stored.cushionMoves.map((m) => m.id).slice(0, 2)).toEqual(['start', `m-${P}`]);
    expect([stored.cushionBalance, sum(stored.cushionMoves)]).toEqual([1720000, 1720000]);
    expect(cushionBroken(await readKonto(db))).toBeNull();
  });
});
