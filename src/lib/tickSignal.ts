// A month celebrates live only after a tick by the user (alle-monate-gleich): data that arrives in steps (an
// import, the first load) can show a month as open and then as done – that is no tick and never falls.
// The repo functions that tick or untick a payment count here; the celebration compares the count.
let ticks = 0;

/** a payment was ticked, skipped, restored or a one-off toggled */
export function noteTick(): void {
  ticks += 1;
}

export function tickCount(): number {
  return ticks;
}
