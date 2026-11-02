// Width of an amount in the display numerals (src/assets/fonts/inter-display-600-numerals.woff2,
// tabular digits, letter-spacing −0.045em), in em. A large number gets
// `font-size: min(<its clamp>, 100cqi / <this>)` (index.css .fit): long amounts shrink to the
// width of their tile instead of being cut off or ending in an ellipsis. Presentation only.

const WIDE = 0.645; // tabular digits, €, minus (1320 / 2048)
const NARROW = 0.27; // . , and spaces in tabular form (550 / 2048)
const TRACKING = 0.045;

/** Estimated width of `text` in em, with 4 % headroom. */
export function fitEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (/[0-9€−-]/.test(ch)) em += WIDE;
    else if (/[.,\s   ]/.test(ch)) em += NARROW;
    else if (ch === '%') em += 0.91;
    else em += 0.66;
    em -= TRACKING;
  }
  return Math.max(1, em * 1.04);
}

/** Inline style for a `.fit` number: its width in em as `--fit-em`. */
export const fitStyle = (text: string) => ({ '--fit-em': fitEm(text).toFixed(3) }) as React.CSSProperties;
