// polster-ziel: the Polster in cents – months of fixed costs, the rule (all / share) with its cap at the goal, the
// gap from the Polster, „Ab € X Gehalt“, the projection of „Dein Plan“, the salary for the goal and the stages.
// Invented numbers only.
import { describe, expect, it } from 'vitest';
import type { PlanRow } from './monthCard';
import type { MonthPlan } from './monthPlan';
import {
  cushionCover,
  cushionDelta,
  cushionMessage,
  cushionPercent,
  distribution,
  fixedAverage,
  goalSalary,
  monthsCovered,
  newStages,
  nextStage,
  projectCushion,
  salaryWithoutCushion,
  type Cushion,
} from './polster';

const C = (goal: number | null, balance: number | null, rule: 'all' | 'share' = 'all', share = 50): Cushion => ({
  goal: goal === null ? null : goal * 100,
  balance: balance === null ? null : balance * 100,
  rule,
  share,
  confirmed: {},
  milestones: [],
});
const months = ['2026-12', '2027-01', '2027-02', '2027-03'];
const rowsOf = (lefts: (number | null)[], estimatedFrom = 99): PlanRow[] =>
  lefts.map((left, i) => ({ period: months[i]!, estimated: i >= estimatedFrom, transfer: 0, before: left, left, spielgeld: 0 }));
const planOf = (fixed: [number, number][], spielgeld: number | null, salary = 4000): MonthPlan =>
  ({
    months: fixed.map(([bills, direct], i) => ({ period: months[i % 4], bills, direct, salary })),
    spielgeld,
  }) as unknown as MonthPlan;

describe('Monate Fixkosten (Ø 12 Monate, abgerundet)', () => {
  it('Ø Fixkosten = alle Fixkosten der 12 Monate ÷ 12, große Zahlungen eingerechnet', () => {
    const plan = planOf([...Array(11).fill([3000, 200]), [3000 + 2400, 200]] as [number, number][], 1200);
    expect(fixedAverage(plan)).toBe(340000);
  });
  it('eine Nachkommastelle, abgerundet: 14.000 ÷ 3.425 = 4,08 → 4,0', () => {
    expect(monthsCovered(1400000, 342500)).toBe(4);
    expect(monthsCovered(2000000, 342500)).toBe(5.8);
    expect(monthsCovered(1400000, 0)).toBeNull();
  });
  it('mit Spielgeld und „Am Ziel“', () => {
    const plan = planOf(Array(12).fill([3225, 200]) as [number, number][], 1200);
    const cover = cushionCover(plan, 1400000, 2000000);
    expect(cover).toMatchObject({ fixed: 342500, spielgeld: 120000, months: 4, monthsWithSpielgeld: 3, atGoal: 5.8, atGoalWithSpielgeld: 4.3 });
  });
});

describe('Regel: alles / fester Anteil, Deckel beim Ziel', () => {
  it('alles in den Polster, höchstens bis zum Ziel', () => {
    expect(cushionDelta(250000, 700000, C(10000, null))).toBe(250000);
    expect(cushionDelta(500000, 700000, C(10000, null))).toBe(300000);
    expect(cushionDelta(100000, 1000000, C(10000, null))).toBe(0);
  });
  it('fester Anteil 50 %: abgerundet auf den Cent, höchstens bis zum Ziel', () => {
    expect(cushionDelta(250001, 700000, C(10000, null, 'share', 50))).toBe(125000);
    expect(cushionDelta(800000, 700000, C(10000, null, 'share', 50))).toBe(300000);
  });
  it('ohne Ziel: kein Deckel', () => {
    expect(cushionDelta(250000, 700000, C(null, null))).toBe(250000);
  });
});

describe('Lücke aus dem Polster, nie unter 0', () => {
  it('die ganze Lücke, solange der Polster reicht', () => {
    expect(cushionDelta(-90000, 700000, C(10000, null))).toBe(-90000);
  });
  it('höchstens was im Polster ist', () => {
    expect(cushionDelta(-90000, 50000, C(10000, null))).toBe(-50000);
    expect(cushionDelta(-90000, 0, C(10000, null))).toBe(-0);
  });
  it('Block der grünen Karte: take = min(Lücke, Stand)', () => {
    expect(distribution(-187067, C(20000, 14000))).toEqual({ kind: 'take', amount: 187067, before: 1400000, after: 1212933 });
    expect(distribution(-187067, C(20000, 1000))).toEqual({ kind: 'take', amount: 100000, before: 100000, after: 0 });
    expect(distribution(-187067, C(20000, 0))).toBeNull();
  });
  it('„Ab € X Gehalt brauchst du den Polster nicht“: Netto + Lücke, auf ganze Euro aufgerundet', () => {
    expect(salaryWithoutCushion(400000, -187067)).toBe(587100);
  });
});

