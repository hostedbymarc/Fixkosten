import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState, type ReactNode } from 'react';

export interface HandleProps {
  ref: (el: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  label: string;
}

interface Props<T extends { id: string }> {
  items: T[];
  getName: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, handle: HandleProps, dragging: boolean) => ReactNode;
  /** e.g. 'Position' / 'Kategorie' for screen reader texts */
  noun: string;
}

function SortableItem<T extends { id: string }>({
  item,
  name,
  noun,
  renderItem,
}: {
  item: T;
  name: string;
  noun: string;
  renderItem: Props<T>['renderItem'];
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: 'relative' }}
      className={isDragging ? 'shadow-lg' : ''}
    >
      {renderItem(
        item,
        {
          ref: setActivatorNodeRef,
          attributes: { ...attributes, 'aria-roledescription': 'sortierbar' },
          listeners,
          label: `${noun} „${name}“ verschieben`,
        },
        isDragging,
      )}
    </li>
  );
}

/**
 * Vertical sortable list. Dragging starts only on the handle (never long-press
 * on the row, which would fight scrolling). Touch, mouse and keyboard
 * (Space to pick up, arrows to move, Space to drop, Esc to cancel).
 */
export function SortableList<T extends { id: string }>({ items, getName, onReorder, renderItem, noun }: Props<T>) {
  const [order, setOrder] = useState(items);
  useEffect(() => setOrder(items), [items]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: UniqueIdentifier) => {
    const item = order.find((i) => i.id === id);
    return item ? getName(item) : '';
  };
  const position = (id: UniqueIdentifier | undefined) => order.findIndex((i) => i.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `${noun} „${nameOf(active.id)}“ aufgenommen, Position ${position(active.id)} von ${order.length}. Pfeiltasten verschieben, Leertaste legt ab, Escape bricht ab.`,
    onDragOver: ({ active, over }) =>
      over ? `„${nameOf(active.id)}“ ist jetzt an Position ${position(over.id)} von ${order.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `„${nameOf(active.id)}“ an Position ${position(over.id)} von ${order.length} abgelegt.` : undefined,
    onDragCancel: ({ active }) => `Sortieren abgebrochen. „${nameOf(active.id)}“ bleibt an Position ${position(active.id)}.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((i) => i.id === active.id);
    const to = order.findIndex((i) => i.id === over.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    onReorder(next.map((i) => i.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: `Zum Sortieren Leertaste drücken, mit den Pfeiltasten verschieben, mit Leertaste ablegen oder mit Escape abbrechen.`,
        },
      }}
    >
      <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-line">
          {order.map((item) => (
            <SortableItem key={item.id} item={item} name={getName(item)} noun={noun} renderItem={renderItem} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** Six-dot drag handle; dragging only starts here. */
export function DragHandle({ handle }: { handle: HandleProps }) {
  return (
    <button
      type="button"
      ref={handle.ref}
      {...handle.attributes}
      {...handle.listeners}
      aria-label={handle.label}
      className="focus-ring flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-xl text-ink-faint hover:bg-zinc-100 hover:text-ink-mute active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      data-testid="drag-handle"
    >
      <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
        {[3, 9, 15].flatMap((y) => [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
      </svg>
    </button>
  );
}
