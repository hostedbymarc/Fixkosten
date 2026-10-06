import { useState } from 'react';
import { db } from '../db/db';
import { createCategory, deleteCategory, reorderCategories, RepoError, updateCategory } from '../db/repo';
import { categoryUsage, sortedCategories } from '../lib/calc';
import type { Category, Dataset, Kind } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { ChevronLeft } from './Icons';
import { PrimaryButton, SecondaryButton, Segmented, SelectField, TextField } from './form';
import { DragHandle, SortableList } from './Sortable';
import { useToast } from './Toast';

// Eight brand tones of similar lightness: distinguishable, readable in light and dark.
export const CATEGORY_COLORS = [
  { value: '#8B4FD8', name: 'Violett' },
  { value: '#5F5BF0', name: 'Indigo' },
  { value: '#2F7BEA', name: 'Blau' },
  { value: '#0E9AA7', name: 'Petrol' },
  { value: '#1F9D5C', name: 'Grün' },
  { value: '#C98A0E', name: 'Senf' },
  { value: '#E0662F', name: 'Orange' },
  { value: '#D9467A', name: 'Rosé' },
];

type View = { mode: 'list' } | { mode: 'edit'; id?: string } | { mode: 'delete'; id: string };

const positionsLabel = (n: number) => (n === 1 ? '1 Position' : `${n} Positionen`);

/** Create, rename, colour, type, sort and delete categories. */
export function CategoriesSheet({ ds, onClose, returnFocusTo }: { ds: Dataset; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const [view, setView] = useState<View>({ mode: 'list' });
  const categories = sortedCategories(ds);
  const expenseCount = categories.filter((c) => c.kind === 'expense').length;
  const toast = useToast();

  const editing = view.mode !== 'list' && view.id ? categories.find((c) => c.id === view.id) : undefined;
  const title = view.mode === 'list' ? 'Kategorien' : view.mode === 'delete' ? 'Kategorie löschen' : editing ? 'Kategorie bearbeiten' : 'Neue Kategorie';

  return (
    <BottomSheet title={title} onClose={onClose} returnFocusTo={returnFocusTo}>
      {view.mode !== 'list' && (
        <button
          type="button"
          onClick={() => setView({ mode: 'list' })}
          className="focus-ring -ml-2 mb-2 flex h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-medium text-accent-ink"
        >
          <ChevronLeft size={18} /> Alle Kategorien
        </button>
      )}

      {view.mode === 'list' && (
        <div className="flex flex-col gap-3" data-testid="categories-list">
          <div className="overflow-hidden rounded-2xl border border-line">
            <SortableList
              items={categories}
              noun="Kategorie"
              getName={(c) => c.name}
              onReorder={(ids) => void reorderCategories(db, ids)}
              renderItem={(c, handle) => (
                <div className="flex items-center gap-1 bg-surface pl-1 pr-2">
                  <DragHandle handle={handle} />
                  <button
                    type="button"
                    onClick={() => setView({ mode: 'edit', id: c.id })}
                    className="focus-ring flex min-h-[56px] flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-zinc-50"
                    aria-label={`${c.name} bearbeiten`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{c.name}</span>
                      <span className="block text-[13px] text-ink-mute">
                        {c.kind === 'savings' ? 'Sparen' : 'Ausgabe'} · {positionsLabel(categoryUsage(ds, c.id))}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            />
          </div>
          <PrimaryButton type="button" onClick={() => setView({ mode: 'edit' })}>
            Neue Kategorie
          </PrimaryButton>
        </div>
      )}

      {view.mode === 'edit' && (
        <CategoryForm
          key={view.id ?? 'new'}
          category={editing}
          isLastExpense={!!editing && editing.kind === 'expense' && expenseCount === 1}
          onSaved={() => setView({ mode: 'list' })}
          onDelete={async (category) => {
            if (categoryUsage(ds, category.id) > 0) {
              setView({ mode: 'delete', id: category.id });
              return;
            }
            await deleteCategory(db, category.id);
            setView({ mode: 'list' });
            toast({
              message: `Kategorie „${category.name}“ gelöscht`,
              actionLabel: 'Rückgängig',
              onAction: () => void db.categories.put(category),
            });
          }}
        />
      )}

      {view.mode === 'delete' && editing && (
        <MoveAndDelete
          category={editing}
          count={categoryUsage(ds, editing.id)}
          targets={categories.filter((c) => c.id !== editing.id)}
          onDone={() => setView({ mode: 'list' })}
        />
      )}
    </BottomSheet>
  );
}

function CategoryForm({
  category,
  isLastExpense,
  onSaved,
  onDelete,
}: {
  category?: Category;
  isLastExpense: boolean;
  onSaved: () => void;
  onDelete: (category: Category) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[1]!.value);
  const [kind, setKind] = useState<Kind>(category?.kind ?? 'expense');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const nameError = name.trim() === '' ? 'Bitte einen Namen eingeben.' : null;

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      data-testid="category-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (nameError) return;
        try {
          if (category) await updateCategory(db, category.id, { name, color, kind });
          else await createCategory(db, { name, color, kind });
          onSaved();
        } catch (err) {
          setError(err instanceof RepoError ? err.message : 'Speichern fehlgeschlagen.');
        }
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          setDirty(true);
        }}
        placeholder="z. B. Kinder"
        error={dirty ? nameError : null}
      />
      <div role="radiogroup" aria-label="Farbe">
        <div className="mb-1.5 text-[14px] font-medium text-ink-soft">Farbe</div>
        <div className="grid grid-cols-8 gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.name}
              onClick={() => setColor(c.value)}
              className={`focus-ring flex h-11 items-center justify-center rounded-xl border-2 ${color === c.value ? 'border-ink' : 'border-transparent'}`}
            >
              <span className="h-6 w-6 rounded-full" style={{ background: c.value }} />
            </button>
          ))}
        </div>
      </div>
      <Segmented
        label="Typ"
        value={kind}
        onChange={(k) => !(isLastExpense && k === 'savings') && setKind(k)}
        options={[
          { value: 'expense', label: 'Ausgabe' },
          { value: 'savings', label: 'Sparen' },
        ]}
      />
      {isLastExpense && <p className="text-[13px] text-ink-mute">Mindestens eine Ausgaben-Kategorie muss bleiben.</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-over-soft px-3 py-2 text-[14px] text-over">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <PrimaryButton disabled={!!nameError}>{category ? 'Speichern' : 'Kategorie anlegen'}</PrimaryButton>
        {category && !isLastExpense && (
          <SecondaryButton danger onClick={() => onDelete(category)}>
            Kategorie löschen
          </SecondaryButton>
        )}
      </div>
    </form>
  );
}

function MoveAndDelete({
  category,
  count,
  targets,
  onDone,
}: {
  category: Category;
  count: number;
  targets: Category[];
  onDone: () => void;
}) {
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="move-dialog"
      onSubmit={async (e) => {
        e.preventDefault();
        await deleteCategory(db, category.id, target);
        onDone();
      }}
    >
      <p className="text-[15px] leading-relaxed text-ink-soft">
        „{category.name}“ enthält {positionsLabel(count)} (auch archivierte). Sie werden verschoben, danach wird die Kategorie gelöscht.
      </p>
      <SelectField
        label={`${positionsLabel(count)} verschieben nach …`}
        value={target}
        onChange={setTarget}
        options={targets.map((c) => ({ value: c.id, label: c.name }))}
      />
      <PrimaryButton danger disabled={!target}>
        Verschieben und löschen
      </PrimaryButton>
    </form>
  );
}
