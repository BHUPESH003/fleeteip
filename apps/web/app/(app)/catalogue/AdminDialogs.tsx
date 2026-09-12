"use client";

import type { ReactNode } from "react";
import { NotYetAvailableConfirmDialog, NotYetAvailableFormDialog } from "../../../components/NotYetAvailableDialog";

const REASON =
  "Catalogue administration has no backend endpoint in this branch — apps/api/src/modules/catalogue only exposes 3 read routes. This dialog shows the intended workflow; nothing entered here is saved. See the frontend/backend gap report.";

/**
 * Catalogue create/edit/disable (create/edit category, subcategory,
 * product) has no backend endpoint at all today (see
 * docs/frontend-backend-gap-report.md, Phase 11). Thin catalogue-flavored
 * wrappers over the shared NotYetAvailableFormDialog/ConfirmDialog.
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
    <NotYetAvailableFormDialog open={open} onClose={onClose} title={title} reason={REASON} submitLabel={submitLabel}>
      {children}
    </NotYetAvailableFormDialog>
  );
}

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
    <NotYetAvailableConfirmDialog
      open={open}
      onClose={onClose}
      title={title}
      dependencyCopy={dependencyCopy}
      reason={REASON}
      confirmLabel={confirmLabel}
    />
  );
}
