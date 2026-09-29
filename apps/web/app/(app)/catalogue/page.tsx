"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import {
  Button,
  Card,
  CellStack,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  TabPanel,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  type MenuItem,
  type SortDirection,
} from "@fleetip/ui";
import { useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { categoryIcon } from "../../../lib/category-icon";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT, describeError } from "../../../lib/errors";
import { formatNumber } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { useUrlSearch, useUrlState } from "../../../lib/url-state";
import { optional, useLoad } from "../../../lib/use-load";
import { RegisterMachineDialog } from "../machines/RegisterMachineDialog";
import { CategoryFormDialog, ProductFormDialog, SubcategoryFormDialog } from "./AdminDialogs";
import {
  DisabledBadge,
  ProductToggleDialog,
  RowActions,
  TaxonomyToggleDialog,
  productToggleItem,
  taxonomyToggleItem,
  type TaxonomyTarget,
} from "./parts";
import { formatCapacity, loadCatalogue, machineCountsByProduct, tenantCatalogueWriter, type CatalogueIndex } from "./shared";

type TabKey = "categories" | "subcategories" | "products";
const TAB_KEYS: TabKey[] = ["categories", "subcategories", "products"];
const PAGE_SIZE = 25;

interface Loaded extends CatalogueIndex {
  /** Own-fleet machines per product (empty without equipment.manage). */
  machineCounts: Map<string, number>;
}

type DialogState =
  | { kind: "category"; category?: ProductCategory }
  | { kind: "subcategory"; subcategory?: ProductSubcategory; fixedCategoryId?: string }
  | { kind: "product"; product?: Product; fixedSubcategoryId?: string }
  | { kind: "register"; product: Product; subcategory: ProductSubcategory | undefined }
  | { kind: "toggle"; product: Product }
  | { kind: "taxonomy"; target: TaxonomyTarget };