describe('Block „So verteilst du den Überschuss“', () => {
  it('Überschuss > 0, Ziel offen: in den Polster laut Regel, Rest frei', () => {
    expect(distribution(457800, C(20000, 14000))).toEqual({ kind: 'fill', amount: 457800, free: 0, before: 1400000, after: 1857800 });
    expect(distribution(457800, C(20000, 14000, 'share', 50))).toEqual({ kind: 'fill', amount: 228900, free: 228900, before: 1400000, after: 1628900 });
  });
  it('höchstens bis zum Ziel; „Anders aufteilen“ bleibt zwischen 0 und Platz', () => {
    expect(distribution(800000, C(20000, 14000))).toMatchObject({ amount: 600000, free: 200000, after: 2000000 });
    expect(distribution(457800, C(20000, 14000), 100000)).toMatchObject({ amount: 100000, free: 357800 });
    expect(distribution(457800, C(20000, 14000), 999999)).toMatchObject({ amount: 457800, free: 0 });
    expect(distribution(457800, C(20000, 14000), -5)).toMatchObject({ amount: 0 });
  });
  it('Ziel erreicht: „Polster voll“; ohne Ziel kein Block', () => {
    expect(distribution(457800, C(20000, 20000))).toEqual({ kind: 'full' });
    expect(distribution(457800, C(null, 14000))).toBeNull();
  });
});

describe('Prozent und Etappen', () => {
  it('Prozent abgerundet, nächste Etappe', () => {
    expect(cushionPercent(1857800, 2000000)).toBe(92);
    expect(cushionPercent(1400000, null)).toBeNull();
    expect(nextStage(70)).toBe(75);
    expect(nextStage(75)).toBe(100);
    expect(nextStage(100)).toBeNull();
  });
  it('überschrittene Etappen, jede nur einmal', () => {
    expect(newStages(1400000, 1857800, 2000000, [])).toEqual([75]);
    expect(newStages(1400000, 2000000, 2000000, [])).toEqual([75, 100]);
    expect(newStages(1400000, 1857800, 2000000, [75])).toEqual([]);
    expect(newStages(1857800, 1400000, 2000000, [])).toEqual([]);
  });
});

describe('Golden Test: Ziel 10.000, Stand 7.000, Monate +2.500 / −900 / +1.000', () => {
  const rows = rowsOf([2500, -900, 1000]);
  it('Regel „alles“: +2.500 → 9.500, −900 → 8.600, +1.000 (Deckel 1.400) → 9.600', () => {
    const proj = projectCushion(rows, C(10000, 7000));
    expect(proj.map((r) => [r.delta / 100, r.balance / 100])).toEqual([
      [2500, 9500],
      [-900, 8600],
      [1000, 9600],
    ]);
    expect(cushionMessage(proj, C(10000, 7000))).toEqual({ goal: { kind: 'missing', period: '2027-02', amount: 40000 }, drop: { period: '2027-01' } });
  });
  it('Regel „fester Anteil 50 %“: +1.250 → 8.250, −900 → 7.350, +500 → 7.850', () => {
    const proj = projectCushion(rows, C(10000, 7000, 'share', 50));
    expect(proj.map((r) => [r.delta / 100, r.balance / 100])).toEqual([
      [1250, 8250],
      [-900, 7350],
      [500, 7850],
    ]);
  });
  it('bestätigte Monate stecken schon im Stand: ± 0', () => {
    const proj = projectCushion(rows, { ...C(10000, 9500), confirmed: { '2026-12': 250000 } });
    expect(proj.map((r) => r.balance / 100)).toEqual([9500, 8600, 9600]);
  });
  it('Ziel erreicht: „Ziel im {Monat} erreicht“', () => {
    const proj = projectCushion(rowsOf([2500, 600, 1000]), C(10000, 7000));
    expect(cushionMessage(proj, C(10000, 7000)).goal).toEqual({ kind: 'reached', period: '2027-01' });
  });
});

describe('Mindestgehalt fürs Ziel', () => {
  it('erstes geplantes Gehalt: Netto + (fehlt − Überschuss), auf ganze Euro aufgerundet', () => {
    // Dezember bekannt (+4.578), Jänner geplant (−1.870,67): Ziel 20.000, Stand 14.000
    const rows = rowsOf([4578, -1870.67], 1);
    const c = C(20000, 14000);
    const proj = projectCushion(rows, c);
    expect(goalSalary(rows, proj, planOf([[0, 0], [0, 0]], null, 4000), c)).toEqual({ period: '2027-01', amount: 729300 });
  });
  it('fester Anteil 50 %: der Überschuss muss fehlt ÷ 50 % sein', () => {
    const rows = rowsOf([0, 500], 1);
    const c = C(10000, 9000, 'share', 50);
    const proj = projectCushion(rows, c);
    // fehlt 1.000 → Überschuss 2.000 nötig, da sind 500 → + 1.500
    expect(goalSalary(rows, proj, planOf([[0, 0], [0, 0]], null, 4000), c)).toEqual({ period: '2027-01', amount: 550000 });
  });
  it('Ziel ohnehin erreicht oder kein geplanter Monat: keine Box', () => {
    const rows = rowsOf([0, 5000], 1);
    expect(goalSalary(rows, projectCushion(rows, C(10000, 9000)), planOf([[0, 0], [0, 0]], null), C(10000, 9000))).toBeNull();
    const known = rowsOf([0, -500]);
    expect(goalSalary(known, projectCushion(known, C(10000, 9000)), planOf([[0, 0], [0, 0]], null), C(10000, 9000))).toBeNull();
  });
});
