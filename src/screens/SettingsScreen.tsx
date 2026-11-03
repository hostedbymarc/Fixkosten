import { useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { FEATURE_REMINDERS } from '../lib/features';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Segmented, SelectField, SwitchField } from '../components/form';
import { useKontoState } from '../components/konto/KontoSheet';
import { KontoSetup } from '../components/konto/KontoTile';
import { orderDay } from '../lib/schote';
import { t } from '../lib/schoteTexts';
import { useKonto } from '../db/useKonto';
import { readCountryRaw, writeCountry, writeKonto } from '../db/settings';
import { COUNTRIES, COUNTRY_FORMAT, COUNTRY_LABEL, DEFAULT_COUNTRY, toCountry } from '../lib/country';
import { InfoTip } from '../components/InfoTip';
import { Logo } from '../components/Logo';
import { ImportSheet } from '../components/ImportSheet';
import { useToast } from '../components/Toast';
import { traceImport } from '../lib/importTrace';
import {
  BackupError,
  backupFileName,
  exportBackup,
  importBackup,
  lastImport,
  markExported,
  readBackupFile,
  undoLastImport,
  writeMonthStart,
  type BackupFile,
} from '../db/backup';
import { db } from '../db/db';
import { downloadJson } from '../lib/download';
import { deletePositionPermanently, restorePosition } from '../db/repo';
import { archivedPeriod, archivedPositions, currentPlan, positionUsage } from '../lib/calc';
import { formatDate, formatEUR } from '../lib/format';
import { periodLabel } from '../lib/period';
import { useThemePref, type ThemePref } from '../lib/theme';
import { MONTH_START_CHOICES, monthStartLabel, toMonthStart } from '../lib/activeMonth';
import { useActiveMonth, useMonthStart } from '../lib/useToday';
import { versionLabel } from '../lib/version';
import type { Dataset, Position } from '../lib/types';

function deleteText(usage: { payments: number; oneOffs: number }): string {
  const parts = [];
  if (usage.payments) parts.push(usage.payments === 1 ? '1 Zahlung' : `${usage.payments} Zahlungen`);
  if (usage.oneOffs) parts.push(usage.oneOffs === 1 ? '1 Einmalbetrag' : `${usage.oneOffs} Einmalbeträge`);
  return parts.length ? `Dabei werden auch ${parts.join(' und ')} gelöscht.` : 'Es gibt keine Zahlungen dazu.';
}