export default function CataloguePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("catalogue.manage");
  // Machine counts are enrichment, not the point of this page (browsing the
  // catalogue needs no permission at all) — a role without equipment.manage
  // still gets the full catalogue, just without the "in your fleet" column.
  // Gating the fetch itself also skips a request that would 403.
  const canListMachines = hasPermission("equipment.manage");
  const canRegister = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.rental_company && canListMachines;
  const { online } = useConnection();

  const { get, set } = useUrlState("catalogue");
  const search = useUrlSearch("q", get, set);
  const tabParam = get("tab", "categories");
  const tab: TabKey = (TAB_KEYS as string[]).includes(tabParam) ? (tabParam as TabKey) : "categories";
  const categoryFilter = get("category");
  const subcategoryFilter = get("subcategory");
  // Search starts at 2 characters (table rules: debounced, minimum 2).
  const rawQuery = get("q").trim().toLowerCase();
  const query = rawQuery.length >= 2 ? rawQuery : "";
  // Every tab sorts by name unless ?sort= says otherwise.
  const sortKey = get("sort") || "name";
  const sortDir: "asc" | "desc" = get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const writer = useMemo(() => (organizationId ? tenantCatalogueWriter(organizationId) : null), [organizationId]);

  const { data, error, loading, reload } = useLoad<Loaded>(
    async () => {
      const [catalogue, machines] = await Promise.all([
        loadCatalogue(),
        optional(canListMachines, () => apiClient.listMachines(organizationId!), [] as Machine[]),
      ]);
      return { ...catalogue, machineCounts: machineCountsByProduct(machines) };
    },
    [organizationId, canListMachines],
    Boolean(organizationId),
  );

  function sortProps(key: string, defaultDir: "asc" | "desc" = "asc") {
    const active = sortKey === key;
    return {
      sortDirection: (active ? sortDir : null) as SortDirection,
      onSort: () =>
        set({ sort: key, dir: active ? (sortDir === "asc" ? "desc" : "asc") : defaultDir }),
    };
  }

  const filtersActive = Boolean(query || (tab !== "categories" && (categoryFilter || subcategoryFilter)));
  const clearFilters = () => {
    search.setValue("");
    set({ q: null, category: null, subcategory: null });
  };

  // ---- derived rows
  const view = useMemo(() => {
    if (!data) return null;
    const { categories, subcategories, products, categoriesById, subcategoriesById, machineCounts } = data;
    const productsBySub = new Map<string, Product[]>();
    for (const product of products) {
      productsBySub.set(product.productSubcategoryId, [...(productsBySub.get(product.productSubcategoryId) ?? []), product]);
    }
    const subsByCategory = new Map<string, ProductSubcategory[]>();
    for (const sub of subcategories) {
      subsByCategory.set(sub.productCategoryId, [...(subsByCategory.get(sub.productCategoryId) ?? []), sub]);
    }
    const fleetForProducts = (list: Product[]) => list.reduce((sum, p) => sum + (machineCounts.get(p.id) ?? 0), 0);
    const categoryRows = categories.map((category) => {
      const subs = subsByCategory.get(category.id) ?? [];
      const prods = subs.flatMap((s) => productsBySub.get(s.id) ?? []);
      return { category, subcategoryCount: subs.length, productCount: prods.length, fleet: fleetForProducts(prods) };
    });
    const subcategoryRows = subcategories.map((subcategory) => {
      const prods = productsBySub.get(subcategory.id) ?? [];
      return {
        subcategory,
        category: categoriesById.get(subcategory.productCategoryId) ?? null,
        productCount: prods.length,
        fleet: fleetForProducts(prods),
      };
    });
    const productRows = products.map((product) => {
      const subcategory = subcategoriesById.get(product.productSubcategoryId) ?? null;
      return {
        product,
        subcategory,
        category: subcategory ? (categoriesById.get(subcategory.productCategoryId) ?? null) : null,
        fleet: machineCounts.get(product.id) ?? 0,
      };
    });
    return { categoryRows, subcategoryRows, productRows, fleetForProducts, productsBySub, subsByCategory };
  }, [data]);

  const categoryName = categoryFilter ? data?.categoriesById.get(categoryFilter)?.name : undefined;
  const subcategoryName = subcategoryFilter ? data?.subcategoriesById.get(subcategoryFilter)?.name : undefined;

  function applySort<T>(rows: T[], accessors: Record<string, (row: T) => string | number>, fallback: string): T[] {
    const accessor = accessors[sortKey] ?? accessors[fallback];
    if (!accessor) return rows;
    const factor = accessors[sortKey] && sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = accessor(a);
      const y = accessor(b);
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return cmp * factor;
    });
  }

  const filteredCategories = view
    ? applySort(
        view.categoryRows.filter((row) => !query || `${row.category.name} ${row.category.code}`.toLowerCase().includes(query)),
        {
          name: (r) => r.category.name,
          code: (r) => r.category.code,
          subcategories: (r) => r.subcategoryCount,
          products: (r) => r.productCount,
          fleet: (r) => r.fleet,
        },
        "name",
      )
    : [];
  const filteredSubcategories = view
    ? applySort(
        view.subcategoryRows.filter((row) => {
          if (categoryFilter && row.subcategory.productCategoryId !== categoryFilter) return false;
          return !query || `${row.subcategory.name} ${row.subcategory.code} ${row.category?.name ?? ""}`.toLowerCase().includes(query);
        }),
        {
          name: (r) => r.subcategory.name,
          code: (r) => r.subcategory.code,
          category: (r) => r.category?.name ?? "",
          products: (r) => r.productCount,
          fleet: (r) => r.fleet,
        },
        "name",
      )
    : [];
  const filteredProducts = view
    ? applySort(
        view.productRows.filter((row) => {
          if (categoryFilter && row.subcategory?.productCategoryId !== categoryFilter) return false;
          if (subcategoryFilter && row.product.productSubcategoryId !== subcategoryFilter) return false;
          return (
            !query ||
            `${row.product.manufacturer} ${row.product.name} ${row.subcategory?.name ?? ""} ${row.category?.name ?? ""}`
              .toLowerCase()
              .includes(query)
          );
        }),
        {
          name: (r) => `${r.product.manufacturer} ${r.product.name}`,
          subcategory: (r) => `${r.category?.name ?? ""} ${r.subcategory?.name ?? ""}`,
          capacity: (r) => r.product.capacity ?? -1,
          fleet: (r) => r.fleet,
        },
        "name",
      )
    : [];

  const total =
    tab === "categories" ? filteredCategories.length : tab === "subcategories" ? filteredSubcategories.length : filteredProducts.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageSlice = <T,>(rows: T[]) => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ---- header primary: one per tab, catalogue.manage only
  const noCategories = Boolean(data && data.categories.length === 0);
  const noSubcategories = Boolean(data && data.subcategories.length === 0);
  const primary =
    canManage && data
      ? tab === "categories"
        ? { label: "New category", onClick: () => setDialog({ kind: "category" }), blocked: null }
        : tab === "subcategories"
          ? {
              label: "New subcategory",
              onClick: () => setDialog({ kind: "subcategory", fixedCategoryId: categoryFilter || undefined }),
              blocked: noCategories ? "Create a category first." : null,
            }
          : {
              label: "New product",
              onClick: () => setDialog({ kind: "product", fixedSubcategoryId: subcategoryFilter || undefined }),
              blocked: noSubcategories ? "Create a subcategory first." : null,
            }
      : null;

  const tabs = [
    { key: "categories", label: "Categories", count: data?.categories.length },
    { key: "subcategories", label: "Subcategories", count: data?.subcategories.length },
    { key: "products", label: "Products", count: data?.products.length },
  ];

  const noun = tab === "categories" ? "categories" : tab === "subcategories" ? "subcategories" : "products";
  const searchPlaceholder =
    tab === "categories" ? "Search name or code" : tab === "subcategories" ? "Search name, code or category" : "Search product, maker or subcategory";

  function categoryMenu(category: ProductCategory): MenuItem[] {
    const offline = !online;
    return [
      { key: "rename", label: "Rename category", icon: "edit", hint: offline ? OFFLINE_HINT : "The code stays the same.", disabled: offline, onSelect: () => setDialog({ kind: "category", category }) },
      { key: "add-sub", label: "Add subcategory", icon: "plus", hint: offline ? OFFLINE_HINT : `Inside ${category.name}.`, disabled: offline, onSelect: () => setDialog({ kind: "subcategory", fixedCategoryId: category.id }) },
      taxonomyToggleItem({ kind: "category", item: category }, offline, () => setDialog({ kind: "taxonomy", target: { kind: "category", item: category } })),
    ];
  }

  function subcategoryMenu(subcategory: ProductSubcategory): MenuItem[] {
    const offline = !online;
    return [
      { key: "rename", label: "Rename subcategory", icon: "edit", hint: offline ? OFFLINE_HINT : "The code stays the same.", disabled: offline, onSelect: () => setDialog({ kind: "subcategory", subcategory }) },
      { key: "add-product", label: "Add product", icon: "plus", hint: offline ? OFFLINE_HINT : `Inside ${subcategory.name}.`, disabled: offline, onSelect: () => setDialog({ kind: "product", fixedSubcategoryId: subcategory.id }) },
      taxonomyToggleItem({ kind: "subcategory", item: subcategory }, offline, () =>
        setDialog({ kind: "taxonomy", target: { kind: "subcategory", item: subcategory } }),
      ),
    ];
  }

  function productMenu(product: Product, subcategory: ProductSubcategory | null): MenuItem[] {
    const offline = !online;
    const items: MenuItem[] = [];
    if (canRegister) {
      items.push({
        key: "register",
        label: "Register as machine",
        icon: "machine",
        hint: offline ? OFFLINE_HINT : product.disabledBy ? "Disabled products can't be registered." : "Adds a machine of this product to your fleet.",
        disabled: offline || Boolean(product.disabledBy),
        onSelect: () => setDialog({ kind: "register", product, subcategory: subcategory ?? undefined }),
      });
    }
    if (canManage) {
      items.push({ key: "edit", label: "Edit product", icon: "edit", hint: offline ? OFFLINE_HINT : "Name, maker, capacity and specifications.", disabled: offline, onSelect: () => setDialog({ kind: "product", product }) });
      items.push(productToggleItem(product, offline, () => setDialog({ kind: "toggle", product })));
    }
    return items;
  }

  const fleetHeader = canListMachines ? (
    <Th align="right" {...sortProps("fleet", "desc")}>
      In your fleet
    </Th>
  ) : null;
  const singular = tab === "categories" ? "category" : tab === "subcategories" ? "subcategory" : "product";

  function firstRunEmpty() {
    const copy =
      tab === "categories"
        ? { title: "The catalogue has no categories yet", action: canManage ? "Create the first category" : null, kind: "category" as const }
        : tab === "subcategories"
          ? { title: "No subcategories yet", action: canManage && !noCategories ? "Create a subcategory" : null, kind: "subcategory" as const }
          : { title: "No products yet", action: canManage && !noSubcategories ? "Create a product" : null, kind: "product" as const };
    return (
      <EmptyState
        variant="page"
        icon="catalogue"
        title={copy.title}
        description={
          canManage
            ? "Machines are registered against catalogue products, so start with a category, then its subcategories and products."
            : "Entries appear here once someone with the Catalogue permission adds them."
        }
        action={
          copy.action ? (
            <Button icon="plus" disabled={!online} title={!online ? OFFLINE_HINT : undefined} onClick={() => setDialog({ kind: copy.kind })}>
              {copy.action}
            </Button>
          ) : undefined
        }
      />
    );
  }

  function filteredEmpty() {
    const scope = [query ? `“${get("q")}”` : null, categoryName, tab === "products" ? subcategoryName : null].filter(Boolean).join(" · ");
    return (
      <EmptyState
        title={`No ${noun} match ${scope || "these filters"}`}
        description="Check the spelling, or clear the filters to see the whole list."
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  const tableBody = (() => {
    if (!data || !view) return null;
    if (tab === "categories") {
      if (data.categories.length === 0) return firstRunEmpty();
      if (filteredCategories.length === 0) return filteredEmpty();
      return (
        <Table bare minWidth={640} caption="Catalogue categories">
          <Thead>
            <Tr>
              <Th {...sortProps("name")}>Category</Th>
              <Th {...sortProps("code")}>Code</Th>
              <Th align="right" {...sortProps("subcategories", "desc")}>Subcategories</Th>
              <Th align="right" {...sortProps("products", "desc")}>Products</Th>
              {fleetHeader}
              <Th className="w-[1%]">
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {pageSlice(filteredCategories).map(({ category, subcategoryCount, productCount, fleet }) => (
              <Tr key={category.id} interactive>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <Icon name={categoryIcon(category)} size={16} className="text-tile-icon" />
                    <CellStack
                      title={
                        <UILink href={`/catalogue/categories/${category.id}`} title={category.name} className="text-ink-strong no-underline hover:underline">
                          {category.name}
                        </UILink>
                      }
                    />
                    <DisabledBadge item={category} catalogue={data} />
                  </span>
                </Td>
                <Td className="font-mono text-xs font-medium">{category.code}</Td>
                <Td align="right" className="font-mono">{formatNumber(subcategoryCount, 0)}</Td>
                <Td align="right" className="font-mono">{formatNumber(productCount, 0)}</Td>
                {canListMachines && <Td align="right" className="font-mono">{formatNumber(fleet, 0)}</Td>}
                <Td>
                  <RowActions
                    href={`/catalogue/categories/${category.id}`}
                    label={category.name}
                    items={canManage ? categoryMenu(category) : []}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      );
    }
    if (tab === "subcategories") {
      if (data.subcategories.length === 0) return firstRunEmpty();
      if (filteredSubcategories.length === 0) return filteredEmpty();
      return (
        <Table bare minWidth={680} caption="Catalogue subcategories">
          <Thead>
            <Tr>
              <Th {...sortProps("name")}>Subcategory</Th>
              <Th {...sortProps("code")}>Code</Th>
              <Th {...sortProps("category")}>Category</Th>
              <Th align="right" {...sortProps("products", "desc")}>Products</Th>
              {fleetHeader}
              <Th className="w-[1%]">
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {pageSlice(filteredSubcategories).map(({ subcategory, category, productCount, fleet }) => (
              <Tr key={subcategory.id} interactive>
                <Td>
                  <span className="flex items-center gap-2">
                    <CellStack
                      title={
                        <UILink href={`/catalogue/subcategories/${subcategory.id}`} title={subcategory.name} className="text-ink-strong no-underline hover:underline">
                          {subcategory.name}
                        </UILink>
                      }
                    />
                    <DisabledBadge item={subcategory} catalogue={data} />
                  </span>
                </Td>
                <Td className="font-mono text-xs font-medium">{subcategory.code}</Td>
                <Td>
                  {category ? (
                    <span className="inline-flex items-center gap-2">
                      <Icon name={categoryIcon(category)} size={16} className="text-tile-icon" />
                      {category.name}
                    </span>
                  ) : (
                    <span className="italic text-disabled-text">Not specified</span>
                  )}
                </Td>
                <Td align="right" className="font-mono">{formatNumber(productCount, 0)}</Td>
                {canListMachines && <Td align="right" className="font-mono">{formatNumber(fleet, 0)}</Td>}
                <Td>
                  <RowActions
                    href={`/catalogue/subcategories/${subcategory.id}`}
                    label={subcategory.name}
                    items={canManage ? subcategoryMenu(subcategory) : []}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      );
    }
    if (data.products.length === 0) return firstRunEmpty();
    if (filteredProducts.length === 0) return filteredEmpty();
    return (
      <Table bare minWidth={720} caption="Catalogue products">
        <Thead>
          <Tr>
            <Th {...sortProps("name")}>Product</Th>
            <Th {...sortProps("subcategory")}>Subcategory</Th>
            <Th align="right" {...sortProps("capacity", "desc")}>Rated capacity</Th>
            {fleetHeader}
            <Th className="w-[1%]">
              <span className="sr-only">Actions</span>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {pageSlice(filteredProducts).map(({ product, subcategory, category, fleet }) => {
            const capacity = formatCapacity(product);
            const label = `${product.manufacturer} ${product.name}`;
            return (
              <Tr key={product.id} interactive>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <Icon name={categoryIcon(category)} size={16} className="text-tile-icon" />
                    <CellStack
                      title={
                        <UILink href={`/catalogue/products/${product.id}`} title={label} className="text-ink-strong no-underline hover:underline">
                          {label}
                        </UILink>
                      }
                    />
                    <DisabledBadge item={product} catalogue={data} />
                  </span>
                </Td>
                <Td>
                  <CellStack title={subcategory?.name ?? "Not specified"} sub={category?.name} />
                </Td>
                <Td align="right" className="font-mono">
                  {capacity ?? <span className="font-sans italic text-disabled-text">Not specified</span>}
                </Td>
                {canListMachines && <Td align="right" className="font-mono">{formatNumber(fleet, 0)}</Td>}
                <Td>
                  <RowActions href={`/catalogue/products/${product.id}`} label={label} items={productMenu(product, subcategory)} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    );
  })();

  const subcategoryOptions = data
    ? data.subcategories
        .filter((s) => !categoryFilter || s.productCategoryId === categoryFilter)
        .map((s) => ({ value: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Catalogue"
        description="The shared list of equipment every rental company on FleetIP registers machines against: categories, their subcategories, and the products in each."
        actions={
          primary ? (
            <Button
              icon="plus"
              onClick={primary.onClick}
              disabled={!online || Boolean(primary.blocked)}
              title={!online ? OFFLINE_HINT : (primary.blocked ?? undefined)}
            >
              {primary.label}
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <Card padding="none" className="overflow-hidden">
          <Tabs
            variant="card"
            label="Catalogue level"
            idBase="catalogue"
            items={tabs}
            active={tab}
            onChange={(key) => set({ tab: key === "categories" ? null : key, sort: null, dir: null })}
          />
          <TableToolbar>
            <Input
              size="sm"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              className="w-full max-w-[300px]"
              value={search.value}
              onChange={(event) => search.setValue(event.target.value)}
              suffix={search.pending ? "Searching…" : undefined}
              hideOptional
            />
            {tab !== "categories" && data && (
              <Select
                size="sm"
                aria-label="Category"
                className="w-[200px]"
                value={categoryFilter}
                onChange={(event) => set({ category: event.target.value || null, subcategory: null })}
                options={[{ value: "", label: "All categories" }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]}
                hideOptional
              />
            )}
            {tab === "products" && data && (
              <Select
                size="sm"
                aria-label="Subcategory"
                className="w-[200px]"
                value={subcategoryFilter}
                onChange={(event) => set({ subcategory: event.target.value || null })}
                options={[{ value: "", label: "All subcategories" }, ...subcategoryOptions]}
                hideOptional
              />
            )}
            {filtersActive && (
              <Button variant="tertiary" size="sm" icon="close" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
            {data && (
              <span className="ml-auto text-xs text-meta" aria-live="polite">
                <span className="font-mono">{formatNumber(total, 0)}</span> {total === 1 ? singular : noun}
                {filtersActive ? " match" : ""}
              </span>
            )}
          </TableToolbar>
          <TabPanel idBase="catalogue" tabKey={tab}>
            {error ? (
              <div className="p-4">
                <ErrorState
                  title="The catalogue didn't load"
                  message={describeError(error).body}
                  action={
                    <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                      Try again
                    </Button>
                  }
                />
              </div>
            ) : loading || !data ? (
              <Table bare minWidth={640} caption="Loading catalogue">
                <Thead>
                  <Tr>
                    <Th>{tab === "categories" ? "Category" : tab === "subcategories" ? "Subcategory" : "Product"}</Th>
                    <Th>{tab === "products" ? "Subcategory" : "Code"}</Th>
                    <Th align="right">{tab === "products" ? "Rated capacity" : tab === "categories" ? "Subcategories" : "Products"}</Th>
                    <Th align="right">{tab === "categories" ? "Products" : ""}</Th>
                    <Th />
                  </Tr>
                </Thead>
                <TableSkeleton columns={5} label="Loading catalogue" />
              </Table>
            ) : (
              tableBody
            )}
          </TabPanel>
          {data && total > PAGE_SIZE && (
            <TableFooter>
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                onPageChange={(next) => set({ page: next > 1 ? next : null })}
                total={total}
                pageSize={PAGE_SIZE}
                noun={noun}
              />
            </TableFooter>
          )}
        </Card>
        {canListMachines && (
          <p className="m-0 text-[11px] leading-[1.5] text-meta-light">
            “In your fleet” counts your organization&apos;s own machines. FleetIP doesn&apos;t count other rental companies&apos;
            machines per product.
          </p>
        )}
      </PageBody>

      {writer && data && (
        <>
          <CategoryFormDialog
            open={dialog?.kind === "category"}
            onClose={() => setDialog(null)}
            writer={writer}
            category={dialog?.kind === "category" ? dialog.category : undefined}
            existingCategories={data.categories}
            affectedMachines={
              canListMachines && dialog?.kind === "category" && dialog.category && view
                ? view.fleetForProducts((view.subsByCategory.get(dialog.category.id) ?? []).flatMap((s) => view.productsBySub.get(s.id) ?? []))
                : null
            }
            onSaved={() => void reload()}
            openHref={(id) => `/catalogue/categories/${id}`}
          />
          <SubcategoryFormDialog
            open={dialog?.kind === "subcategory"}
            onClose={() => setDialog(null)}
            writer={writer}
            categories={data.categories}
            subcategory={dialog?.kind === "subcategory" ? dialog.subcategory : undefined}
            fixedCategoryId={dialog?.kind === "subcategory" ? dialog.fixedCategoryId : undefined}
            existingSubcategories={data.subcategories}
            affectedMachines={
              canListMachines && dialog?.kind === "subcategory" && dialog.subcategory && view
                ? view.fleetForProducts(view.productsBySub.get(dialog.subcategory.id) ?? [])
                : null
            }
            onSaved={() => void reload()}
            openHref={(id) => `/catalogue/subcategories/${id}`}
          />
          <ProductFormDialog
            open={dialog?.kind === "product"}
            onClose={() => setDialog(null)}
            writer={writer}
            subcategories={data.subcategories}
            categoriesById={data.categoriesById}
            product={dialog?.kind === "product" ? dialog.product : undefined}
            fixedSubcategoryId={dialog?.kind === "product" ? dialog.fixedSubcategoryId : undefined}
            existingProducts={data.products}
            affectedMachines={
              canListMachines && dialog?.kind === "product" && dialog.product ? (data.machineCounts.get(dialog.product.id) ?? 0) : null
            }
            onSaved={() => void reload()}
            openHref={(id) => `/catalogue/products/${id}`}
          />
        </>
      )}
      {organizationId && dialog?.kind === "toggle" && (
        <ProductToggleDialog organizationId={organizationId} product={dialog.product} onClose={() => setDialog(null)} onChanged={() => void reload()} />
      )}
      {organizationId && data && dialog?.kind === "taxonomy" && (
        <TaxonomyToggleDialog
          target={dialog.target}
          catalogue={data}
          setDisabled={(disabled) =>
            dialog.target.kind === "category"
              ? apiClient.setProductCategoryDisabled(organizationId, dialog.target.item.id, disabled)
              : apiClient.setProductSubcategoryDisabled(organizationId, dialog.target.item.id, disabled)
          }
          onClose={() => setDialog(null)}
          onChanged={() => void reload()}
        />
      )}
      {organizationId && dialog?.kind === "register" && (
        <RegisterMachineDialog
          open
          onClose={() => setDialog(null)}
          organizationId={organizationId}
          onRegistered={() => void reload()}
          initialCategoryId={dialog.subcategory?.productCategoryId}
          initialSubcategoryId={dialog.product.productSubcategoryId}
          initialProductId={dialog.product.id}
        />
      )}
    </div>
  );
}
