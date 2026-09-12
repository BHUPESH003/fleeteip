"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
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
import { useSession } from "../../../../../lib/session-context";
import { flattenSpecifications, MACHINE_STATUS_MAP } from "../../../machines/shared";
import { CatalogueConfirmDialog, CatalogueFormDialog } from "../../AdminDialogs";
import { formatCapacity } from "../../shared";

interface Loaded {
  product: Product;
  subcategory: ProductSubcategory | null;
  category: ProductCategory | null;
  ownMachines: Machine[];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canSeeOwnFleet = currentMembership?.organization.organizationTypeCode === "rental_company";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const products = (await apiClient.listProducts()) as Product[];
        const product = products.find((p) => p.id === id);
        if (!product) {
          setError("Product not found");
          return;
        }
        const categories = (await apiClient.listProductCategories()) as ProductCategory[];
        const subcategoryLists = await Promise.all(
          categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
        );
        const subcategory = subcategoryLists.flat().find((s) => s.id === product.productSubcategoryId) ?? null;
        const category = categories.find((c) => c.id === subcategory?.productCategoryId) ?? null;
        const ownMachines =
          canSeeOwnFleet && organizationId
            ? ((await apiClient.listMachines(organizationId)) as Machine[]).filter((m) => m.productId === id)
            : [];
        setData({ product, subcategory, category, ownMachines });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product");
      }
    })();
  }, [id, organizationId, canSeeOwnFleet]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading product…" />;

  const { product, subcategory, category, ownMachines } = data;
  const specRows = flattenSpecifications(product.specifications);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Catalogue", href: "/catalogue" },
          ...(category ? [{ label: category.name, href: `/catalogue/categories/${category.id}` }] : []),
          ...(subcategory ? [{ label: subcategory.name, href: `/catalogue/subcategories/${subcategory.id}` }] : []),
          { label: product.name },
        ]}
        title={`${product.manufacturer} ${product.name}`}
        description={formatCapacity(product) !== "—" ? `Capacity ${formatCapacity(product)}` : undefined}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)} title="Catalogue administration has no backend endpoint yet">
            Edit product
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Identity</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Manufacturer" value={product.manufacturer} />
              <Field label="Product" value={product.name} />
              <Field label="Category" value={category?.name ?? "—"} />
              <Field label="Subcategory" value={subcategory?.name ?? "—"} />
              <Field label="Capacity" value={formatCapacity(product)} mono />
              <Field label="Created" value={product.createdAt.slice(0, 10)} mono />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Specifications</h2>
            {specRows.length === 0 ? (
              <p className="text-sm text-meta">No specifications recorded for this product.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {specRows.map((row) => (
                  <Field key={row.label} label={row.label} value={row.value} mono />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Machines using this product</h2>
          {!canSeeOwnFleet ? (
            <p className="text-sm text-meta">Only visible to a Rental Company&apos;s own fleet.</p>
          ) : ownMachines.length === 0 ? (
            <EmptyState title="No machines yet" description="No machine in your fleet uses this product." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Asset code</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ownMachines.map((machine) => (
                  <Tr key={machine.id}>
                    <Td className="font-mono">
                      <Link href={`/machines/${machine.id}`} className="text-accent-text">
                        {machine.assetCode}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          <p className="mt-3 text-xs text-meta-light">
            Your organization&apos;s fleet only — there is no platform-wide product→machine lookup
            yet (see the frontend/backend gap report).
          </p>
        </Card>
      </div>

      <div>
        <button type="button" onClick={() => setDisableOpen(true)} className="text-xs font-medium text-danger">
          Disable product…
        </button>
      </div>

      <CatalogueFormDialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit product" submitLabel="Save changes">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Product name" defaultValue={product.name} disabled />
          <Input label="Manufacturer" defaultValue={product.manufacturer} disabled />
          <Input label="Capacity" type="number" defaultValue={product.capacity ?? undefined} disabled />
          <Select
            label="Capacity unit"
            options={["Ton", "M³", "Meter", "Kgs", "KnM", "kVA"].map((u) => ({ value: u, label: u }))}
            defaultValue={product.capacityUnit ?? ""}
            disabled
          />
        </div>
        {specRows.length > 0 && (
          <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
            {specRows.map((row) => (
              <Input key={row.label} label={row.label} defaultValue={row.value} disabled />
            ))}
          </div>
        )}
      </CatalogueFormDialog>

      <CatalogueConfirmDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Disable product"
        dependencyCopy={
          canSeeOwnFleet
            ? `This product is currently used by ${ownMachines.length} machine(s) in your fleet (and possibly more across other rental companies — no platform-wide count is available). Existing machines would retain their product association.`
            : "This product may be in use by machines across one or more rental companies. Existing machines would retain their product association."
        }
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
