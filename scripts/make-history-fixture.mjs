// Generates tests/fixtures/history-24m.json: 24 months (Nov 2024 – Okt 2026) of
// synthetic history on top of the seed positions, for tests and screenshots only.
// Deterministic (no randomness). Run: node scripts/make-history-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('../tests/fixtures/seed.json', import.meta.url), 'utf8'));
const START = '2024-11';
const TODAY = '2026-10';
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const addPeriods = (p, n) => {
  const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const periods = [];
for (let p = START; p <= TODAY; p = addPeriods(p, 1)) periods.push(p);
const round = (v) => Math.round(v * 100) / 100;

// amount steps per position: [validFrom, amount]; the last one equals the seed amount
const STEPS = {
  'pos-bk-1220': [[START, 155], ['2025-07', 169]],
  'pos-miete': [[START, 950], ['2025-03', 980], ['2026-01', 1008]],
  'pos-strom': [[START, 58], ['2025-12', 64]],
  'pos-handy': [[START, 15], ['2025-04', 10]],
  'pos-lebensmittel': [[START, 450], ['2025-09', 480]],
  'pos-gym': [[START, 32], ['2026-01', 35]],
  'pos-spotify': [[START, 10], ['2025-06', 11]],
  'pos-claude': [['2025-04', 22]],
  'pos-offi': [[START, 590], ['2026-02', 686]],
  'pos-tr-sparplaene': [[START, 300], ['2025-10', 400]],
};

const changeLog = [];
const positions = seed.data.positions.map((old) => {
  const frequency = old.frequency;
  const dueMonths = frequency === 'monthly' ? [...ALL] : [...old.dueMonths];
  const steps = STEPS[old.id] ?? [[START, old.amountHistory.at(-1).amount]];
  const history = steps.map(([validFrom, amount]) => {
    const plan = { validFrom, amount, frequency, dueMonths: [...dueMonths] };
    if (old.dueDay !== undefined) plan.dueDay = old.dueDay;
    return plan;
  });
  history.forEach((entry, i) => {
    const at = `${entry.validFrom}-01T09:00:00.000Z`;
    if (i === 0) changeLog.push({ id: `log-${old.id}-created`, at, positionId: old.id, type: 'created', validFrom: entry.validFrom, to: entry });
    else changeLog.push({ id: `log-${old.id}-${entry.validFrom}`, at, positionId: old.id, type: 'amount', validFrom: entry.validFrom, from: history[i - 1], to: entry });
  });
  const p = { id: old.id, name: old.name, categoryId: old.categoryId, history, createdAt: `${history[0].validFrom}-01T09:00:00.000Z`, sortOrder: old.sortOrder };
  if (old.note) p.note = old.note;
  return p;
});

// a subscription that was cancelled (archived from Sep 2025)
positions.push({
  id: 'pos-netflix',
  name: 'Netflix',
  categoryId: 'cat-abos',
  history: [{ validFrom: START, amount: 13, frequency: 'monthly', dueMonths: [...ALL] }],
  createdAt: `${START}-01T09:00:00.000Z`,
  archivedAt: '2025-09-10T09:00:00.000Z',
  sortOrder: 23,
});
changeLog.push({ id: 'log-pos-netflix-archived', at: '2025-09-10T09:00:00.000Z', positionId: 'pos-netflix', type: 'archived' });
// typo correction of the first Strom entry – must never show up as an optimisation
changeLog.push({
  id: 'log-pos-strom-typo',
  at: '2024-11-03T09:00:00.000Z',
  positionId: 'pos-strom',
  type: 'corrected',
  validFrom: START,
  from: { ...positions.find((p) => p.id === 'pos-strom').history[0], amount: 85 },
  to: positions.find((p) => p.id === 'pos-strom').history[0],
});

function planFor(position, period) {
  let match = null;
  for (const e of position.history) if (e.validFrom <= period && (!match || e.validFrom > match.validFrom)) match = e;
  return match;
}
function due(position, period) {
  const plan = planFor(position, period);
  if (!plan) return null;
  if (position.archivedAt && period >= position.archivedAt.slice(0, 7)) return null;
  return plan.dueMonths.includes(Number(period.slice(5, 7))) ? plan : null;
}

// deterministic deviations
const deviation = {
  'pos-strom': (i) => round((((i * 7) % 11) - 5) * 1.1),
  'pos-lebensmittel': (i) => round((((i * 13) % 9) - 4) * 9.5),
};
const overrides = { 'pos-steuerberater/2025-02': 1195, 'pos-steuerberater/2026-02': 1340, 'pos-amex-gebuehr/2025-10': 690, 'pos-strom/2026-10': 71.4 };
const skipped = new Set(['pos-gym/2025-08']);
const openInRunningMonth = new Set(['pos-depotentgelt', 'pos-lebensmittel', 'pos-tr-sparplaene']);

const payments = [];
periods.forEach((period, i) => {
  for (const position of positions) {
    const plan = due(position, period);
    if (!plan) continue;
    if (period === TODAY && openInRunningMonth.has(position.id)) continue;
    const key = `${position.id}/${period}`;
    const actual = overrides[key] ?? round(plan.amount + (deviation[position.id]?.(i) ?? 0));
    const day = String(Math.min(plan.dueDay ?? 1, 28)).padStart(2, '0');
    payments.push({
      id: `pay-${position.id}-${period}`,
      positionId: position.id,
      period,
      status: skipped.has(key) ? 'skipped' : 'paid',
      plannedAmount: plan.amount,
      actualAmount: skipped.has(key) ? 0 : actual,
      paidAt: `${period}-${day}T08:00:00.000Z`,
    });
  }
});

const oneOffs = [
  { id: 'oo-strom-2024-11', positionId: 'pos-strom', period: '2024-11', amount: -45, label: 'Gutschrift Jahresabrechnung', paidAt: '2024-11-20T08:00:00.000Z' },
  { id: 'oo-strom-2025-11', positionId: 'pos-strom', period: '2025-11', amount: 120, label: 'Nachzahlung Jahresabrechnung', paidAt: '2025-11-20T08:00:00.000Z' },
  { id: 'oo-bk-1220-2025-06', positionId: 'pos-bk-1220', period: '2025-06', amount: 210.5, label: 'Nachzahlung Betriebskosten', paidAt: '2025-06-25T08:00:00.000Z' },
];

// month closes: salary 4.800 → 5.000, a few months left out (gaps)
const missingClose = new Set(['2025-05', '2026-02', '2026-10']);
const monthClose = periods
  .filter((p) => !missingClose.has(p))
  .map((period, i) => {
    const netSalary = period >= '2026-01' ? 5000 : period >= '2025-07' ? 4900 : 4800;
    // what is left after all ticks of the month (= calc.freeCalculated), minus a varying leak
    const spent = payments.filter((x) => x.period === period && x.status === 'paid').reduce((a, x) => a + x.actualAmount, 0);
    const extra = oneOffs.filter((o) => o.period === period).reduce((a, o) => a + o.amount, 0);
    const freeActual = round(netSalary - spent - extra - 40 - ((i * 53) % 230) + 60);
    return { period, netSalary, freeActual, updatedAt: `${addPeriods(period, 1)}-01T18:00:00.000Z` };
  });

const file = {
  format: 'fixkosten-backup',
  schemaVersion: 3,
  exportedAt: '2026-10-05T10:00:00.000Z',
  data: { categories: seed.data.categories, positions, payments, oneOffs, monthClose, changeLog, reminders: seed.data.reminders },
};
writeFileSync(new URL('../tests/fixtures/history-24m.json', import.meta.url), `${JSON.stringify(file, null, 1)}\n`);
console.log(`history-24m.json: ${positions.length} positions, ${payments.length} payments, ${monthClose.length} month closes, ${changeLog.length} log entries`);
