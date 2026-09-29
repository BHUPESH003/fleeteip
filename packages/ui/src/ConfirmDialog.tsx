"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog, type DialogTone } from "./Dialog";
import type { IconName } from "./Icon";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  /** Names the action and the record: "Retire MCH-00231?" */
  title: ReactNode;
  /** One line under the title, e.g. the record's identity or "This makes two changes at once:". */
  description?: ReactNode;
  /** What will change — including any second write the user might not expect. */
  consequences?: ReactNode[];
  icon?: IconName;
  tone?: DialogTone;
  /** Repeats the verb: "Retire machine". */
  confirmLabel: string;
  busyLabel?: string;
  /** Says what not doing it means: "Keep active". */
  cancelLabel?: string;
  /** `danger` renders the outlined red button — never filled red. */
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
  confirmDisabled?: boolean;
  /** Extra fields (reason, dates) and inline errors, shown under the consequences. */
  children?: ReactNode;
}

/**
 * Confirmation for destructive or important actions (UX pass §08): the
 * title names the action and the record, the body lists consequences, and
 * both buttons repeat the verb. Built on Dialog with role="alertdialog";
 * focus starts on the safe choice.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequences = [],
  icon,
  tone = "neutral",
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  busy = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const indent = icon ? "ml-11" : "";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      role="alertdialog"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-cancel="">
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => void onConfirm()}
            busy={busy}
            busyLabel={busyLabel}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {consequences.length > 0 && (
        <ul className={`m-0 flex list-none flex-col gap-1.5 p-0 ${indent}`}>
          {consequences.map((point, index) => (
            <li key={index} className="flex items-start gap-2 text-sm leading-[1.5] text-ink-body">
              <span aria-hidden="true" className="mt-[7px] h-[5px] w-[5px] flex-none rounded-[1px] bg-disabled-text" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      )}
      {children && <div className={`flex flex-col gap-3 pt-1 ${indent}`}>{children}</div>}
    </Dialog>
  );
}
