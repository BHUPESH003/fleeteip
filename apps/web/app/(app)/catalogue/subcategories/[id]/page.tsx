"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../../lib/api-client";
import { CatalogueConfirmDialog, CatalogueFormDialog } from "../../AdminDialogs";
import { formatCapacity } from "../../shared";

interface Loaded {
  subcategory: ProductSubcategory;
  category: ProductCategory | null;
  products: Product[];
}

export default function SubcategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const categories = (await apiClient.listProductCategories()) as ProductCategory[];
        // No get-subcategory-by-id endpoint — resolve it by fanning out over
        // categories (a handful, platform-wide), same bounded pattern as
        // machines/page.tsx and the catalogue overview.
        const subcategoryLists = await Promise.all(
          categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
        );
        const subcategory = subcategoryLists.flat().find((s) => s.id === id);
        if (!subcategory) {
          setError("Subcategory not found");
          return;
        }
        const products = (await apiClient.listProducts(id)) as Product[];
        setData({
          subcategory,
          category: categories.find((c) => c.id === subcategory.productCategoryId) ?? null,
          products,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subcategory");
      }
    })();
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading subcategory…" />;

  const { subcategory, category, products } = data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Catalogue", href: "/catalogue" },
          ...(category ? [{ label: category.name, href: `/catalogue/categories/${category.id}` }] : []),
          { label: subcategory.name },
        ]}
        title={subcategory.name}
        description={`${products.length} products`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)} title="Catalogue administration has no backend endpoint yet">
              Edit subcategory
            </Button>
            <Button onClick={() => setAddProductOpen(true)} title="Catalogue administration has no backend endpoint yet">
              Add product
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Name" value={subcategory.name} />
          <Field label="Code" value={subcategory.code} mono />
          <Field label="Category" value={category?.name ?? "—"} />
        </div>
      </Card>

      <Card padding={products.length === 0 ? "md" : "none"}>
        {products.length === 0 ? (
          <EmptyState title="No products yet" description="Add one above." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>Manufacturer</Th>
                <Th>Capacity</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {products.map((product) => (
                <Tr key={product.id}>
                  <Td className="font-medium text-ink">{product.name}</Td>
                  <Td>{product.manufacturer}</Td>
                  <Td className="font-mono">{formatCapacity(product)}</Td>
                  <Td>
                    <Link href={`/catalogue/products/${product.id}`} className="text-xs font-medium text-accent-text">
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <div>
        <button type="button" onClick={() => setDisableOpen(true)} className="text-xs font-medium text-danger">
          Disable subcategory…
        </button>
      </div>

      <CatalogueFormDialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit subcategory" submitLabel="Save changes">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Subcategory name" defaultValue={subcategory.name} disabled />
          <Input label="Code" defaultValue={subcategory.code} disabled />
        </div>
      </CatalogueFormDialog>

      <CatalogueFormDialog open={addProductOpen} onClose={() => setAddProductOpen(false)} title="Add product" submitLabel="Add product">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Product name" disabled />
          <Input label="Manufacturer" disabled />
          <Input label="Capacity" type="number" disabled />
          <Select
            label="Capacity unit"
            options={["Ton", "M³", "Meter", "Kgs", "KnM", "kVA"].map((u) => ({ value: u, label: u }))}
            disabled
          />
        </div>
      </CatalogueFormDialog>

      <CatalogueConfirmDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Disable subcategory"
        dependencyCopy={`This subcategory contains ${products.length} products. Existing machines registered against these products would retain their association.`}
        confirmLabel="Disable"
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
