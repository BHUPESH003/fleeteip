"use client";

import type { Product, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
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
import { CategoryFormDialog, ProductFormDialog, SubcategoryFormDialog } from "../../AdminDialogs";
import { OFFLINE_HINT } from "../../../../../lib/errors";
import { CatalogueDetailSkeleton, RecordInfoLine, RowActions, disabledRemoveItem } from "../../parts";
import { loadCatalogue, machineCountsByProduct, productsInSubcategory, tenantCatalogueWriter } from "../../shared";

type DialogState =
  | { kind: "rename" }
  | { kind: "subcategory"; subcategory?: ProductSubcategory }
  | { kind: "product"; fixedSubcategoryId: string };

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("catalogue.manage");
  // Own-fleet counts are enrichment: without equipment.manage the column is omitted, never zeroed.
  const canListMachines = hasPermission("equipment.manage");
  const { online } = useConnection();
  const backHref = useListBackHref("catalogue", "/catalogue");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const writer = useMemo(() => (organizationId ? tenantCatalogueWriter(organizationId) : null), [organizationId]);

  // A changed [id] doesn't remount the page (docs/decisions.md) — close any dialog left open for the previous one.
  useEffect(() => setDialog(null), [id]);

  const { data, error, loading, reload } = useLoad(
    async () => {
      // getProductCategory throws ApiError 404 for an unknown id.
      const [category, catalogue, machines] = await Promise.all([
        apiClient.getProductCategory(id).then((c) => c!),
        loadCatalogue(),
        optional(canListMachines, () => apiClient.listMachines(organizationId!), [] as Machine[]),
      ]);
      return { ...catalogue, category, machineCounts: machineCountsByProduct(machines) };
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
          title: "We can't find this category",
          body: "The link may be wrong or out of date. Catalogue entries are never removed, so check the link you followed.",
        }}
        forbidden={{ what: "the catalogue", permissionHint: "Browsing the catalogue needs an active membership." }}
        serverTitle="This category didn't load"
        backHref={backHref}
        backLabel="Back to the catalogue"
      />
    );
  }
  if (loading || !data) return <CatalogueDetailSkeleton label="Loading category" />;

  const { category, products, machineCounts } = data;
  const subcategories = data.subcategories.filter((s) => s.productCategoryId === category.id);
  const productsOf = (sub: ProductSubcategory): Product[] => productsInSubcategory(products, sub.id);
  const fleetOf = (list: Product[]) => list.reduce((sum, p) => sum + (machineCounts.get(p.id) ?? 0), 0);
  const categoryProducts = subcategories.flatMap(productsOf);
  const categoryFleet = fleetOf(categoryProducts);
  const offline = !online;

  const menuItems: MenuItem[] = canManage
    ? [
        {
          key: "rename",
          label: "Rename category",
          icon: "edit",
          hint: offline ? OFFLINE_HINT : "The code stays the same.",
          disabled: offline,
          onSelect: () => setDialog({ kind: "rename" }),
        },
        disabledRemoveItem("Disable category"),
      ]
    : [];

  function subcategoryMenu(subcategory: ProductSubcategory): MenuItem[] {
    if (!canManage) return [];
    return [
      {
        key: "rename",
        label: "Rename subcategory",
        icon: "edit",
        hint: offline ? OFFLINE_HINT : "The code stays the same.",
        disabled: offline,
        onSelect: () => setDialog({ kind: "subcategory", subcategory }),
      },
      {
        key: "add-product",
        label: "Add product",
        icon: "plus",
        hint: offline ? OFFLINE_HINT : `Inside ${subcategory.name}.`,
        disabled: offline,
        onSelect: () => setDialog({ kind: "product", fixedSubcategoryId: subcategory.id }),
      },
      disabledRemoveItem("Disable subcategory"),
    ];
  }

  const addSubcategory = canManage ? (
    <Button icon="plus" onClick={() => setDialog({ kind: "subcategory" })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
      Add subcategory
    </Button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Catalogue", href: backHref }, { label: category.name }]}
        note="Filters on the catalogue are kept when you go back"
        leading={
          <IdentityTile title={`Category: ${category.name}`}>
            <Icon name={categoryIcon(category)} size={28} strokeWidth={1.3} />
          </IdentityTile>
        }
        title={category.name}
        description="Category in the shared catalogue"
        actions={
          addSubcategory || menuItems.length > 0 ? (
            <>
              {addSubcategory}
              {menuItems.length > 0 && <Menu label={`More actions for ${category.name}`} items={menuItems} width={300} />}
            </>
          ) : undefined
        }
      >
        <DescriptionList
          layout="inline"
          items={[
            { label: "Code", value: category.code, mono: true },
            { label: "Subcategories", value: formatNumber(subcategories.length, 0), mono: true },
            { label: "Products", value: formatNumber(categoryProducts.length, 0), mono: true },
            ...(canListMachines ? [{ label: "In your fleet", value: formatNumber(categoryFleet, 0), mono: true }] : []),
            { label: "Added", value: formatDate(category.createdAt), mono: true },
          ]}
        />
      </PageHeader>

      <PageBody>
        <Panel title="Subcategories" count={subcategories.length} icon="catalogue" padding="none">
          {subcategories.length === 0 ? (
            <EmptyState
              title={`No subcategories in ${category.name} yet`}
              description={
                canManage
                  ? "Subcategories group the products in this category, for example Mobile crane under Cranes."
                  : "Subcategories appear here once someone with the Catalogue permission adds them."
              }
              action={addSubcategory ?? undefined}
            />
          ) : (
            <Table bare minWidth={600} caption={`Subcategories in ${category.name}`}>
              <Thead>
                <Tr>
                  <Th>Subcategory</Th>
                  <Th>Code</Th>
                  <Th align="right">Products</Th>
                  {canListMachines && <Th align="right">In your fleet</Th>}
                  <Th className="w-[1%]">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {[...subcategories]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((subcategory) => {
                    const list = productsOf(subcategory);
                    return (
                      <Tr key={subcategory.id} interactive>
                        <Td>
                          <CellStack
                            title={
                              <UILink
                                href={`/catalogue/subcategories/${subcategory.id}`}
                                title={subcategory.name}
                                className="text-ink-strong no-underline hover:underline"
                              >
                                {subcategory.name}
                              </UILink>
                            }
                          />
                        </Td>
                        <Td className="font-mono text-xs font-medium">{subcategory.code}</Td>
                        <Td align="right" className="font-mono">
                          {formatNumber(list.length, 0)}
                        </Td>
                        {canListMachines && (
                          <Td align="right" className="font-mono">
                            {formatNumber(fleetOf(list), 0)}
                          </Td>
                        )}
                        <Td>
                          <RowActions
                            href={`/catalogue/subcategories/${subcategory.id}`}
                            label={subcategory.name}
                            items={subcategoryMenu(subcategory)}
                          />
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
        <RecordInfoLine createdAt={category.createdAt} />
      </PageBody>

      {writer && (
        <>
          <CategoryFormDialog
            open={dialog?.kind === "rename"}
            onClose={() => setDialog(null)}
            writer={writer}
            category={category}
            affectedMachines={canListMachines ? categoryFleet : null}
            onSaved={() => void reload()}
          />
          <SubcategoryFormDialog
            open={dialog?.kind === "subcategory"}
            onClose={() => setDialog(null)}
            writer={writer}
            categories={data.categories}
            subcategory={dialog?.kind === "subcategory" ? dialog.subcategory : undefined}
            fixedCategoryId={category.id}
            existingSubcategories={data.subcategories}
            affectedMachines={
              canListMachines && dialog?.kind === "subcategory" && dialog.subcategory ? fleetOf(productsOf(dialog.subcategory)) : null
            }
            onSaved={() => void reload()}
            openHref={(subcategoryId) => `/catalogue/subcategories/${subcategoryId}`}
          />
          <ProductFormDialog
            open={dialog?.kind === "product"}
            onClose={() => setDialog(null)}
            writer={writer}
            subcategories={data.subcategories}
            categoriesById={data.categoriesById}
            fixedSubcategoryId={dialog?.kind === "product" ? dialog.fixedSubcategoryId : undefined}
            existingProducts={products}
            onSaved={() => void reload()}
            openHref={(productId) => `/catalogue/products/${productId}`}
          />
        </>
      )}
    </div>
  );
}
