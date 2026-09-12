"use client";

import { Alert, Button, Dialog } from "@fleetip/ui";
import type { ReactNode } from "react";

/**
 * Shared by every screen that needs to show the FULL intended form/
 * confirmation UX for an action the backend doesn't support yet (§20/§18):
 * Machines Edit, Requirements Edit, Catalogue create/edit/disable. Opening
 * the dialog is harmless (no request fires), so the trigger stays
 * clickable; the submit/confirm action inside is always disabled with a
 * tooltip so nothing implies the action persisted.
 */
export function NotYetAvailableFormDialog({
  open,
  onClose,
  title,
  reason,
  children,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  reason: string;
  children: ReactNode;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <Alert tone="info" title="Not available yet">
          {reason}
        </Alert>
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled title={reason}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function NotYetAvailableConfirmDialog({
  open,
  onClose,
  title,
  dependencyCopy,
  reason,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dependencyCopy: string;
  reason: string;
  confirmLabel: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-ink">{dependencyCopy}</p>
        <Alert tone="warning" title="Not available yet">
          {reason}
        </Alert>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled title={reason}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
