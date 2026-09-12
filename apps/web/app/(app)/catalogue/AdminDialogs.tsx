"use client";

import { Button, Dialog } from "@fleetip/ui";
import type { FormEvent, ReactNode } from "react";
import { NotYetAvailableConfirmDialog, NotYetAvailableFormDialog } from "../../../components/NotYetAvailableDialog";

// catalogue.manage is seeded rental_company-only (see
// docs/backend-hardening-report.md's "Backend MVP Gaps pass" entry) — a
// documented interim scoping limitation, not a bug to fix from this pass.
const NO_PERMISSION_REASON =
  "Catalogue administration requires the catalogue.manage permission, which today only a Rental Company organization holds (an interim scoping limitation — see the backend hardening report). Sign in as a Rental Company to create or edit catalogue entries.";

const DISABLE_REASON =
  "There is no disable/delete endpoint for the catalogue — apps/api/src/modules/catalogue only exposes create/update. Products and categories are referenced by machines.product_id with ON DELETE RESTRICT, so removing one safely needs its own migration/decision. This dialog shows the intended workflow; nothing entered here is saved.";

/**
 * Catalogue create/edit (category, subcategory, product) now has a real
 * backend endpoint, gated by catalogue.manage (see
 * docs/frontend-backend-gap-report.md, Phase 11 — Resolved). When the
 * caller holds that permission this renders a real form; otherwise it
 * falls back to the same NotYetAvailableFormDialog used before, with an
 * accurate reason (permission gate, not "no endpoint").
 */
export function CatalogueFormDialog({
  open,
  onClose,
  title,
  children,
  submitLabel,
  canManage,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  submitLabel: string;
  canManage: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
  error?: string | null;
}) {
  if (!canManage || !onSubmit) {
    return (
      <NotYetAvailableFormDialog
        open={open}
        onClose={onClose}
        title={title}
        reason={NO_PERMISSION_REASON}
        submitLabel={submitLabel}
      >
        {children}
      </NotYetAvailableFormDialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Disable/delete genuinely has no backend endpoint (ON DELETE RESTRICT FKs
 * prevent it) — stays the disabled confirm dialog, unconditionally, for
 * every caller.
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
    <NotYetAvailableConfirmDialog
      open={open}
      onClose={onClose}
      title={title}
      dependencyCopy={dependencyCopy}
      reason={DISABLE_REASON}
      confirmLabel={confirmLabel}
    />
  );
}
