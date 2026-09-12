"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * Native <dialog> element (showModal/close) — covers confirmations and
 * simple modals without a hand-rolled overlay or a new dependency.
 */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="w-full max-w-md rounded-panel border border-border bg-surface p-0 backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4 p-5">
        {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
        <div className="text-sm text-ink-muted">{children}</div>
        {actions && <div className="flex justify-end gap-2 pt-1">{actions}</div>}
      </div>
    </dialog>
  );
}
