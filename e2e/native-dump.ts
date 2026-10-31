import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Operating-system view of the browser processes for the import watchdog (e2e/import-watchdog.ts),
 * e2e only: what CDP cannot see when the whole renderer process stands still (dump of 31.10.2026,
 * docs/diagnose/import-hang/2026-10-31-ipad-landscape/). For every renderer and GPU process
 * (WebKit: web-content, network and – if there is one – GPU process) of the browser this test worker launched:
 * `/proc/<pid>/status`, `/proc/<pid>/wchan`, `/proc/<pid>/task/<tid>/stat` (+ comm and wchan of
 * each thread), the CPU load over CPU_SAMPLE_MS, then the native stacks of all threads through
 * `gdb -p <pid> -batch -ex "thread apply all bt"` (GDB_TIMEOUT_MS). The /proc files come first:
 * they show the state before gdb attaches.
 */

export const CPU_SAMPLE_MS = 5_000;
export const GDB_TIMEOUT_MS = 30_000;
/** more renderers than this are not dumped (a test opens one page) */
const MAX_PER_ROLE = 4;

export type Role = 'renderer' | 'gpu' | 'web-content' | 'network' | 'webkit-gpu';

export interface BrowserProcess {
  pid: number;
  role: Role;
  comm: string;
  cmdline: string;
}

export interface NativeProcessReport {
  pid: number;
  role: Role;
  comm: string;
  dir: string;
  state: string | null;
  wchan: string | null;
  threads: number;
  cpuPercent: number | null;
  gdb: 'ok' | 'timeout' | 'unavailable' | `error: ${string}`;
  /** the first frames of thread 1 (the main thread), for the report at a glance */
  mainThreadTop: string[];
}

const CLK_TCK = 100; // getconf CLK_TCK on Linux x86_64/arm64

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** pid → ppid of every process on the machine */
function parents(): Map<number, number> {
  const map = new Map<number, number>();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const stat = read(`/proc/${name}/stat`);
    if (!stat) continue;
    // comm may contain spaces and parentheses: the fields start after the last ')'
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    map.set(Number(name), Number(fields[1]));
  }
  return map;
}

function descendants(root: number): number[] {
  const ppid = parents();
  const out: number[] = [];
  const queue = [root];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [pid, parent] of ppid) {
      if (parent === p) {
        out.push(pid);
        queue.push(pid);
      }
    }
  }
  return out;
}

function classify(comm: string, cmdline: string): Role | null {
  if (/--type=renderer\b/.test(cmdline)) return 'renderer';
  if (/--type=gpu-process\b/.test(cmdline)) return 'gpu';
  // Playwright's WebKit on Linux is the WPE port (WPEWebProcess …); the GTK port names them WebKit…
  if (/^(WPE|WebKit)WebProces/.test(comm) || /\/(WPE|WebKit)WebProcess\b/.test(cmdline)) return 'web-content';
  if (/^(WPE|WebKit)NetworkPr/.test(comm) || /\/(WPE|WebKit)NetworkProcess\b/.test(cmdline)) return 'network';
  if (/^(WPE|WebKit)GPUProces/.test(comm) || /\/(WPE|WebKit)GPUProcess\b/.test(cmdline)) return 'webkit-gpu';
  return null;
}

/** The renderer/GPU (Chromium) and web-content/network/GPU (WebKit) processes below `root`. */
export function browserProcesses(root = process.pid): BrowserProcess[] {
  const found: BrowserProcess[] = [];
  for (const pid of descendants(root)) {
    const comm = (read(`/proc/${pid}/comm`) ?? '').trim();
    const cmdline = (read(`/proc/${pid}/cmdline`) ?? '').split('\0').join(' ').trim();
    const role = classify(comm, cmdline);
    if (role) found.push({ pid, role, comm, cmdline });
  }
  const perRole = new Map<Role, number>();
  return found.filter((p) => {
    const n = (perRole.get(p.role) ?? 0) + 1;
    perRole.set(p.role, n);
    return n <= MAX_PER_ROLE;
  });
}

function cpuTicks(pid: number): number | null {
  const stat = read(`/proc/${pid}/stat`);
  if (!stat) return null;
  const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  // utime, stime are fields 14 and 15 of stat (index 11, 12 after pid and comm)
  return Number(f[11]) + Number(f[12]);
}

function tasks(pid: number): string {
  let tids: string[] = [];
  try {
    tids = readdirSync(`/proc/${pid}/task`).sort((a, b) => Number(a) - Number(b));
  } catch {
    return '';
  }
  return tids
    .map((tid) => {
      const base = `/proc/${pid}/task/${tid}`;
      const stat = (read(`${base}/stat`) ?? '').trim();
      const wchan = (read(`${base}/wchan`) ?? '').trim() || '0';
      return `${stat}\n  wchan=${wchan}`;
    })
    .join('\n');
}

