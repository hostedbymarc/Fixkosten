// Samples total CPU use (all cores, /proc/stat) every second until killed; prints the mean on SIGTERM.
import { readFileSync } from 'node:fs';

const read = () => {
  const [, ...v] = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/);
  const n = v.map(Number);
  const idle = n[3] + n[4];
  return { idle, total: n.reduce((a, b) => a + b, 0) };
};
let prev = read();
const samples = [];
const timer = setInterval(() => {
  const cur = read();
  samples.push(1 - (cur.idle - prev.idle) / (cur.total - prev.total));
  prev = cur;
}, 1000);
const done = () => {
  clearInterval(timer);
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(JSON.stringify({ seconds: samples.length, meanBusy: +mean.toFixed(3), p50: +sorted[Math.floor(sorted.length / 2)].toFixed(3), p90: +sorted[Math.floor(sorted.length * 0.9)].toFixed(3) }));
  process.exit(0);
};
process.on('SIGTERM', done);
process.on('SIGINT', done);
