"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import {
  Button,
  CellStack,
  DescriptionList,
  EmptyState,
  Icon,
  IdentityTile,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  type MenuItem,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageLoadError } from "../../../../../components/PageStates";
import { apiClient } from "../../../../../lib/api-client";
import { categoryIcon } from "../../../../../lib/category-icon";
import { useConnection } from "../../../../../lib/connection";
import { formatDate, formatNumber } from "../../../../../lib/format";
import { useListBackHref } from "../../../../../lib/list-state";
import { useSession } from "../../../../../lib/session-context";
import { optional, useLoad } from "../../../../../lib/use-load";
import { RegisterMachineDialog } from "../../../machines/RegisterMachineDialog";
import { specGroups } from "../../../machines/shared";
import { ProductFormDialog, SubcategoryFormDialog } from "../../AdminDialogs";
import { OFFLINE_HINT } from "../../../../../lib/errors";
import {
  CatalogueDetailSkeleton,
  DisabledBadge,
  ProductToggleDialog,
  RecordInfoLine,
  RowActions,
  disabledRemoveItem,
  productToggleItem,
} from "../../parts";
import { formatCapacity, loadCatalogue, machineCountsByProduct, productsInSubcategory, tenantCatalogueWriter } from "../../shared";

type DialogState =
  | { kind: "rename" }
  | { kind: "product"; product?: Product }
  | { kind: "register"; product: Product }
  | { kind: "toggle"; product: Product };

