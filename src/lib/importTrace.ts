/**
 * Step log of the import, for the import-hang harness (e2e-harness/). Compiled in only when the
 * build runs with ERBSE_IMPORT_TRACE=1 (vite.config.ts); in every other build `__IMPORT_TRACE__`
 * is false and the bundler drops the calls.
 */
declare const __IMPORT_TRACE__: boolean;

// the e2e helpers load app modules in Node, where nothing defines it
export const IMPORT_TRACE: boolean = typeof __IMPORT_TRACE__ !== 'undefined' && __IMPORT_TRACE__;

interface TraceEntry {
  step: string;
  t: number;
  detail?: unknown;
}

export function traceImport(step: string, detail?: unknown): void {
  if (!IMPORT_TRACE) return;
  const w = window as unknown as { __importTrace?: TraceEntry[] };
  (w.__importTrace ??= []).push({ step, t: Math.round(performance.now()), detail });
  // the harness reads these lines in the test process, so they survive a frozen page
  console.debug(`[import-trace] ${step}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
}

/** Harness only: the database handle for the state dump. */
export function exposeForTrace(name: string, value: unknown): void {
  if (!IMPORT_TRACE) return;
  (window as unknown as Record<string, unknown>)[name] = value;
}