let gdbAvailable: boolean | undefined;
function hasGdb(): Promise<boolean> {
  if (gdbAvailable !== undefined) return Promise.resolve(gdbAvailable);
  return new Promise((resolve) =>
    execFile('gdb', ['--version'], (err) => {
      gdbAvailable = !err;
      resolve(gdbAvailable);
    }),
  );
}

function gdbBacktrace(pid: number): Promise<{ result: NativeProcessReport['gdb']; output: string }> {
  return new Promise((resolve) => {
    execFile(
      'gdb',
      ['-p', String(pid), '-batch', '-nx', '-ex', 'set pagination off', '-ex', 'thread apply all bt'],
      { timeout: GDB_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const output = `${stdout}\n--- stderr ---\n${stderr}`;
        if (err && (err as { killed?: boolean }).killed) resolve({ result: 'timeout', output });
        else if (err && !stdout) resolve({ result: `error: ${err.message.split('\n')[0]}`, output });
        else resolve({ result: 'ok', output });
      },
    );
  });
}

function mainThreadTop(gdb: string): string[] {
  // gdb prints the threads from the highest number down; thread 1 is the main thread
  const block = /\nThread 1 \([^\n]*\n([\s\S]*?)(?:\n\nThread |\n\[Inferior|\n--- stderr|$)/.exec(`\n${gdb}`)?.[1] ?? '';
  return block
    .split('\n')
    .filter((l) => l.startsWith('#'))
    .slice(0, 8)
    .map((l) => l.replace(/\s+/g, ' ').trim());
}

async function dumpOne(p: BrowserProcess, dir: string): Promise<NativeProcessReport> {
  const out = join(dir, `${p.role}-${p.pid}`);
  mkdirSync(out, { recursive: true });
  // (1) state before anything touches the process
  const status = read(`/proc/${p.pid}/status`);
  const wchan = read(`/proc/${p.pid}/wchan`);
  const taskStats = tasks(p.pid);
  writeFileSync(join(out, 'cmdline.txt'), p.cmdline);
  writeFileSync(join(out, 'status.txt'), status ?? '(gone)');
  writeFileSync(join(out, 'wchan.txt'), wchan ?? '(gone)');
  writeFileSync(join(out, 'task-stat.txt'), taskStats);
  // (2) CPU over CPU_SAMPLE_MS
  const t0 = cpuTicks(p.pid);
  const started = Date.now();
  await new Promise((r) => setTimeout(r, CPU_SAMPLE_MS));
  const t1 = cpuTicks(p.pid);
  const seconds = (Date.now() - started) / 1000;
  const cpuPercent = t0 === null || t1 === null ? null : Math.round(((t1 - t0) / CLK_TCK / seconds) * 1000) / 10;
  writeFileSync(join(out, 'cpu.json'), JSON.stringify({ ticksBefore: t0, ticksAfter: t1, seconds, clkTck: CLK_TCK, cpuPercent }, null, 2));
  // (3) native stacks of all threads
  let gdb: NativeProcessReport['gdb'] = 'unavailable';
  let top: string[] = [];
  if (await hasGdb()) {
    const bt = await gdbBacktrace(p.pid);
    gdb = bt.result;
    top = mainThreadTop(bt.output);
    writeFileSync(join(out, 'gdb-bt.txt'), bt.output);
  }
  return {
    pid: p.pid,
    role: p.role,
    comm: p.comm,
    dir: out,
    state: /^State:\s*(.+)$/m.exec(status ?? '')?.[1]?.trim() ?? null,
    wchan: wchan?.trim() || null,
    threads: taskStats ? taskStats.split('\n').filter((l) => !l.startsWith('  ')).length : 0,
    cpuPercent,
    gdb,
    mainThreadTop: top,
  };
}

/** Dumps every renderer/GPU process (all in parallel) into `<dir>/native/`. */
export async function nativeDump(dir: string, root = process.pid): Promise<NativeProcessReport[] | { error: string }> {
  if (process.platform !== 'linux') return { error: `not on linux (${process.platform})` };
  const procs = browserProcesses(root);
  const base = join(dir, 'native');
  mkdirSync(base, { recursive: true });
  const reports = await Promise.all(procs.map((p) => dumpOne(p, base)));
  writeFileSync(join(base, 'summary.json'), JSON.stringify(reports, null, 2));
  return reports;
}

/**
 * Copies a hang's dump to `<docsDir>/<date>-<project>/` (a running number when it exists): the
 * Chromium trace gzipped, everything else as it is. Returns the folder.
 */
export function copyToDocs(hangDir: string, docsDir: string, project: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  let target = join(docsDir, `${day}-${project}`);
  for (let n = 2; existsSync(target); n++) target = join(docsDir, `${day}-${project}-${n}`);
  mkdirSync(target, { recursive: true });
  cpSync(hangDir, target, {
    recursive: true,
    filter: (src) => !src.endsWith('chromium-trace.json'),
  });
  const trace = join(hangDir, 'chromium-trace.json');
  if (existsSync(trace)) writeFileSync(join(target, 'chromium-trace.json.gz'), gzipSync(readFileSync(trace)));
  return target;
}
