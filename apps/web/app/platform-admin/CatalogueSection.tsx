"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import {
  Button,
  CellStack,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Menu,
  Pagination,
  Panel,
  SegmentedControl,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type MenuItem,
} from "@fleetip/ui";
import { useMemo, useState } from "react";
import { adminApiClient } from "../../lib/admin-api-client";
import { categoryIcon } from "../../lib/category-icon";
import { useConnection } from "../../lib/connection";
import { OFFLINE_HINT, describeError } from "../../lib/errors";
import { formatNumber } from "../../lib/format";
import { useUrlSearch, useUrlState } from "../../lib/url-state";
import { useLoad } from "../../lib/use-load";
import { CategoryFormDialog, ProductFormDialog, SubcategoryFormDialog } from "../(app)/catalogue/AdminDialogs";
import { DisabledBadge, TaxonomyToggleDialog, taxonomyToggleItem, type TaxonomyTarget } from "../(app)/catalogue/parts";
import { formatCapacity, loadCatalogue } from "../(app)/catalogue/shared";
import { staffCatalogueWriter, useStaffAction } from "./staff-api";

type Level = "categories" | "subcategories" | "products";
const LEVELS: Level[] = ["categories", "subcategories", "products"];
const PAGE_SIZE = 25;

type DialogState =
  | { kind: "category"; category?: ProductCategory }
  | { kind: "subcategory"; subcategory?: ProductSubcategory; fixedCategoryId?: string }
  | { kind: "product"; product?: Product; fixedSubcategoryId?: string };

/**
 * The shared Product Catalogue, written through the staff endpoints
 * (/admin/catalogue/*) with the same forms tenant admins use. Reads are the
 * public catalogue lists (including disabled items). Categories,
 * subcategories and products can be disabled/enabled; disabling a parent
 * hides everything inside from pickers (soft cascade).
 */
