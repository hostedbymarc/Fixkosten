import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { NOTE_MAX, saveMonthNote } from '../db/repo';
import { monthName, periodLabel } from '../lib/period';
import type { Period } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { PencilIcon } from './Icons';

/** '1.850' – thousands with a dot like the amounts (de-AT would use a space for plain numbers). */
const count = (n: number) => n.toLocaleString('de-DE');

/** The counter only shows up close to the limit. */
const COUNTER_FROM = 1800;
/** Draft is written this long after the last keystroke: nothing is lost when the app goes to the background. */
const DRAFT_MS = 500;

/** Glass card under the KPI tiles: one note per month. */
export const MonthNoteCard = forwardRef<HTMLButtonElement, { period: Period; note: string | undefined; onOpen: () => void }>(
  function MonthNoteCard({ period, note, onOpen }, ref) {
    const text = useRef<HTMLSpanElement>(null);
    const [clamped, setClamped] = useState(false);
    useLayoutEffect(() => {
      const el = text.current;
      if (!el) return setClamped(false);
      const measure = () => {
        // the tab is hidden (kept for the next visit): the last state holds when shown again
        if (!el.getClientRects().length) return;
        setClamped(el.scrollHeight > el.clientHeight + 1);
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, [note]);

    return (
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={note ? `Notiz ${periodLabel(period)} bearbeiten` : `Notiz für ${monthName(period)} hinzufügen`}
        className="glass glass-tile focus-ring flex min-h-11 w-full items-start gap-3 rounded-tile px-4 py-3 text-left hover:bg-zinc-50/40"
        data-testid="note-card"
      >
        {note ? (
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium leading-4 text-ink-mute lg:text-[13px]">Notiz</span>
            <span
              ref={text}
              className="mt-1 line-clamp-3 whitespace-pre-line break-words text-[15px] leading-snug text-ink"
              data-testid="note-text"
            >
              {note}
            </span>
            {clamped && (
              <span className="mt-0.5 block text-[13px] font-medium text-accent-ink" data-testid="note-more">
                … mehr
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1 self-center text-[15px] text-ink-mute" data-testid="note-empty">
            Notiz für {monthName(period)} hinzufügen
          </span>
        )}
        <span className="flex h-5 shrink-0 items-center text-ink-mute" aria-hidden="true">
          <PencilIcon size={16} />
        </span>
      </button>
    );
  },
);

interface SheetProps {
  period: Period;
  note: string | undefined;
  onClose: () => void;
  /** after „Löschen“: the text that was removed (for the undo toast) */
  onDeleted: (removed: string) => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * „Notiz · Oktober 2026“: bottom sheet on phones and iPad portrait, dialog from 1024 px.
 * Saves on its own: a debounced draft while typing and once more when it closes
 * (Fertig, ×, scrim, Esc) – there is no save button.
 */
export function MonthNoteSheet({ period, note, onClose, onDeleted, returnFocusTo }: SheetProps) {
  const [text, setText] = useState(note ?? '');
  const field = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(text);
  latest.current = text;

  // debounced draft
  useEffect(() => {
    const t = window.setTimeout(() => void saveMonthNote(db, period, text), DRAFT_MS);
    return () => window.clearTimeout(t);
  }, [text, period]);

  // the app goes to the background (iOS may kill it there): write right away
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveMonthNote(db, period, latest.current);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [period]);

  // grows with the text (at least 5 lines)
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  function close() {
    void saveMonthNote(db, period, latest.current).then(onClose);
  }

  function remove() {
    const removed = latest.current;
    latest.current = '';
    setText(''); // drops a pending draft of the old text
    void saveMonthNote(db, period, '').then(() => onDeleted(removed));
  }

  return (
    <BottomSheet title={`Notiz · ${periodLabel(period)}`} onClose={close} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-3" data-testid="note-sheet">
        <label className="sr-only" htmlFor="month-note">
          Notiz für {periodLabel(period)}
        </label>
        <textarea
          id="month-note"
          ref={field}
          rows={5}
          maxLength={NOTE_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="z. B. Bonus, Urlaub, Nachzahlung …"
          className="min-h-[8.5rem] w-full resize-none overflow-hidden rounded-2xl border border-edge bg-field px-4 py-3 text-[16px] leading-snug text-ink outline-none placeholder:text-ink-faint focus:border-accent-ink focus:ring-2 focus:ring-accent-ink/20"
          data-testid="note-field"
        />
        {text.length >= COUNTER_FROM && (
          <p className="-mt-1 text-right text-[13px] text-ink-mute" aria-live="polite" data-testid="note-counter">
            <span className="num">
              {count(text.length)} / {count(NOTE_MAX)}
            </span>
          </p>
        )}
        <div className="flex gap-2">
          {note && (
            <button
              type="button"
              onClick={remove}
              className="focus-ring h-12 flex-1 rounded-2xl bg-over-soft text-[16px] font-semibold text-over"
            >
              Löschen
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="focus-ring h-12 flex-[2] rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover"
          >
            Fertig
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
