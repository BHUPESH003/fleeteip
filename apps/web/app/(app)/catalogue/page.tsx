"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";
import { CatalogueFormDialog } from "./AdminDialogs";
import { formatCapacity } from "./shared";

interface Loaded {
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
  products: Product[];
  machines: Machine[];
}

type TabKey = "categories" | "subcategories" | "products";

export default function CataloguePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("catalogue.manage");
  // Machine counts are enrichment, not the point of this page (browsing the
  // catalogue needs no permission at all) — a role without equipment.manage
  // still gets the full catalogue, just without the "in your fleet" counts
  // (already handled: `machines` empty → counts fall back to 0). Gating the
  // fetch itself also skips a request that would 403.
  const canListMachines = hasPermission("equipment.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("categories");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  async function load(orgId: string) {
    const [categories, products, machines] = await Promise.all([
      apiClient.listProductCategories() as Promise<ProductCategory[]>,
      apiClient.listProducts() as Promise<Product[]>,
      canListMachines ? (apiClient.listMachines(orgId) as Promise<Machine[]>) : Promise.resolve([]),
    ]);
    // Bounded fan-out over categories (a handful, platform-wide), same
    // pattern already used by machines/page.tsx — not a per-machine
    // N+1 loop.
    const subcategoryLists = await Promise.all(
      categories.map(
        (c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>,
      ),
    );
    setData({ categories, subcategories: subcategoryLists.flat(), products, machines });
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        await load(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalogue");
      }
    })();
  }, [organizationId, canListMachines]);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setCreateError(null);
    const form = new FormData(event.currentTarget);
    setCreateSubmitting(true);
    try {
      if (tab === "categories") {
        await apiClient.createProductCategory(organizationId, {
          name: String(form.get("name") ?? ""),
          code: String(form.get("code") ?? "").toUpperCase(),
        });
      } else if (tab === "subcategories") {
        await apiClient.createProductSubcategory(organizationId, {
          productCategoryId: String(form.get("productCategoryId") ?? ""),
          name: String(form.get("name") ?? ""),
          code: String(form.get("code") ?? "").toUpperCase(),
        });
      } else {
        const capacity = form.get("capacity");
        const capacityUnit = form.get("capacityUnit");
        await apiClient.createProduct(organizationId, {
          productSubcategoryId: String(form.get("productSubcategoryId") ?? ""),
          name: String(form.get("name") ?? ""),
          manufacturer: String(form.get("manufacturer") ?? ""),
          ...(capacity ? { capacity: Number(capacity) } : {}),
          ...(capacityUnit
            ? { capacityUnit: capacityUnit as NonNullable<Product["capacityUnit"]> }
            : {}),
        });
      }
      setCreateOpen(false);
      await load(organizationId);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const categoryById = useMemo(
    () => new Map((data?.categories ?? []).map((c) => [c.id, c])),
    [data],
  );
  const subcategoryById = useMemo(
    () => new Map((data?.subcategories ?? []).map((s) => [s.id, s])),
    [data],
  );

  const filteredCategories = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.categories.filter((c) => !q || `${c.name} ${c.code}`.toLowerCase().includes(q));
  }, [data, search]);

  const filteredSubcategories = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.subcategories.filter((s) => {
      if (categoryFilter && s.productCategoryId !== categoryFilter) return false;
      return !q || `${s.name} ${s.code}`.toLowerCase().includes(q);
    });
  }, [data, search, categoryFilter]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.products.filter((p) => {
      const subcategory = subcategoryById.get(p.productSubcategoryId);
      if (categoryFilter && subcategory?.productCategoryId !== categoryFilter) return false;
      return !q || `${p.name} ${p.manufacturer}`.toLowerCase().includes(q);
    });
  }, [data, search, categoryFilter, subcategoryById]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading catalogue…" />;

  const { categories, subcategories, products, machines } = data;

  const tabs = [
    { key: "categories", label: `Categories (${categories.length})` },
    { key: "subcategories", label: `Subcategories (${subcategories.length})` },
    { key: "products", label: `Products (${products.length})` },
  ];

  const createLabel =
    tab === "categories"
      ? "New category"
      : tab === "subcategories"
        ? "New subcategory"
        : "New product";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Catalogue"
        description="Platform product catalogue — category → subcategory → product. Shared across every rental company; machines are registered against these products, not the other way round."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            title={
              canManage
                ? undefined
                : "Requires catalogue.manage (Rental Company organizations only)"
            }
          >
            {createLabel}
          </Button>
        }
      />

      <Tabs items={tabs} active={tab} onChange={(key) => setTab(key as TabKey)} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={
            tab === "categories"
              ? "Search categories…"
              : tab === "subcategories"
                ? "Search subcategories…"
                : "Product name, manufacturer…"
          }
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {tab !== "categories" && (
          <Select
            className="w-48"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: "", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}
      </div>

      {tab === "categories" &&
        (filteredCategories.length === 0 ? (
          <EmptyState title="No categories match this search" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th>Code</Th>
                <Th>Subcategories</Th>
                <Th>Products</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filteredCategories.map((category) => {
                const subs = subcategories.filter((s) => s.productCategoryId === category.id);
                const productCount = products.filter((p) =>
                  subs.some((s) => s.id === p.productSubcategoryId),
                ).length;
                return (
                  <Tr key={category.id}>
                    <Td className="font-medium text-ink">{category.name}</Td>
                    <Td className="font-mono">{category.code}</Td>
                    <Td>{subs.length}</Td>
                    <Td>{productCount}</Td>
                    <Td>
                      <Link
                        href={`/catalogue/categories/${category.id}`}
                        className="text-xs font-medium text-accent-text"
                      >
                        Open
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ))}

      {tab === "subcategories" &&
        (filteredSubcategories.length === 0 ? (
          <EmptyState title="No subcategories match these filters" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Subcategory</Th>
                <Th>Code</Th>
                <Th>Category</Th>
                <Th>Products</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filteredSubcategories.map((subcategory) => (
                <Tr key={subcategory.id}>
                  <Td className="font-medium text-ink">{subcategory.name}</Td>
                  <Td className="font-mono">{subcategory.code}</Td>
                  <Td>{categoryById.get(subcategory.productCategoryId)?.name ?? "—"}</Td>
                  <Td>
                    {products.filter((p) => p.productSubcategoryId === subcategory.id).length}
                  </Td>
                  <Td>
                    <Link
                      href={`/catalogue/subcategories/${subcategory.id}`}
                      className="text-xs font-medium text-accent-text"
                    >
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ))}

      {tab === "products" &&
        (filteredProducts.length === 0 ? (
          <EmptyState title="No products match these filters" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>Manufacturer</Th>
                <Th>Subcategory</Th>
                <Th>Capacity</Th>
                <Th>In your fleet</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filteredProducts.map((product) => {
                const subcategory = subcategoryById.get(product.productSubcategoryId);
                const ownCount = machines.filter((m) => m.productId === product.id).length;
                return (
                  <Tr key={product.id}>
                    <Td className="font-medium text-ink">{product.name}</Td>
                    <Td>{product.manufacturer}</Td>
                    <Td>{subcategory?.name ?? "—"}</Td>
                    <Td className="font-mono">{formatCapacity(product)}</Td>
                    <Td className="font-mono">{ownCount}</Td>
                    <Td>
                      <Link
                        href={`/catalogue/products/${product.id}`}
                        className="text-xs font-medium text-accent-text"
                      >
                        Open
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ))}

      <p className="text-xs text-meta-light">
        Machine counts above are your organization&apos;s own registered machines only — there is no
        platform-wide product→machine lookup yet (see the frontend/backend gap report). No
        active/inactive state is shown: the catalogue tables have no such column today.
      </p>

      <CatalogueFormDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
        title={createLabel}
        submitLabel={createLabel}
        canManage={canManage}
        onSubmit={handleCreateSubmit}
        submitting={createSubmitting}
        error={createError}
      >
        {tab === "categories" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Category name" name="name" placeholder="e.g. Cranes" required />
            <Input label="Code" name="code" placeholder="e.g. CRN" required />
          </div>
        )}
        {tab === "subcategories" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Category"
              name="productCategoryId"
              required
              options={[
                { value: "", label: "Select…" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Input label="Subcategory name" name="name" placeholder="e.g. Mobile crane" required />
            <Input label="Code" name="code" placeholder="e.g. MCR" required />
          </div>
        )}
        {tab === "products" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Subcategory"
              name="productSubcategoryId"
              required
              options={[
                { value: "", label: "Select…" },
                ...subcategories.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Input label="Product name" name="name" required />
            <Input label="Manufacturer" name="manufacturer" required />
            <Input label="Capacity" name="capacity" type="number" />
            <Select
              label="Capacity unit"
              name="capacityUnit"
              options={[
                { value: "", label: "—" },
                ...["Ton", "M³", "Meter", "Kgs", "KnM", "kVA"].map((u) => ({ value: u, label: u })),
              ]}
            />
          </div>
        )}
      </CatalogueFormDialog>
    </div>
  );
}
