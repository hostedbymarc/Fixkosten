import { useState } from 'react';
import { backupFileName, exportBackup, summarize, type BackupFile, type BackupSummary, type ImportMode } from '../db/backup';
import { db } from '../db/db';
import { downloadJson } from '../lib/download';
import { formatDate } from '../lib/format';
import { periodLabel } from '../lib/period';
import type { Dataset } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton, SecondaryButton } from './form';

const range = (s: BackupSummary) =>
  s.firstPeriod ? (s.firstPeriod === s.lastPeriod ? periodLabel(s.firstPeriod) : `${periodLabel(s.firstPeriod)} – ${periodLabel(s.lastPeriod!)}`) : '–';

/** Compare file vs. device, choose merge or replace, import (with undo). */
export function ImportSheet({
  ds,
  backup,
  fileName,
  onClose,
  onImport,
}: {
  ds: Dataset;
  backup: BackupFile;
  fileName: string;
  onClose: () => void;
  onImport: (mode: ImportMode) => void;
}) {
  const [mode, setMode] = useState<ImportMode>('merge');
  const device = summarize(ds);
  const file = summarize(backup.data);
  const rows: [string, string | number, string | number][] = [
    ['Aktive Positionen', device.positions, file.positions],
    ['Archiviert', device.archived, file.archived],
    ['Zahlungen (Haken)', device.payments, file.payments],
    ['Monatsabschlüsse', device.monthClose, file.monthClose],
    ['Einmalbeträge', device.oneOffs, file.oneOffs],
    ['Zeitraum', range(device), range(file)],
  ];

  return (
    <BottomSheet title="Sicherung importieren" subtitle={`${fileName} · vom ${formatDate(backup.exportedAt)}`} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="import-sheet">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="text-[12px] text-ink-mute">
              <th className="py-1 font-medium" />
              <th className="py-1 text-right font-medium">Dieses Gerät</th>
              <th className="py-1 text-right font-medium">Datei</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([label, a, b]) => (
              <tr key={label}>
                <td className="py-2 text-ink-soft">{label}</td>
                <td className="num py-2 pl-2 text-right text-ink">{a}</td>
                <td className="num py-2 pl-2 text-right font-semibold text-ink">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[14px] font-medium text-ink-soft">Wie übernehmen?</legend>
          {(
            [
              ['merge', 'Zusammenführen (empfohlen)', 'Einträge aus der Datei gewinnen bei Konflikten; alles, was nur auf diesem Gerät ist, bleibt erhalten.'],
              ['replace', 'Ersetzen', 'Danach sind auf diesem Gerät genau die Daten aus der Datei.'],
            ] as const
          ).map(([value, title, text]) => (
            <label key={value} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-zinc-50">
              <input
                type="radio"
                name="import-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-1 h-5 w-5 accent-[#5B5BD6]"
              />
              <span>
                <span className="block text-[15px] font-medium text-ink">{title}</span>
                <span className="block text-[13px] text-ink-mute">{text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-ink-mute">
          Vor dem Import wird der aktuelle Stand als Sicherheitskopie gemerkt – der Import lässt sich danach rückgängig machen.
        </p>

        <div className="flex flex-col gap-2">
          <PrimaryButton type="button" onClick={() => onImport(mode)}>
            {mode === 'merge' ? 'Zusammenführen' : 'Ersetzen'}
          </PrimaryButton>
          <SecondaryButton
            onClick={async () => downloadJson(await exportBackup(db), backupFileName('fixkosten-vor-import'))}
          >
            Aktuellen Stand vorher als Datei sichern
          </SecondaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}
