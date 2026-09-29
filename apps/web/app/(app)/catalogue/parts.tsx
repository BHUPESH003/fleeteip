"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import { Badge, ConfirmDialog, FormBanner, Menu, Skeleton, Table, TableSkeleton, Th, Thead, Tr, UILink, type MenuItem } from "@fleetip/ui";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDateTime } from "../../../lib/format";
import { NO_DISABLE_REASON } from "./shared";

const OPEN_LINK =
  "inline-flex h-7 items-center rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong no-underline hover:bg-surface-hover";

/** One visible row action (Open); everything else in the row's More menu. */
export function RowActions({ href, label, items }: { href: string; label: string; items: MenuItem[] }) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <UILink href={href} className={OPEN_LINK} aria-label={`Open ${label}`}>
        Open
      </UILink>
      {items.length > 0 && <Menu label={`More actions for ${label}`} items={items} triggerSize="sm" width={300} />}
    </span>
  );
}

/** Disable/delete has no endpoint: the item stays visible, disabled, and says why. */
export function disabledRemoveItem(label: string): MenuItem {
  return { key: "disable", label, icon: "retire", disabled: true, hint: NO_DISABLE_REASON, separatorBefore: true };
}

/** "Disable product" / "Enable product" for a product's menu (catalogue.manage — the caller gates it). */
export function productToggleItem(product: Product, offline: boolean, onSelect: () => void): MenuItem {
  const disabled = Boolean(product.disabledAt);
  return {
    key: "disable",
    label: disabled ? "Enable product" : "Disable product",
    icon: disabled ? "success" : "retire",
    danger: !disabled,
    disabled: offline,
    hint: offline
      ? OFFLINE_HINT
      : disabled
        ? "Rental companies can pick it when registering machines again."
        : "Hidden when registering machines. Machines already using it keep it.",
    separatorBefore: true,
    onSelect,
  };
}

/** Confirms disabling (or enabling) a catalogue product, then calls onChanged (callers re-read the catalogue). */
export function ProductToggleDialog({
  organizationId,
  product,
  onClose,
  onChanged,
}: {
  organizationId: string;
  product: Product;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { online } = useConnection();
  const action = useAction();
  const disable = !product.disabledAt;
  const name = `${product.manufacturer} ${product.name}`;

  const confirm = async () => {
    await action.run(() => apiClient.setProductDisabled(organizationId, product.id, disable), {
      failTitle: disable ? `${name} wasn't disabled` : `${name} wasn't enabled`,
      success: () =>
        disable
          ? { title: `${name} disabled`, body: "It no longer appears when registering machines. Existing machines keep it." }
          : { title: `${name} enabled`, body: "It can be picked when registering machines again." },
      onDone: () => {
        onChanged();
        onClose();
      },
    });
  };

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={confirm}
      title={`${disable ? "Disable" : "Enable"} ${name}?`}
      icon={disable ? "retire" : "success"}
      tone={disable ? "danger" : "success"}
      consequences={
        disable
          ? [
              "Rental companies can't register new machines against it.",
              "Machines and rentals already using it keep it and still show its name.",
              "Nothing is deleted. Enabling it restores it as it was.",
            ]
          : ["Rental companies can pick it when registering machines again."]
      }
      confirmLabel={disable ? "Disable product" : "Enable product"}
      confirmVariant={disable ? "danger" : "primary"}
      cancelLabel={disable ? "Keep enabled" : "Keep disabled"}
      busy={action.busy}
      busyLabel={disable ? "Disabling…" : "Enabling…"}
      confirmDisabled={!online}
    >
      {action.banner && (
        <FormBanner tone="error" title={action.banner.title}>
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}

/** Shown next to a disabled product (hidden from pickers, never deleted). */
export function DisabledBadge({ disabledAt }: { disabledAt: string | null }) {
  if (!disabledAt) return null;
  return (
    <Badge size="sm" tone="neutral" title={`Disabled ${formatDateTime(disabledAt)}. Machines already using it keep it.`}>
      Disabled
    </Badge>
  );
}

/** Honest record line: catalogue entries only carry createdAt. */
export function RecordInfoLine({ createdAt }: { createdAt: string }) {
  return (
    <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
      Added to the catalogue {formatDateTime(createdAt)}. FleetIP doesn&apos;t record who added an entry or when it was last
      changed.
    </p>
  );
}

/** Header band + one table card, matching the loaded detail pages so nothing jumps. */
export function CatalogueDetailSkeleton({ label, columns = 4 }: { label: string; columns?: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[200px]" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-[52px] w-[52px] rounded-control" />
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[260px] max-w-[80%]" />
            <Skeleton className="h-3 w-[380px] max-w-[90%]" />
          </div>
          <div className="h-[34px] w-[140px] rounded-control bg-surface-hover" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4 max-[760px]:px-4">
        <div className="overflow-hidden rounded-panel border border-border-strong bg-surface">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Table bare>
            <Thead>
              <Tr>
                {Array.from({ length: columns }, (_, index) => (
                  <Th key={index}>
                    <Skeleton className="h-2 w-16" />
                  </Th>
                ))}
              </Tr>
            </Thead>
            <TableSkeleton columns={columns} rows={6} label={label} />
          </Table>
        </div>
        <span role="status" className="text-xs text-meta">
          {label}…
        </span>
      </div>
    </div>
  );
}