export function SettingsScreen({ ds }: { ds: Dataset }) {
  const today = useActiveMonth();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Position | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const archived = archivedPositions(ds);
  const categoryName = (id: string) => ds.categories.find((c) => c.id === id)?.name ?? '';

  return (
    <Screen name="einstellungen" className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8">
      <header className="py-3 lg:py-6">
        <h1 className="flex h-11 items-center text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]">Einstellungen</h1>
      </header>

      <div className="flex max-w-2xl flex-col gap-6">
        <AppearanceSection />
        <MonthSection />
        <KontoSection ds={ds} />
        <CountrySection />

        <section aria-labelledby="archive-title">
          <h2 id="archive-title" className="section-title mb-2 px-1">
            Archiv
          </h2>
          {archived.length === 0 ? (
            <div className="glass px-4 py-5 text-[14px] text-ink-mute">
              Keine archivierten Positionen. Archivieren geht in „Positionen“ per Wischen nach links oder über das ⋯-Menü.
            </div>
          ) : (
            <ul className="glass divide-y divide-line" data-testid="archive-list">
              {archived.map((p) => {
                const plan = currentPlan(p, today)!;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-position={p.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                      <span className="block text-[13px] text-ink-mute">
                        {categoryName(p.categoryId)} · <span className="num">{formatEUR(plan.amount)}</span> · archiviert seit{' '}
                        {periodLabel(archivedPeriod(p)!)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await restorePosition(db, p.id, today);
                          toast({ message: `„${p.name}“ ist ab ${periodLabel(today)} wieder aktiv` });
                        }}
                        className="focus-ring h-11 rounded-xl border border-edge bg-field px-3 text-[14px] font-medium text-ink hover:border-zinc-300"
                      >
                        Wiederherstellen
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          trigger.current = e.currentTarget;
                          setConfirm(p);
                        }}
                        className="focus-ring h-11 rounded-xl px-3 text-[14px] font-medium text-over hover:bg-over-soft"
                      >
                        Löschen
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <BackupSection ds={ds} />

        {FEATURE_REMINDERS && (
          <section aria-labelledby="later-title">
            <h2 id="later-title" className="section-title mb-2 px-1">
              Erinnerungen
            </h2>
            <div className="glass px-4 py-5 text-[14px] text-ink-mute">
              Kommt in Phase 4: Erinnerungen verwalten, CSV-Export, Backup-Erinnerung.
            </div>
          </section>
        )}
      </div>

      <p className="mt-10 text-center text-[12px] text-ink-mute" data-testid="app-version">
        {versionLabel()}
      </p>

      {confirm && (
        <ConfirmSheet
          title={`„${confirm.name}“ endgültig löschen?`}
          confirmLabel="Endgültig löschen"
          returnFocusTo={trigger.current}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const name = confirm.name;
            setConfirm(null);
            await deletePositionPermanently(db, confirm.id);
            toast({ message: `„${name}“ gelöscht` });
          }}
        >
          <p>
            {deleteText(positionUsage(ds, confirm.id))} Das kann nicht rückgängig gemacht werden und fehlt danach auch in
            den Grafiken.
          </p>
        </ConfirmSheet>
      )}
    </Screen>
  );
}

function BackupSection({ ds }: { ds: Dataset }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'), []);
  const last = useLiveQuery(() => lastImport(db), []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPending({ backup: await readBackupFile(file), fileName: file.name });
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function undo() {
    if (await undoLastImport(db)) toast({ message: 'Import rückgängig gemacht' });
  }

  return (
    <section aria-labelledby="backup-title">
      <div className="mb-2 flex items-center px-1">
        <h2 id="backup-title" className="section-title">
          Sicherung
        </h2>
        <InfoTip label="Erklärung: Sicherung" title="Sicherung" className="-my-3 -ml-1.5" testId="backup-info">
          <p>
            Deine Daten liegen nur auf diesem Gerät. Eine Sicherung (JSON) kannst du auf einem anderen Gerät oder nach dem Löschen der Website-Daten wieder
            importieren.
          </p>
        </InfoTip>
      </div>
      <div className="glass flex flex-col gap-3 p-4" data-testid="backup-section">
        <p className="text-[13px] text-ink-mute" data-testid="last-backup">
          {lastBackup ? `Letzte Sicherung: ${formatDate(lastBackup.value as string)}` : 'Noch keine Sicherung exportiert.'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={async () => {
              downloadJson(await exportBackup(db), backupFileName());
              await markExported(db);
              toast({ message: 'Sicherung gespeichert' });
            }}
            className="focus-ring h-11 rounded-xl sm:flex-1 bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover"
          >
            Sicherung exportieren
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="focus-ring h-11 rounded-xl sm:flex-1 border border-edge bg-field px-4 text-[15px] font-medium text-ink hover:border-zinc-300"
          >
            Sicherung importieren
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="backup-file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-over-soft px-3 py-2 text-[14px] text-over">
            {error}
          </p>
        )}
        {last && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px] text-ink-mute">
            <span className="flex-1">
              Letzter Import ({last.mode === 'merge' ? 'zusammengeführt' : 'ersetzt'}) am {formatDate(last.at)}
            </span>
            <button
              type="button"
              onClick={() => void undo()}
              className="focus-ring h-11 rounded-xl px-3 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
            >
              Import rückgängig machen
            </button>
          </div>
        )}
      </div>

      {pending && (
        <ImportSheet
          ds={ds}
          backup={pending.backup}
          fileName={pending.fileName}
          onClose={() => setPending(null)}
          onImport={async (mode) => {
            const backup = pending.backup;
            setPending(null);
            setError(null);
            try {
              await importBackup(db, backup, mode);
            } catch (err) {
              traceImport('import-failed', { error: String(err) });
              setError(err instanceof BackupError ? err.message : 'Import fehlgeschlagen. Es wurde nichts geändert.');
              console.error(err);
              return;
            }
            toast({ message: 'Sicherung importiert', actionLabel: 'Rückgängig', onAction: () => void undo(), durationMs: 8000 });
          }}
        />
      )}
    </section>
  );
}

const THEME_HINT: Record<ThemePref, string> = {
  system: 'Folgt deinem Gerät: hell oder dunkel, je nach Systemeinstellung.',
  light: 'Immer hell, auch wenn dein Gerät dunkel ist.',
  dark: 'Immer dunkel, angenehm am Abend.',
};

/** „Neuer Monat beginnt am“: stored in the database (meta) and carried by backups. */
function MonthSection() {
  const start = useMonthStart();
  const active = useActiveMonth();
  return (
    <section aria-labelledby="month-title">
      <h2 id="month-title" className="section-title mb-2 px-1">
        Monat
      </h2>
      <div className="glass flex flex-col gap-2 p-4" data-testid="month-settings">
        <SelectField
          label="Neuer Monat beginnt am"
          value={String(start)}
          onChange={(v) => void writeMonthStart(db, toMonthStart(v === 'last' ? 'last' : Number(v)))}
          options={MONTH_START_CHOICES.map((c) => ({ value: String(c), label: monthStartLabel(c) }))}
          info="Ab diesem Tag öffnet Erbse schon den Folgemonat, z. B. wenn dein Gehalt am Monatsende kommt."
        />
        <p className="px-1 text-[13px] text-ink-mute" data-testid="active-month">
          Aktiver Monat: <span className="font-semibold text-ink-soft">{periodLabel(active)}</span>
        </p>
      </div>
    </section>
  );
}

