import { useEffect, useId, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** "⋯" button with a small keyboard-accessible menu (desktop row actions). */
export function RowMenu({ label, items, className = '' }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && e.target !== button.current) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl text-ink-mute hover:bg-zinc-100"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="4" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="14" cy="9" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-2xl border border-line bg-surface p-1 shadow-lg"
          onKeyDown={(e) => {
            const nodes = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const index = nodes.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              nodes[(index + 1) % nodes.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`focus-ring flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[15px] hover:bg-zinc-100 ${
                item.danger ? 'text-over' : 'text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
