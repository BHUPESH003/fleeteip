"use client";

import { Alert, Button, Dialog } from "@fleetip/ui";
import type { ReactNode } from "react";

/**
 * Catalogue administration (create/edit category, subcategory, product) has
 * no backend endpoint at all today — apps/api/src/modules/catalogue only
 * exposes the 3 read routes (see docs/frontend-backend-gap-report.md,
 * Phase 11). These dialogs render the intended form/confirmation UX in full
 * so the workflow is designed and reviewable, but the submit/confirm action
 * is always disabled with a tooltip — never a silent no-op that could look
 * like it saved something.
 */
export function CatalogueFormDialog({
  open,
  onClose,
  title,
  children,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <Alert tone="info" title="Not available yet">
          Catalogue administration has no backend endpoint in this branch. This form shows the
          intended workflow — nothing entered here is saved. See the frontend/backend gap report.
        </Alert>
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled title="Catalogue administration isn't available yet">
            {submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Destructive-operation confirmation, designed per §18 (dependency-warning
 * copy) but inert — Confirm is always disabled. Opening the dialog itself
 * is harmless (no request fires), so the trigger stays clickable; only the
 * destructive action inside is gated.
 */
export function CatalogueConfirmDialog({
  open,
  onClose,
  title,
  dependencyCopy,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dependencyCopy: string;
  confirmLabel: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-ink">{dependencyCopy}</p>
        <Alert tone="warning" title="Not available yet">
          There is no backend endpoint for this action today — this dialog documents the intended
          confirmation UX only. See the frontend/backend gap report.
        </Alert>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled title="Not available yet">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
