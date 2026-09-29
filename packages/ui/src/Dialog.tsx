"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type DialogSize = "sm" | "md" | "lg" | "xl";
export type DialogTone = "neutral" | "info" | "success" | "warning" | "danger";

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "w-[min(420px,calc(100vw-32px))]",
  md: "w-[min(520px,calc(100vw-32px))]",
  lg: "w-[min(680px,calc(100vw-32px))]",
  xl: "w-[min(880px,calc(100vw-32px))]",
};

const TONE_TILE: Record<DialogTone, string> = {
  neutral: "bg-out-of-service-bg text-out-of-service",
  info: "bg-on-rent-bg text-on-rent",
  success: "bg-available-bg text-available",
  warning: "bg-attention-bg text-attention",
  danger: "bg-destructive-chip text-destructive",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Names the action and the record, e.g. "Retire MCH-00231?". */
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  tone?: DialogTone;
  size?: DialogSize;
  /** `alertdialog` for confirmations; `dialog` for forms. */
  role?: "dialog" | "alertdialog";
  children?: ReactNode;
  /** Buttons, rendered in the footer bar. */
  footer?: ReactNode;
  /** @deprecated use `footer` */
  actions?: ReactNode;
  /** When set, body + footer are wrapped in a <form noValidate>. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** False while a write is in flight — Esc and backdrop clicks are ignored. */
  dismissible?: boolean;
  /** Show the × in the header. Defaults to true for forms, false for alert dialogs. */
  showClose?: boolean;
  className?: string;
}

/**
 * Native <dialog> (showModal) — the browser provides the focus trap, top
 * layer and inert background; Esc maps to onClose unless the dialog is
 * busy. Focus returns to the element that opened it when it closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  tone = "neutral",
  size = "md",
  role = "dialog",
  children,
  footer,
  actions,
  onSubmit,
  dismissible = true,
  showClose,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      openerRef.current = document.activeElement;
      el.showModal();
      // Forms focus their first field; confirmations focus the safe choice
      // (Cancel), never the destructive verb. `data-autofocus` overrides both.
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        (role === "alertdialog"
          ? el.querySelector<HTMLElement>("[data-cancel]")
          : el.querySelector<HTMLElement>(
              "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
            ));
      target?.focus();
    }
    if (!open && el.open) {
      el.close();
      if (openerRef.current instanceof HTMLElement && openerRef.current.isConnected) {
        openerRef.current.focus();
      }
    }
  }, [open]);

  // Close on unmount while open (e.g. route change) so the top layer is released.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  const withClose = showClose ?? role === "dialog";
  const footerContent = footer ?? actions;

  const body = (
    <>
      <div className={cx("flex flex-col gap-3 px-5", icon ? "pb-1" : "pb-1", title ? "pt-2" : "pt-5")}>
        {children}
      </div>
      {footerContent && (
        <div className="sticky bottom-0 mt-[18px] flex flex-wrap justify-end gap-2 border-t border-border bg-surface-sunk px-5 py-3">
          {footerContent}
        </div>
      )}
      {!footerContent && <div className="h-5" />}
    </>
  );

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && dismissible) onClose();
      }}
      className={cx(
        "m-auto max-h-[calc(100dvh-48px)] overflow-y-auto rounded-shell border border-border-control bg-surface p-0 text-ink-strong shadow-dialog backdrop:bg-ink/40",
        "open:animate-fip-in",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {open && (
        <>
          {title && (
            <div className="flex items-start gap-3 px-5 pb-1.5 pt-[18px]">
              {icon && (
                <span
                  aria-hidden="true"
                  className={cx("flex h-8 w-8 flex-none items-center justify-center rounded-control", TONE_TILE[tone])}
                >
                  <Icon name={icon} size={17} />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 id={titleId} className="m-0 text-[17px] font-semibold leading-[1.3] text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="m-0 text-sm leading-[1.55] text-ink-muted">
                    {description}
                  </p>
                )}
              </div>
              {withClose && (
                <IconButton
                  icon="close"
                  label="Close"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  disabled={!dismissible}
                  noTooltip
                />
              )}
            </div>
          )}
          {onSubmit ? (
            <form noValidate onSubmit={onSubmit}>
              {body}
            </form>
          ) : (
            body
          )}
        </>
      )}
    </dialog>
  );
}
