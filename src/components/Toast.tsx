import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>();
  const counter = useRef(0);

  const show = useCallback((t: ToastOptions) => {
    counter.current += 1;
    setToast({ ...t, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), toast.durationMs ?? 5000);
    return () => window.clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 lg:pl-[240px]"
        style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 12px)' }}
        aria-live="polite"
        role="status"
      >
        {toast && (
          <div
            key={toast.id}
            className="anim-toast pointer-events-auto flex min-h-[48px] w-full max-w-sm items-center gap-3 rounded-2xl bg-zinc-900 py-2 pl-4 pr-2 text-[15px] text-white shadow-lg"
          >
            <span className="flex-1">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="focus-ring min-h-[44px] rounded-xl px-3 font-semibold text-[#B4B4F5] hover:bg-white/10"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
