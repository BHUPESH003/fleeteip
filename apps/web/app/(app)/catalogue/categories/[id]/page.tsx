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

interface Loaded {
  category: ProductCategory;
  subcategories: ProductSubcategory[];
  products: Product[];
}

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [categories, products] = await Promise.all([
          apiClient.listProductCategories() as Promise<ProductCategory[]>,
          apiClient.listProducts() as Promise<Product[]>,
        ]);
        const category = categories.find((c) => c.id === id);
        if (!category) {
          setError("Category not found");
          return;
        }
        const subcategories = (await apiClient.listProductSubcategories(id)) as ProductSubcategory[];
        setData({ category, subcategories, products });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load category");
      }
    })();
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading category…" />;

  const { category, subcategories, products } = data;
  const subcategoryIds = new Set(subcategories.map((s) => s.id));
  const productCount = products.filter((p) => subcategoryIds.has(p.productSubcategoryId)).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Catalogue", href: "/catalogue" }, { label: category.name }]}
        title={category.name}
        description={`${subcategories.length} subcategories · ${productCount} products`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)} title="Catalogue administration has no backend endpoint yet">
              Edit category
            </Button>
            <Button onClick={() => setAddSubOpen(true)} title="Catalogue administration has no backend endpoint yet">
              Add subcategory
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Name" value={category.name} />
          <Field label="Code" value={category.code} mono />
          <Field label="Created" value={category.createdAt.slice(0, 10)} mono />
        </div>
      </Card>

      <Card padding={subcategories.length === 0 ? "md" : "none"}>
        {subcategories.length === 0 ? (
          <EmptyState title="No subcategories yet" description="Add one above." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Subcategory</Th>
                <Th>Code</Th>
                <Th>Products</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {subcategories.map((subcategory) => (
                <Tr key={subcategory.id}>
                  <Td className="font-medium text-ink">{subcategory.name}</Td>
                  <Td className="font-mono">{subcategory.code}</Td>
                  <Td>{products.filter((p) => p.productSubcategoryId === subcategory.id).length}</Td>
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
        )}
      </Card>

      <div>
        <button
          type="button"
          onClick={() => setDisableOpen(true)}
          className="text-xs font-medium text-danger"
        >
          Disable category…
        </button>
      </div>

      <CatalogueFormDialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit category" submitLabel="Save changes">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Category name" defaultValue={category.name} disabled />
          <Input label="Code" defaultValue={category.code} disabled />
        </div>
      </CatalogueFormDialog>

      <CatalogueFormDialog open={addSubOpen} onClose={() => setAddSubOpen(false)} title="Add subcategory" submitLabel="Add subcategory">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Subcategory name" placeholder="e.g. Mobile crane" disabled />
          <Input label="Code" placeholder="e.g. MCR" disabled />
        </div>
      </CatalogueFormDialog>

      <CatalogueConfirmDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Disable category"
        dependencyCopy={`This category contains ${subcategories.length} subcategories and ${productCount} products. Existing machines registered against products in this category would retain their association.`}
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
