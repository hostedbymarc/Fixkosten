import { useEffect, useRef, useState } from 'react';
import { BackupError, importIntoEmpty, readBackupFile } from '../db/backup';
import { db } from '../db/db';
import { completeOnboarding } from '../db/onboarding';
import { calendarMonth } from '../lib/activeMonth';
import { COUNTRIES, COUNTRY_FORMAT, COUNTRY_LABEL, countryFromLanguage, type Country } from '../lib/country';
import { FREQUENCY_LABEL } from './Chips';
import { formatEUR, parseAmount, setFormatCountry } from '../lib/format';
import { addPeriods, monthOf, shortMonthName } from '../lib/period';
import { templatesFor, type Template } from '../lib/templates';
import { traceImport } from '../lib/importTrace';
import { ALL_MONTHS } from '../lib/calc';
import { AmountField, SelectField } from './form';
import { InfoTip } from './InfoTip';
import { Brand } from './Logo';

type Step = 'start' | 'country' | 'templates';

interface Draft {
  amountText: string;
  dueMonth: number;
}

/**
 * First start on an empty database: set up anew (country → templates), import a JSON backup,
 * or start empty. A new setup and „Leer starten“ turn the Fixkostenkonto on right away.
 */
export function SetupDialog() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('start');
  const [country, setCountry] = useState<Country>(() => countryFromLanguage(typeof navigator === 'undefined' ? undefined : navigator.languages?.length ? navigator.languages : navigator.language));
  useEffect(() => () => traceImport('setup-dialog-closed'), []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    traceImport('file-chosen', { bytes: file.size });
    setBusy(true);
    setError(null);
    try {
      await importIntoEmpty(db, await readBackupFile(file));
    } catch (err) {
      traceImport('import-failed', { error: String(err) });
      setError(err instanceof BackupError ? err.message : 'Import fehlgeschlagen. Bitte erneut versuchen.');
      console.error(err);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const titles: Record<Step, string> = {
    start: 'Daten importieren',
    country: 'Wo wohnst du?',
    templates: 'Was zahlst du nicht monatlich?',
  };
  // the explanation of each step lives in the ⓘ next to its title
  const infos: Record<Step, string> = {
    start:
      'Deine Fixkosten liegen nur auf diesem Gerät. Wähle eine Sicherung (JSON), um deinen Stand zu übernehmen, richte Erbse neu ein oder starte mit einer leeren App.',
    country: 'Davon hängen Währung und Vorlagen ab. Du kannst das Land später in den Einstellungen ändern.',
    templates: 'Tippe an, was du zahlst, und trag den Betrag ein. Erbse rechnet daraus deinen Dauerauftrag fürs Fixkostenkonto.',
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 pt-safe pb-safe">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        className="glass w-full max-w-md p-6"
        data-testid="setup-dialog"
        data-step={step}
      >
        <Brand />
        {step !== 'start' && (
          <p className="mt-4 text-[13px] font-medium text-ink-mute" data-testid="setup-progress">
            Schritt {step === 'country' ? 1 : 2} von 2
          </p>
        )}
        <div className={`${step === 'start' ? 'mt-4' : 'mt-1'} flex items-center`}>
          <h1 id="setup-title" className="text-[22px] font-semibold tracking-tight text-ink">
            {titles[step]}
          </h1>
          <InfoTip label={`Erklärung: ${titles[step]}`} title={titles[step]} className="-my-3 -ml-1 shrink-0" testId="setup-info">
            <p>{infos[step]}</p>
          </InfoTip>
        </div>

        {step === 'start' && (
          <>
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
                className="focus-ring h-12 rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {busy ? 'Importiere …' : 'Daten importieren'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('country')}
                className="focus-ring h-12 rounded-2xl border border-edge bg-field text-[16px] font-semibold text-ink hover:border-zinc-300 disabled:opacity-50"
                data-testid="setup-new"
              >
                Neu einrichten
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void completeOnboarding(db, { country: null, templates: [], startPeriod: calendarMonth() })}
                className="focus-ring h-12 rounded-2xl text-[16px] font-medium text-ink-soft hover:bg-zinc-100"
              >
                Leer starten
              </button>
            </div>
          </>
        )}

        {step === 'country' && (
          <CountryStep
            country={country}
            onChange={setCountry}
            onBack={() => setStep('start')}
            onNext={() => {
              setFormatCountry(country);
              setStep('templates');
            }}
          />
        )}

        {step === 'templates' && <TemplatesStep country={country} onBack={() => setStep('country')} />}
      </div>
    </div>
  );
}

