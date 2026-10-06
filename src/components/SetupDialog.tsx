import { useRef, useState } from 'react';
import { BackupError, importIntoEmpty, readBackupFile, startEmpty } from '../db/backup';
import { db } from '../db/db';
import { LogoMark } from './Logo';

/** First start on an empty database: import a JSON backup or start empty. */
export function SetupDialog() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importIntoEmpty(db, await readBackupFile(file));
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Import fehlgeschlagen. Bitte erneut versuchen.');
      console.error(err);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 pt-safe pb-safe">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        aria-describedby="setup-text"
        className="card w-full max-w-md p-6"
        data-testid="setup-dialog"
      >
        <LogoMark size={48} />
        <h1 id="setup-title" className="mt-4 text-[22px] font-semibold tracking-tight text-ink">
          Daten importieren
        </h1>
        <p id="setup-text" className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Deine Fixkosten liegen nur auf diesem Gerät. Wähle eine Sicherung (JSON), um deinen Stand zu übernehmen, oder
          starte mit einer leeren App.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-over-soft px-3 py-2.5 text-[14px] text-over">
            {error}
          </p>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="focus-ring h-12 rounded-2xl bg-accent btn-gloss text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Importiere …' : 'Daten importieren'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startEmpty(db)}
            className="focus-ring h-12 rounded-2xl text-[16px] font-medium text-ink-soft hover:bg-zinc-100"
          >
            Leer starten
          </button>
        </div>
      </div>
    </div>
  );
}
