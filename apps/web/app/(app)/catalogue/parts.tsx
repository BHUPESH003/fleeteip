"use client";

import { CatalogueDisabledBy, type Product, type ProductCategory, type ProductSubcategory } from "@fleetip/contracts/catalogue";
import { Badge, ConfirmDialog, FormBanner, Menu, Skeleton, Table, TableSkeleton, Th, Thead, Tr, UILink, type MenuItem } from "@fleetip/ui";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDateTime, plural } from "../../../lib/format";
import type { CatalogueIndex } from "./shared";

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

type CatalogueItem = ProductCategory | ProductSubcategory | Product;
type CatalogueLookup = Pick<CatalogueIndex, "categoriesById" | "subcategoriesById">;

/** Name of the ancestor that disables this item ("Cranes"), or null when it's enabled or disabled on its own. */
export function disabledViaName(item: CatalogueItem, catalogue: CatalogueLookup): string | null {
  if (item.disabledBy === CatalogueDisabledBy.subcategory && "productSubcategoryId" in item) {
    return catalogue.subcategoriesById.get(item.productSubcategoryId)?.name ?? "its subcategory";
  }
  if (item.disabledBy === CatalogueDisabledBy.category) {
    const categoryId =
      "productCategoryId" in item
        ? item.productCategoryId
        : "productSubcategoryId" in item
          ? catalogue.subcategoriesById.get(item.productSubcategoryId)?.productCategoryId
          : undefined;
    return (categoryId && catalogue.categoriesById.get(categoryId)?.name) || "its category";
  }
  return null;
}

/** "Disabled" (its own flag) or "Disabled via Cranes" (inherited); hidden from pickers, never deleted. */
export function DisabledBadge({ item, catalogue }: { item: CatalogueItem; catalogue: CatalogueLookup }) {
  if (!item.disabledBy) return null;
  const via = disabledViaName(item, catalogue);
  const title = via
    ? `Hidden from pickers because ${via} is disabled. Existing records keep it.`
    : `Disabled ${item.disabledAt ? formatDateTime(item.disabledAt) : ""}. Existing records keep it.`;
  return (
    <Badge size="sm" tone="neutral" title={title}>
      {via ? `Disabled via ${via}` : "Disabled"}
    </Badge>
  );
}

// ------------------------------------------------------------------ category/subcategory disable (soft cascade)

export type TaxonomyTarget =
  | { kind: "category"; item: ProductCategory }
  | { kind: "subcategory"; item: ProductSubcategory };

/** "Disable category" / "Enable subcategory" for a menu (catalogue.manage — the caller gates it). */
export function taxonomyToggleItem(target: TaxonomyTarget, offline: boolean, onSelect: () => void): MenuItem {
  const disabled = Boolean(target.item.disabledAt);
  const inherited = target.item.disabledBy === CatalogueDisabledBy.category;
  return {
    key: "disable",
    label: `${disabled ? "Enable" : "Disable"} ${target.kind}`,
    icon: disabled ? "success" : "retire",
    danger: !disabled,
    disabled: offline,
    hint: offline
      ? OFFLINE_HINT
      : disabled
        ? inherited
          ? "Its category is disabled too, so it stays hidden until that is enabled."
          : "Everything inside that isn't disabled on its own comes back to pickers."
        : "Hides it and everything inside from pickers. Existing records keep working.",
    separatorBefore: true,
    onSelect,
  };
}

/** What a disable/enable changes in pickers: counts of subcategories and products inside the branch. */
function branchImpact(target: TaxonomyTarget, catalogue: CatalogueIndex) {
  const subs =
    target.kind === "category"
      ? catalogue.subcategories.filter((s) => s.productCategoryId === target.item.id)
      : [target.item];
  const subsById = new Map(subs.map((s) => [s.id, s]));
  const products = catalogue.products.filter((p) => subsById.has(p.productSubcategoryId));
  const children = target.kind === "category" ? subs : [];
  return {
    // Disabling hides what's visible now.
    hides: {
      subs: children.filter((s) => !s.disabledBy).length,
      products: products.filter((p) => !p.disabledBy).length,
    },
    // Enabling restores what isn't disabled on its own (a subcategory under
    // a disabled category restores nothing until the category is enabled).
    restores:
      target.item.disabledBy === CatalogueDisabledBy.category && target.kind === "subcategory"
        ? { subs: 0, products: 0 }
        : {
            subs: children.filter((s) => !s.disabledAt).length,
            products: products.filter((p) => !p.disabledAt && !subsById.get(p.productSubcategoryId)?.disabledAt).length,
          },
  };
}

function impactLine(verb: string, counts: { subs: number; products: number }, kind: TaxonomyTarget["kind"]) {
  const parts = [
    ...(kind === "category" ? [plural(counts.subs, "subcategory", "subcategories")] : []),
    plural(counts.products, "product"),
  ];
  return `${verb} ${parts.join(" and ")} from pickers (registering machines, posting requirements, quotations).`;
}

/**
 * Confirms disabling (or enabling) a category or subcategory. `setDisabled`
 * is the tenant or staff write; `action` lets Platform Admin pass its own
 * staff-aware runner (defaults to useAction with an in-dialog banner).
 */
export function TaxonomyToggleDialog({
  target,
  catalogue,
  setDisabled,
  action: external,
  onClose,
  onChanged,
}: {
  target: TaxonomyTarget;
  catalogue: CatalogueIndex;
  setDisabled: (disabled: boolean) => Promise<unknown>;
  action?: { run: ReturnType<typeof useAction>["run"]; busy: boolean };
  onClose: () => void;
  onChanged: () => void;
}) {
  const { online } = useConnection();
  const own = useAction();
  const action = external ?? own;
  const disable = !target.item.disabledAt;
  const { name } = target.item;
  const impact = branchImpact(target, catalogue);

  const confirm = async () => {
    await action.run(() => setDisabled(disable), {
      failTitle: disable ? `${name} wasn't disabled` : `${name} wasn't enabled`,
      success: () =>
        disable
          ? { title: `${name} disabled`, body: "It and everything inside are hidden from pickers. Existing records keep working." }
          : { title: `${name} enabled`, body: "Everything inside that isn't disabled on its own is back in pickers." },
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
              impactLine("Hides", impact.hides, target.kind),
              "Existing machines, requirements, quotations and rentals keep working and still show its name.",
              "Nothing is deleted. Enabling it brings back everything inside that isn't disabled on its own.",
            ]
          : target.item.disabledBy === CatalogueDisabledBy.category
            ? ["Its category is also disabled, so it stays hidden from pickers until the category is enabled."]
            : [impactLine("Brings back", impact.restores, target.kind), "Items disabled on their own stay disabled."]
      }
      confirmLabel={`${disable ? "Disable" : "Enable"} ${target.kind}`}
      confirmVariant={disable ? "danger" : "primary"}
      cancelLabel={disable ? "Keep enabled" : "Keep disabled"}
      busy={action.busy}
      busyLabel={disable ? "Disabling…" : "Enabling…"}
      confirmDisabled={!online}
    >
      {!external && own.banner && (
        <FormBanner tone="error" title={own.banner.title}>
          {own.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
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
