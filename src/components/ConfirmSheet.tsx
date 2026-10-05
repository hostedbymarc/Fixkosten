import type { ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton, SecondaryButton } from './form';

/** Only for irreversible actions (everything reversible uses an undo toast). */
export function ConfirmSheet({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  returnFocusTo,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  return (
    <BottomSheet title={title} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-4" data-testid="confirm-sheet">
        <div className="text-[15px] leading-relaxed text-ink-soft">{children}</div>
        <div className="flex flex-col gap-2">
          <PrimaryButton type="button" danger onClick={onConfirm}>
            {confirmLabel}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}