export function CatalogueSection() {
  const { online } = useConnection();
  const { get, set } = useUrlState();
  const search = useUrlSearch("q", get, set);
  const levelParam = get("level", "categories");
  const level: Level = (LEVELS as string[]).includes(levelParam) ? (levelParam as Level) : "categories";
  const categoryFilter = get("category");
  const rawQuery = get("q").trim().toLowerCase();
  const query = rawQuery.length >= 2 ? rawQuery : "";
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Product | null>(null);
  const [taxonomyTarget, setTaxonomyTarget] = useState<TaxonomyTarget | null>(null);
  const action = useStaffAction();
  const load = useLoad(() => loadCatalogue(), []);

  const toggleDisabled = async () => {
    if (!toggleTarget) return;
    const disable = !toggleTarget.disabledAt;
    const name = `${toggleTarget.manufacturer} ${toggleTarget.name}`;
    await action.run(() => adminApiClient.setProductDisabled(toggleTarget.id, disable), {
      failTitle: disable ? `${name} wasn't disabled` : `${name} wasn't enabled`,
      success: () =>
        disable
          ? { title: `${name} disabled`, body: "It no longer appears when registering machines. Existing machines keep it." }
          : { title: `${name} enabled`, body: "It can be picked when registering machines again." },
      onDone: (updated) => {
        load.setData((current) =>
          current
            ? { ...current, products: current.products.map((p) => (p.id === toggleTarget.id && updated ? updated : p)) }
            : current,
        );
        setToggleTarget(null);
      },
    });
  };

  const index = useMemo(() => {
    if (!load.data) return null;
    const productCount = new Map<string, number>();
    for (const p of load.data.products) productCount.set(p.productSubcategoryId, (productCount.get(p.productSubcategoryId) ?? 0) + 1);
    const subsByCategory = new Map<string, ProductSubcategory[]>();
    for (const s of load.data.subcategories) subsByCategory.set(s.productCategoryId, [...(subsByCategory.get(s.productCategoryId) ?? []), s]);
    return { productCount, subsByCategory };
  }, [load.data]);

  const offline = !online;
  const blocked = offline ? OFFLINE_HINT : null;

  const categories = (load.data?.categories ?? [])
    .filter((c) => !query || `${c.name} ${c.code}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const subcategories = (load.data?.subcategories ?? [])
    .filter((s) => (!categoryFilter || s.productCategoryId === categoryFilter) && (!query || `${s.name} ${s.code}`.toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const products = (load.data?.products ?? [])
    .filter((p) => {
      const sub = load.data?.subcategoriesById.get(p.productSubcategoryId);
      if (categoryFilter && sub?.productCategoryId !== categoryFilter) return false;
      return !query || `${p.manufacturer} ${p.name} ${sub?.name ?? ""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => `${a.manufacturer} ${a.name}`.localeCompare(`${b.manufacturer} ${b.name}`));

  const total = level === "categories" ? categories.length : level === "subcategories" ? subcategories.length : products.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const slice = <T,>(rows: T[]) => rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtersActive = Boolean(query || (level !== "categories" && categoryFilter));
  const clear = () => {
    search.setValue("");
    set({ q: null, category: null });
  };

  const newLabel = level === "categories" ? "New category" : level === "subcategories" ? "New subcategory" : "New product";
  const newBlocked =
    blocked ??
    (level === "subcategories" && load.data?.categories.length === 0
      ? "Create a category first."
      : level === "products" && load.data?.subcategories.length === 0
        ? "Create a subcategory first."
        : null);

  function toggleItem(target: TaxonomyTarget): MenuItem {
    return taxonomyToggleItem(target, offline, () => setTaxonomyTarget(target));
  }

  const body = (() => {
    if (load.error) {
      return (
        <div className="p-4">
          <ErrorState
            title="The catalogue didn't load"
            message={describeError(load.error).body}
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void load.reload()}>
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    if (load.loading || !load.data || !index) {
      return (
        <Table bare minWidth={640} caption="Loading the catalogue">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th align="right">Contains</Th>
              <Th />
            </Tr>
          </Thead>
          <TableSkeleton columns={4} label="Loading the catalogue" />
        </Table>
      );
    }
    if (total === 0) {
      return filtersActive ? (
        <EmptyState
          title={`No ${level} match these filters`}
          description="Clear the filters to see the whole list."
          action={
            <Button variant="secondary" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          variant="page"
          icon="catalogue"
          title={`No ${level} yet`}
          description="Start with a category, then its subcategories, then the products in each."
        />
      );
    }
    if (level === "categories") {
      return (
        <Table bare minWidth={640} caption="Catalogue categories">
          <Thead>
            <Tr>
              <Th>Category</Th>
              <Th>Code</Th>
              <Th align="right">Subcategories</Th>
              <Th align="right">Products</Th>
              <Th className="w-[1%]">
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {slice(categories).map((category) => {
              const subs = index.subsByCategory.get(category.id) ?? [];
              const productTotal = subs.reduce((sum, s) => sum + (index.productCount.get(s.id) ?? 0), 0);
              return (
                <Tr key={category.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Icon name={categoryIcon(category)} size={16} className="text-tile-icon" />
                      <CellStack title={category.name} />
                      <DisabledBadge item={category} catalogue={load.data!} />
                    </span>
                  </Td>
                  <Td className="font-mono text-xs font-medium">{category.code}</Td>
                  <Td align="right" className="font-mono">{formatNumber(subs.length, 0)}</Td>
                  <Td align="right" className="font-mono">{formatNumber(productTotal, 0)}</Td>
                  <Td>
                    <RowActions
                      primaryLabel="Rename"
                      label={category.name}
                      blocked={blocked}
                      onPrimary={() => setDialog({ kind: "category", category })}
                      items={[
                        {
                          key: "add",
                          label: "Add subcategory",
                          icon: "plus",
                          hint: blocked ?? `Inside ${category.name}.`,
                          disabled: Boolean(blocked),
                          onSelect: () => setDialog({ kind: "subcategory", fixedCategoryId: category.id }),
                        },
                        toggleItem({ kind: "category", item: category }),
                      ]}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      );
    }
    if (level === "subcategories") {
      return (
        <Table bare minWidth={680} caption="Catalogue subcategories">
          <Thead>
            <Tr>
              <Th>Subcategory</Th>
              <Th>Code</Th>
              <Th>Category</Th>
              <Th align="right">Products</Th>
              <Th className="w-[1%]">
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {slice(subcategories).map((subcategory) => (
              <Tr key={subcategory.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <CellStack title={subcategory.name} />
                    <DisabledBadge item={subcategory} catalogue={load.data!} />
                  </span>
                </Td>
                <Td className="font-mono text-xs font-medium">{subcategory.code}</Td>
                <Td>{load.data?.categoriesById.get(subcategory.productCategoryId)?.name ?? "Not specified"}</Td>
                <Td align="right" className="font-mono">{formatNumber(index.productCount.get(subcategory.id) ?? 0, 0)}</Td>
                <Td>
                  <RowActions
                    primaryLabel="Rename"
                    label={subcategory.name}
                    blocked={blocked}
                    onPrimary={() => setDialog({ kind: "subcategory", subcategory })}
                    items={[
                      {
                        key: "add",
                        label: "Add product",
                        icon: "plus",
                        hint: blocked ?? `Inside ${subcategory.name}.`,
                        disabled: Boolean(blocked),
                        onSelect: () => setDialog({ kind: "product", fixedSubcategoryId: subcategory.id }),
                      },
                      toggleItem({ kind: "subcategory", item: subcategory }),
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      );
    }
    return (
      <Table bare minWidth={680} caption="Catalogue products">
        <Thead>
          <Tr>
            <Th>Product</Th>
            <Th>Subcategory</Th>
            <Th align="right">Rated capacity</Th>
            <Th className="w-[1%]">
              <span className="sr-only">Actions</span>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {slice(products).map((product) => {
            const sub = load.data?.subcategoriesById.get(product.productSubcategoryId);
            const capacity = formatCapacity(product);
            const label = `${product.manufacturer} ${product.name}`;
            return (
              <Tr key={product.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <CellStack title={label} />
                    <DisabledBadge item={product} catalogue={load.data!} />
                  </span>
                </Td>
                <Td>
                  <CellStack
                    title={sub?.name ?? "Not specified"}
                    sub={sub ? load.data?.categoriesById.get(sub.productCategoryId)?.name : undefined}
                  />
                </Td>
                <Td align="right" className="font-mono">
                  {capacity ?? <span className="font-sans italic text-disabled-text">Not specified</span>}
                </Td>
                <Td>
                  <RowActions
                    primaryLabel="Edit"
                    label={label}
                    blocked={blocked}
                    onPrimary={() => setDialog({ kind: "product", product })}
                    items={[
                      {
                        key: "disable",
                        label: product.disabledAt ? "Enable product" : "Disable product",
                        icon: product.disabledAt ? "success" : "retire",
                        hint:
                          blocked ??
                          (product.disabledAt
                            ? "It can be picked when registering machines again."
                            : "Hidden when registering machines. Existing machines keep it."),
                        disabled: Boolean(blocked),
                        separatorBefore: true,
                        onSelect: () => setToggleTarget(product),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    );
  })();

  return (
    <>
      <Panel
        title="Product catalogue"
        count={load.data ? total : undefined}
        subtitle="shared by every rental company"
        icon="catalogue"
        padding="none"
        actions={
          <Button
            size="sm"
            icon="plus"
            disabled={!load.data || Boolean(newBlocked)}
            title={newBlocked ?? undefined}
            onClick={() =>
              setDialog(
                level === "categories"
                  ? { kind: "category" }
                  : level === "subcategories"
                    ? { kind: "subcategory", fixedCategoryId: categoryFilter || undefined }
                    : { kind: "product" },
              )
            }
          >
            {newLabel}
          </Button>
        }
      >
        <TableToolbar>
          <SegmentedControl
            label="Catalogue level"
            value={level}
            onChange={(value) => set({ level: value === "categories" ? null : value })}
            options={[
              { value: "categories", label: "Categories" },
              { value: "subcategories", label: "Subcategories" },
              { value: "products", label: "Products" },
            ]}
          />
          <Input
            size="sm"
            aria-label={`Search ${level}`}
            placeholder={`Search ${level}`}
            className="w-full max-w-[260px]"
            value={search.value}
            onChange={(event) => search.setValue(event.target.value)}
            suffix={search.pending ? "Searching…" : undefined}
            hideOptional
          />
          {level !== "categories" && load.data && (
            <Select
              size="sm"
              aria-label="Category"
              className="w-[190px]"
              value={categoryFilter}
              onChange={(event) => set({ category: event.target.value || null })}
              options={[{ value: "", label: "All categories" }, ...load.data.categories.map((c) => ({ value: c.id, label: c.name }))]}
              hideOptional
            />
          )}
          {filtersActive && (
            <Button variant="tertiary" size="sm" icon="close" onClick={clear}>
              Clear filters
            </Button>
          )}
        </TableToolbar>
        {body}
        {load.data && total > PAGE_SIZE && (
          <TableFooter>
            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={(next) => set({ page: next > 1 ? next : null })}
              total={total}
              pageSize={PAGE_SIZE}
              noun={level}
            />
          </TableFooter>
        )}
      </Panel>
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        Codes can&apos;t be changed once created. Nothing is ever removed: a disabled item, and everything inside a
        disabled category or subcategory, is hidden from pickers, while machines, requirements and quotations already
        using it keep working.
      </p>

      {toggleTarget && (
        <ConfirmDialog
          open
          onClose={() => setToggleTarget(null)}
          onConfirm={toggleDisabled}
          title={`${toggleTarget.disabledAt ? "Enable" : "Disable"} ${toggleTarget.manufacturer} ${toggleTarget.name}?`}
          icon={toggleTarget.disabledAt ? "success" : "retire"}
          tone={toggleTarget.disabledAt ? "success" : "danger"}
          consequences={
            toggleTarget.disabledAt
              ? ["Rental companies can pick it when registering machines again."]
              : [
                  "Rental companies can't register new machines against it.",
                  "Machines and rentals already using it keep it and still show its name.",
                  "Nothing is deleted. Enabling it restores it as it was.",
                ]
          }
          confirmLabel={toggleTarget.disabledAt ? "Enable product" : "Disable product"}
          confirmVariant={toggleTarget.disabledAt ? "primary" : "danger"}
          cancelLabel={toggleTarget.disabledAt ? "Keep disabled" : "Keep enabled"}
          busy={action.busy}
          busyLabel={toggleTarget.disabledAt ? "Enabling…" : "Disabling…"}
          confirmDisabled={offline}
        />
      )}

      {load.data && taxonomyTarget && (
        <TaxonomyToggleDialog
          target={taxonomyTarget}
          catalogue={load.data}
          action={action}
          setDisabled={(disabled) =>
            taxonomyTarget.kind === "category"
              ? adminApiClient.setCategoryDisabled(taxonomyTarget.item.id, disabled)
              : adminApiClient.setSubcategoryDisabled(taxonomyTarget.item.id, disabled)
          }
          onClose={() => setTaxonomyTarget(null)}
          onChanged={() => void load.reload()}
        />
      )}

      {load.data && (
        <>
          <CategoryFormDialog
            open={dialog?.kind === "category"}
            onClose={() => setDialog(null)}
            writer={staffCatalogueWriter}
            category={dialog?.kind === "category" ? dialog.category : undefined}
            existingCategories={load.data.categories}
            onSaved={() => void load.reload()}
          />
          <SubcategoryFormDialog
            open={dialog?.kind === "subcategory"}
            onClose={() => setDialog(null)}
            writer={staffCatalogueWriter}
            categories={load.data.categories}
            subcategory={dialog?.kind === "subcategory" ? dialog.subcategory : undefined}
            fixedCategoryId={dialog?.kind === "subcategory" ? dialog.fixedCategoryId : undefined}
            existingSubcategories={load.data.subcategories}
            onSaved={() => void load.reload()}
          />
          <ProductFormDialog
            open={dialog?.kind === "product"}
            onClose={() => setDialog(null)}
            writer={staffCatalogueWriter}
            subcategories={load.data.subcategories}
            categoriesById={load.data.categoriesById}
            product={dialog?.kind === "product" ? dialog.product : undefined}
            fixedSubcategoryId={dialog?.kind === "product" ? dialog.fixedSubcategoryId : undefined}
            existingProducts={load.data.products}
            onSaved={() => void load.reload()}
          />
        </>
      )}
    </>
  );
}

function RowActions({
  primaryLabel,
  label,
  blocked,
  onPrimary,
  items,
}: {
  primaryLabel: string;
  label: string;
  blocked: string | null;
  onPrimary: () => void;
  items: MenuItem[];
}) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={onPrimary}
        disabled={Boolean(blocked)}
        title={blocked ?? undefined}
        aria-label={`${primaryLabel} ${label}`}
      >
        {primaryLabel}
      </Button>
      <Menu label={`More actions for ${label}`} items={items} triggerSize="sm" width={300} />
    </span>
  );
}