/** Light, dark or "System"; stored per device, not in backups. */
function AppearanceSection() {
  const [theme, setTheme] = useThemePref();
  return (
    <section aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="section-title mb-2 px-1">
        Darstellung
      </h2>
      <div className="glass flex flex-col gap-3 p-4" data-testid="appearance">
        <Segmented<ThemePref>
          label="Design"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Hell' },
            { value: 'dark', label: 'Dunkel' },
          ]}
          info={THEME_HINT[theme]}
        />
        <div className="flex items-center gap-3 border-t border-line px-1 pt-3">
          <Logo size={44} />
          <p className="text-[15px] font-semibold text-ink">Erbse wie eine App öffnen</p>
          <InfoTip label="Erklärung: Erbse wie eine App öffnen" title="Erbse wie eine App öffnen" className="-my-3 -ml-2 shrink-0" testId="install-info">
            <p>In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.</p>
          </InfoTip>
        </div>
      </div>
    </section>
  );
}

/**
 * Fixkostenkonto: the switch with a visible sentence for each state; when on, a summary (balance and
 * since when, standing order, rounding) and „Einrichtung ändern“, which opens the setup again.
 */
function KontoSection({ ds }: { ds: Dataset }) {
  const { settings } = useKonto();
  const active = useActiveMonth();
  const start = useMonthStart();
  const state = useKontoState(ds, active);
  const [setup, setSetup] = useState(false);
  const asOf = settings.anchor ? formatDate(settings.anchor.at.slice(0, 10)) : null;
  return (
    <section aria-labelledby="konto-title">
      <h2 id="konto-title" className="section-title mb-2 px-1">
        Fixkostenkonto
      </h2>
      <div className="glass flex flex-col gap-4 p-4" data-testid="konto-settings">
        <SwitchField
          label="Fixkostenkonto verwenden"
          checked={settings.enabled}
          onChange={(v) => void writeKonto(db, { enabled: v, ...(v ? {} : { inviteDismissed: true }) })}
          hint={<span data-testid="konto-enabled-text">{t(settings.enabled ? 'settings.on' : 'settings.off')}</span>}
          info="Erbse rechnet aus, welchen Dauerauftrag dein Fixkostenkonto braucht und ob es jeden Monat reicht. Ohne Banklogin."
          testId="konto-enabled"
        />
        {settings.enabled && (
          <>
            {settings.setupDone && (
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-t border-line pt-3 text-[15px]" data-testid="konto-summary">
                <dt className="text-ink-soft">{t('settings.balance')}</dt>
                <dd className="num text-right font-semibold text-ink" data-testid="konto-summary-balance">
                  {formatEUR(state.balance)}
                </dd>
                {asOf && (
                  <>
                    <dt className="sr-only">Stand</dt>
                    <dd className="col-span-2 -mt-1.5 text-[13px] text-ink-mute" data-testid="konto-summary-asof">
                      {t('settings.asOf', { datum: asOf })}
                    </dd>
                  </>
                )}
                <dt className="text-ink-soft">{t('settings.order')}</dt>
                <dd className="num text-right font-semibold text-ink" data-testid="konto-summary-order">
                  {formatEUR(state.overview.order.amount)} {orderDay(start)}
                </dd>
                <dt className="text-ink-soft">{t('settings.rounding')}</dt>
                <dd className="num text-right text-ink" data-testid="konto-summary-rounding">
                  {formatEUR(settings.rounding)}
                </dd>
              </dl>
            )}
            <button
              type="button"
              onClick={() => setSetup(true)}
              className="focus-ring h-11 self-start rounded-xl px-4 text-[15px] font-semibold text-accent-ink glass-inset bg-surface hover:bg-accent-soft"
              data-testid="konto-setup-edit"
            >
              {settings.setupDone ? t('settings.edit') : t('tile.setup.title')}
            </button>
          </>
        )}
      </div>
      {setup && (
        <KontoSetup
          ds={ds}
          active={active}
          onClose={() => setSetup(false)}
          onDone={() => {
            setSetup(false);
            window.location.hash = '#monat';
          }}
        />
      )}
    </section>
  );
}

/** Land: currency and number format (CH: CHF), templates of the setup. Stored in meta, carried by backups. */
function CountrySection() {
  const stored = useLiveQuery(() => readCountryRaw(db), []);
  const country = stored ?? DEFAULT_COUNTRY;
  return (
    <section aria-labelledby="country-title">
      <h2 id="country-title" className="section-title mb-2 px-1">
        Land
      </h2>
      <div className="glass flex flex-col gap-2 p-4" data-testid="country-settings">
        <SelectField
          label="Land und Währung"
          value={country}
          onChange={(v) => void writeCountry(db, toCountry(v))}
          options={COUNTRIES.map((c) => ({ value: c, label: `${COUNTRY_LABEL[c]} · ${COUNTRY_FORMAT[c].currency}` }))}
          info="Bestimmt Währung und Zahlenformat. Die Beträge selbst bleiben unverändert."
        />
      </div>
    </section>
  );
}
