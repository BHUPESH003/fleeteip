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
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../../lib/api-client";
import { useSession } from "../../../../../lib/session-context";
import { CatalogueConfirmDialog, CatalogueFormDialog } from "../../AdminDialogs";

interface Loaded {
  category: ProductCategory;
  subcategories: ProductSubcategory[];
  products: Product[];
}

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("catalogue.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [addSubError, setAddSubError] = useState<string | null>(null);
  const [addSubSubmitting, setAddSubSubmitting] = useState(false);

  async function load() {
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
  }

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load category");
      }
    })();
  }, [id]);

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setEditError(null);
    const form = new FormData(event.currentTarget);
    setEditSubmitting(true);
    try {
      await apiClient.updateProductCategory(organizationId, id, { name: String(form.get("name") ?? "") });
      setEditOpen(false);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleAddSubSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setAddSubError(null);
    const form = new FormData(event.currentTarget);
    setAddSubSubmitting(true);
    try {
      await apiClient.createProductSubcategory(organizationId, {
        productCategoryId: id,
        name: String(form.get("name") ?? ""),
        code: String(form.get("code") ?? "").toUpperCase(),
      });
      setAddSubOpen(false);
      await load();
    } catch (err) {
      setAddSubError(err instanceof Error ? err.message : "Failed to add subcategory");
    } finally {
      setAddSubSubmitting(false);
    }
  }

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
            <Button
              variant="secondary"
              onClick={() => setEditOpen(true)}
              title={canManage ? undefined : "Requires catalogue.manage (Rental Company organizations only)"}
            >
              Edit category
            </Button>
            <Button
              onClick={() => setAddSubOpen(true)}
              title={canManage ? undefined : "Requires catalogue.manage (Rental Company organizations only)"}
            >
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

      <CatalogueFormDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditError(null);
        }}
        title="Edit category"
        submitLabel="Save changes"
        canManage={canManage}
        onSubmit={handleEditSubmit}
        submitting={editSubmitting}
        error={editError}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Category name" name="name" defaultValue={category.name} required />
          <Input label="Code" defaultValue={category.code} disabled title="Code is immutable once created" />
        </div>
      </CatalogueFormDialog>

      <CatalogueFormDialog
        open={addSubOpen}
        onClose={() => {
          setAddSubOpen(false);
          setAddSubError(null);
        }}
        title="Add subcategory"
        submitLabel="Add subcategory"
        canManage={canManage}
        onSubmit={handleAddSubSubmit}
        submitting={addSubSubmitting}
        error={addSubError}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Subcategory name" name="name" placeholder="e.g. Mobile crane" required />
          <Input label="Code" name="code" placeholder="e.g. MCR" required />
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