export default function SubcategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("catalogue.manage");
  // Own-fleet counts are enrichment: without equipment.manage the column is omitted, never zeroed.
  const canListMachines = hasPermission("equipment.manage");
  const canRegister = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.rental_company && canListMachines;
  const { online } = useConnection();
  const backHref = useListBackHref("catalogue", "/catalogue");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const writer = useMemo(() => (organizationId ? tenantCatalogueWriter(organizationId) : null), [organizationId]);

  // A changed [id] doesn't remount the page (docs/decisions.md) — close any dialog left open for the previous one.
  useEffect(() => setDialog(null), [id]);

  const { data, error, loading, reload } = useLoad(
    async () => {
      // getProductSubcategory throws ApiError 404 for an unknown id.
      const [subcategory, catalogue, machines] = await Promise.all([
        apiClient.getProductSubcategory(id).then((s) => s!),
        loadCatalogue(),
        optional(canListMachines, () => apiClient.listMachines(organizationId!), [] as Machine[]),
      ]);
      return {
        ...catalogue,
        subcategory,
        category: catalogue.categoriesById.get(subcategory.productCategoryId) ?? null,
        machineCounts: machineCountsByProduct(machines),
      };
    },
    [id, organizationId, canListMachines],
    Boolean(organizationId),
  );

  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this subcategory",
          body: "The link may be wrong or out of date. Catalogue entries are never removed, so check the link you followed.",
        }}
        forbidden={{ what: "the catalogue", permissionHint: "Browsing the catalogue needs an active membership." }}
        serverTitle="This subcategory didn't load"
        backHref={backHref}
        backLabel="Back to the catalogue"
      />
    );
  }
  if (loading || !data) return <CatalogueDetailSkeleton label="Loading subcategory" columns={5} />;

  const { subcategory, category, machineCounts } = data;
  const products = productsInSubcategory(data.products, subcategory.id).sort((a, b) =>
    `${a.manufacturer} ${a.name}`.localeCompare(`${b.manufacturer} ${b.name}`),
  );
  const fleet = products.reduce((sum, p) => sum + (machineCounts.get(p.id) ?? 0), 0);
  const offline = !online;

  const menuItems: MenuItem[] = canManage
    ? [
        {
          key: "rename",
          label: "Rename subcategory",
          icon: "edit",
          hint: offline ? OFFLINE_HINT : "The code stays the same.",
          disabled: offline,
          onSelect: () => setDialog({ kind: "rename" }),
        },
        disabledRemoveItem("Disable subcategory"),
      ]
    : [];

  function productMenu(product: Product): MenuItem[] {
    const items: MenuItem[] = [];
    if (canRegister) {
      items.push({
        key: "register",
        label: "Register as machine",
        icon: "machine",
        hint: offline ? OFFLINE_HINT : "Adds a machine of this product to your fleet.",
        disabled: offline,
        onSelect: () => setDialog({ kind: "register", product }),
      });
    }
    if (canManage) {
      items.push({
        key: "edit",
        label: "Edit product",
        icon: "edit",
        hint: offline ? OFFLINE_HINT : "Name, maker, capacity and specifications.",
        disabled: offline,
        onSelect: () => setDialog({ kind: "product", product }),
      });
      items.push(productToggleItem(product, offline, () => setDialog({ kind: "toggle", product })));
    }
    return items;
  }

  const addProduct = canManage ? (
    <Button icon="plus" onClick={() => setDialog({ kind: "product" })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
      Add product
    </Button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Catalogue", href: backHref },
          ...(category ? [{ label: category.name, href: `/catalogue/categories/${category.id}` }] : []),
          { label: subcategory.name },
        ]}
        note="Filters on the catalogue are kept when you go back"
        leading={
          <IdentityTile title={`Category: ${category?.name ?? "Not specified"}`}>
            <Icon name={categoryIcon(category)} size={28} strokeWidth={1.3} />
          </IdentityTile>
        }
        title={subcategory.name}
        description={category ? `Subcategory of ${category.name}` : "Subcategory in the shared catalogue"}
        actions={
          addProduct || menuItems.length > 0 ? (
            <>
              {addProduct}
              {menuItems.length > 0 && <Menu label={`More actions for ${subcategory.name}`} items={menuItems} width={300} />}
            </>
          ) : undefined
        }
      >
        <DescriptionList
          layout="inline"
          items={[
            { label: "Code", value: subcategory.code, mono: true },
            {
              label: "Category",
              value: category ? (
                <UILink href={`/catalogue/categories/${category.id}`} className="text-accent-text no-underline hover:underline">
                  {category.name}
                </UILink>
              ) : null,
            },
            { label: "Products", value: formatNumber(products.length, 0), mono: true },
            ...(canListMachines ? [{ label: "In your fleet", value: formatNumber(fleet, 0), mono: true }] : []),
            { label: "Added", value: formatDate(subcategory.createdAt), mono: true },
          ]}
        />
      </PageHeader>

      <PageBody>
        <Panel title="Products" count={products.length} icon="catalogue" padding="none">
          {products.length === 0 ? (
            <EmptyState
              title={`No products in ${subcategory.name} yet`}
              description={
                canManage
                  ? "Add the makes and models in this subcategory. Rental companies register their machines against them."
                  : "Products appear here once someone with the Catalogue permission adds them."
              }
              action={addProduct ?? undefined}
            />
          ) : (
            <Table bare minWidth={680} caption={`Products in ${subcategory.name}`}>
              <Thead>
                <Tr>
                  <Th>Product</Th>
                  <Th align="right">Rated capacity</Th>
                  <Th>Specifications</Th>
                  {canListMachines && <Th align="right">In your fleet</Th>}
                  <Th className="w-[1%]">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {products.map((product) => {
                  const label = `${product.manufacturer} ${product.name}`;
                  const capacity = formatCapacity(product);
                  const groups = specGroups(product.specifications).map((g) => g.label);
                  return (
                    <Tr key={product.id} interactive>
                      <Td>
                        <span className="flex items-center gap-2">
                          <CellStack
                            title={
                              <UILink href={`/catalogue/products/${product.id}`} title={label} className="text-ink-strong no-underline hover:underline">
                                {label}
                              </UILink>
                            }
                          />
                          <DisabledBadge disabledAt={product.disabledAt} />
                        </span>
                      </Td>
                      <Td align="right" className="font-mono">
                        {capacity ?? <span className="font-sans italic text-disabled-text">Not specified</span>}
                      </Td>
                      <Td className="text-xs text-ink-muted">
                        {groups.length > 0 ? groups.join(" · ") : <span className="italic text-disabled-text">Not specified</span>}
                      </Td>
                      {canListMachines && (
                        <Td align="right" className="font-mono">
                          {formatNumber(machineCounts.get(product.id) ?? 0, 0)}
                        </Td>
                      )}
                      <Td>
                        <RowActions href={`/catalogue/products/${product.id}`} label={label} items={productMenu(product)} />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </Panel>
        {canListMachines && (
          <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
            “In your fleet” counts your organization&apos;s own machines. FleetIP doesn&apos;t count other rental companies&apos;
            machines.
          </p>
        )}
        <RecordInfoLine createdAt={subcategory.createdAt} />
      </PageBody>

      {writer && (
        <>
          <SubcategoryFormDialog
            open={dialog?.kind === "rename"}
            onClose={() => setDialog(null)}
            writer={writer}
            categories={data.categories}
            subcategory={subcategory}
            affectedMachines={canListMachines ? fleet : null}
            onSaved={() => void reload()}
          />
          <ProductFormDialog
            open={dialog?.kind === "product"}
            onClose={() => setDialog(null)}
            writer={writer}
            subcategories={data.subcategories}
            categoriesById={data.categoriesById}
            product={dialog?.kind === "product" ? dialog.product : undefined}
            fixedSubcategoryId={subcategory.id}
            existingProducts={data.products}
            affectedMachines={
              canListMachines && dialog?.kind === "product" && dialog.product ? (machineCounts.get(dialog.product.id) ?? 0) : null
            }
            onSaved={() => void reload()}
            openHref={(productId) => `/catalogue/products/${productId}`}
          />
        </>
      )}
      {organizationId && dialog?.kind === "toggle" && (
        <ProductToggleDialog organizationId={organizationId} product={dialog.product} onClose={() => setDialog(null)} onChanged={() => void reload()} />
      )}
      {organizationId && dialog?.kind === "register" && (
        <RegisterMachineDialog
          open
          onClose={() => setDialog(null)}
          organizationId={organizationId}
          onRegistered={() => void reload()}
          initialCategoryId={subcategory.productCategoryId}
          initialSubcategoryId={subcategory.id}
          initialProductId={dialog.product.id}
        />
      )}
    </div>
  );
}