function CountryStep({ country, onChange, onBack, onNext }: { country: Country; onChange: (c: Country) => void; onBack: () => void; onNext: () => void }) {
  return (
    <>
      <div role="radiogroup" aria-label="Land" className="mt-5 flex flex-col gap-2" data-testid="setup-countries">
        {COUNTRIES.map((c) => {
          const on = c === country;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(c)}
              className={`focus-ring flex min-h-[52px] items-center justify-between rounded-2xl border px-4 text-left text-[16px] ${
                on ? 'border-accent-ink bg-accent-soft font-semibold text-ink' : 'border-edge bg-field font-medium text-ink hover:border-zinc-300'
              }`}
              data-testid={`setup-country-${c}`}
            >
              <span>{COUNTRY_LABEL[c]}</span>
              <span className="text-[14px] text-ink-mute">{COUNTRY_FORMAT[c].currency}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onNext}
          className="focus-ring h-12 rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover"
          data-testid="setup-next"
        >
          Weiter
        </button>
        <button type="button" onClick={onBack} className="focus-ring h-12 rounded-2xl text-[16px] font-medium text-ink-soft hover:bg-zinc-100">
          Zurück
        </button>
      </div>
    </>
  );
}

function TemplatesStep({ country, onBack }: { country: Country; onBack: () => void }) {
  const templates = templatesFor(country);
  const start = calendarMonth();
  const nextMonth = monthOf(addPeriods(start, 1));
  const [chosen, setChosen] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const selected = templates.filter((t) => chosen[t.id]);
  const invalid = selected.some((t) => {
    const a = parseAmount(chosen[t.id]!.amountText);
    return a === null || a <= 0;
  });

  function toggle(t: Template) {
    setChosen((c) => {
      const next = { ...c };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { amountText: '', dueMonth: nextMonth };
      return next;
    });
  }

  async function finish() {
    if (invalid || busy) return;
    setBusy(true);
    try {
      await completeOnboarding(db, {
        country,
        startPeriod: start,
        templates: selected.map((t) => ({ template: t, amount: parseAmount(chosen[t.id]!.amountText)!, dueMonth: chosen[t.id]!.dueMonth })),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="mt-5 flex flex-col gap-2" data-testid="setup-templates">
        {templates.map((t) => {
          const draft = chosen[t.id];
          const amount = draft ? parseAmount(draft.amountText) : null;
          return (
            <li key={t.id} className={`rounded-2xl border ${draft ? 'border-accent-ink bg-accent-soft/60' : 'border-edge bg-field'}`} data-testid="setup-template" data-template={t.id}>
              <button
                type="button"
                aria-pressed={!!draft}
                onClick={() => toggle(t)}
                className="focus-ring flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-4 text-left"
                data-testid="setup-template-toggle"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[14px] font-bold ${
                    draft ? 'border-accent bg-accent text-white' : 'border-edge text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-ink">{t.name}</span>
                  <span className="block text-[13px] text-ink-mute">{FREQUENCY_LABEL[t.frequency]}</span>
                </span>
              </button>
              {draft && (
                <div className="flex flex-col gap-3 px-4 pb-4">
                  <AmountField
                    label={`Betrag ${t.name}`}
                    value={draft.amountText}
                    onChange={(v) => setChosen((c) => ({ ...c, [t.id]: { ...c[t.id]!, amountText: v } }))}
                    placeholder="Betrag"
                    error={draft.amountText.trim() !== '' && (amount === null || amount <= 0) ? 'Bitte einen Betrag größer als 0 eingeben.' : null}
                    hint={amount !== null && amount > 0 ? `${formatEUR(amount)} ${FREQUENCY_LABEL[t.frequency].toLowerCase()}` : 'Pflichtfeld: Erbse trägt keinen Betrag für dich ein.'}
                    testId="setup-template-amount"
                  />
                  <SelectField
                    label="Nächste Fälligkeit"
                    value={String(draft.dueMonth)}
                    onChange={(v) => setChosen((c) => ({ ...c, [t.id]: { ...c[t.id]!, dueMonth: Number(v) } }))}
                    options={ALL_MONTHS.map((m) => ({ value: String(m), label: shortMonthName(m) }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          disabled={invalid || busy}
          onClick={() => void finish()}
          className="focus-ring h-12 rounded-2xl bg-accent text-[16px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          data-testid="setup-finish"
        >
          {selected.length === 0 ? 'Ohne Vorlagen starten' : `Fertig (${selected.length})`}
        </button>
        <button type="button" onClick={onBack} className="focus-ring h-12 rounded-2xl text-[16px] font-medium text-ink-soft hover:bg-zinc-100">
          Zurück
        </button>
      </div>
    </>
  );
}
