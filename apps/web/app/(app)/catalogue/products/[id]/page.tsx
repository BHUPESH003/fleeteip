"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import {
  Button,
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
  type IconName,
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
import { Status } from "../../../../../lib/status";
import { useLoad } from "../../../../../lib/use-load";
import { RegisterMachineDialog } from "../../../machines/RegisterMachineDialog";
import { specGroups } from "../../../machines/shared";
import { ProductFormDialog } from "../../AdminDialogs";
import { OFFLINE_HINT } from "../../../../../lib/errors";
import { CatalogueDetailSkeleton, DisabledBadge, ProductToggleDialog, RecordInfoLine, productToggleItem } from "../../parts";
import { formatCapacity, loadCatalogue, machinesUsingProduct, tenantCatalogueWriter } from "../../shared";

type Fleet = { ok: true; machines: Machine[] } | { ok: false };

const OPEN_LINK =
  "inline-flex h-7 items-center rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong no-underline hover:bg-surface-hover";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const isRentalCompany = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.rental_company;
  const canManage = hasPermission("catalogue.manage");
  // The fleet panel is enrichment: listMachines needs equipment.manage, and
  // a failure there empties that panel, never the page.
  const canSeeFleet = isRentalCompany && hasPermission("equipment.manage");
  const canRegister = canSeeFleet;
  const { online } = useConnection();
  const backHref = useListBackHref("catalogue", "/catalogue");
  const [dialog, setDialog] = useState<"edit" | "register" | "toggle" | null>(null);
  const writer = useMemo(() => (organizationId ? tenantCatalogueWriter(organizationId) : null), [organizationId]);

  // A changed [id] doesn't remount the page (docs/decisions.md) — close any dialog left open for the previous one.
  useEffect(() => setDialog(null), [id]);

  const { data, error, loading, reload } = useLoad(
    async () => {
      // getProduct throws ApiError 404 for an unknown id, and still returns disabled products.
      const [product, catalogue, fleet] = await Promise.all([
        apiClient.getProduct(id).then((p) => p!),
        loadCatalogue(),
        canSeeFleet
          ? apiClient
              .listMachines(organizationId!)
              .then((machines): Fleet => ({ ok: true, machines: machinesUsingProduct(id, machines ?? []) }))
              .catch((): Fleet => ({ ok: false }))
          : Promise.resolve<Fleet | null>(null),
      ]);
      const subcategory = catalogue.subcategoriesById.get(product.productSubcategoryId) ?? null;
      const category = subcategory ? (catalogue.categoriesById.get(subcategory.productCategoryId) ?? null) : null;
      return { ...catalogue, product, subcategory, category, fleet };
    },
    [id, organizationId, canSeeFleet],
    Boolean(organizationId),
  );

  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this product",
          body: "The link may be wrong or out of date. Catalogue products are never removed, so check the link you followed.",
        }}
        forbidden={{ what: "the catalogue", permissionHint: "Browsing the catalogue needs an active membership." }}
        serverTitle="This product didn't load"
        backHref={backHref}
        backLabel="Back to the catalogue"
      />
    );
  }
  if (loading || !data) return <CatalogueDetailSkeleton label="Loading product" columns={3} />;

  const { product, subcategory, category, fleet } = data;
  const label = `${product.manufacturer} ${product.name}`;
  const capacity = formatCapacity(product);
  const boom = product.specifications?.boomFamily?.boomLengthM ?? null;
  const groups = specGroups(product.specifications);
  const offline = !online;
  const fleetCount = fleet?.ok ? fleet.machines.length : null;

  // One primary: registering a machine when the role can, else editing.
  // A disabled product can't take new machines (the API rejects it too).
  const primary: { label: string; icon: IconName; onClick: () => void } | null = canRegister && !product.disabledAt
    ? { label: "Register as machine", icon: "plus", onClick: () => setDialog("register") }
    : canManage
      ? { label: "Edit product", icon: "edit", onClick: () => setDialog("edit") }
      : null;
  const menuItems: MenuItem[] = [];
  if (canManage && canRegister) {
    menuItems.push({
      key: "edit",
      label: "Edit product",
      icon: "edit",
      hint: offline ? OFFLINE_HINT : "Name, maker, capacity and specifications.",
      disabled: offline,
      onSelect: () => setDialog("edit"),
    });
  }
  if (canManage) menuItems.push(productToggleItem(product, offline, () => setDialog("toggle")));

  const modelLine = [subcategory?.name ?? category?.name, capacity, boom ? `${formatNumber(boom, 2)} m boom` : null].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Catalogue", href: backHref },
          ...(category ? [{ label: category.name, href: `/catalogue/categories/${category.id}` }] : []),
          ...(subcategory ? [{ label: subcategory.name, href: `/catalogue/subcategories/${subcategory.id}` }] : []),
          { label },
        ]}
        note="Filters on the catalogue are kept when you go back"
        leading={
          <IdentityTile title={`Category: ${category?.name ?? "Not specified"}`}>
            <Icon name={categoryIcon(category)} size={28} strokeWidth={1.3} />
          </IdentityTile>
        }
        title={label}
        meta={<DisabledBadge disabledAt={product.disabledAt} />}
        description={modelLine.length > 0 ? modelLine.join(" · ") : undefined}
        actions={
          primary || menuItems.length > 0 ? (
            <>
              {primary && (
                <Button icon={primary.icon} onClick={primary.onClick} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
                  {primary.label}
                </Button>
              )}
              {menuItems.length > 0 && <Menu label={`More actions for ${label}`} items={menuItems} width={300} />}
            </>
          ) : undefined
        }
      >
        <DescriptionList
          layout="inline"
          items={[
            { label: "Manufacturer", value: product.manufacturer },
            { label: "Model", value: product.name },
            { label: "Rated capacity", value: capacity, mono: true },
            {
              label: "Subcategory",
              value: subcategory ? (
                <UILink href={`/catalogue/subcategories/${subcategory.id}`} className="text-accent-text no-underline hover:underline">
                  {subcategory.name}
                </UILink>
              ) : null,
            },
            { label: "Added", value: formatDate(product.createdAt), mono: true },
          ]}
        />
      </PageHeader>

      <PageBody>
        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
            <Panel title="Specifications" subtitle="recorded on the catalogue product" icon="document" padding="none">
              {groups.length === 0 ? (
                <EmptyState
                  title="No detailed specifications recorded"
                  description={
                    canManage
                      ? "Boom, rigging, fluids and transport dimensions can be added with Edit product."
                      : "Only the rated capacity is recorded for this product."
                  }
                />
              ) : (
                <div className="flex flex-col">
                  {groups.map((group) => (
                    <section key={group.key} aria-label={group.label} className="border-b border-border px-4 py-3 last:border-b-0">
                      <h3 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{group.label}</h3>
                      <DescriptionList
                        layout="grid"
                        minColumnWidth={170}
                        items={group.items.map((item) => ({ label: item.label, value: item.value, mono: true }))}
                      />
                    </section>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 min-[1180px]:max-w-[460px]">
            <Panel
              title="Machines on this product"
              count={fleetCount ?? undefined}
              subtitle={canSeeFleet ? "your fleet" : undefined}
              icon="machine"
              padding="none"
            >
              {!isRentalCompany ? (
                <p className="m-0 px-4 py-3.5 text-sm leading-[1.5] text-ink-soft">
                  Machines are registered by rental companies. Your organization doesn&apos;t keep a fleet in FleetIP.
                </p>
              ) : !canSeeFleet ? (
                <p className="m-0 px-4 py-3.5 text-sm leading-[1.5] text-ink-soft">
                  Seeing your fleet needs the Equipment permission. Ask an organization admin to add it to your role.
                </p>
              ) : !fleet || !fleet.ok ? (
                <div className="flex flex-col gap-2 px-4 py-3.5">
                  <p className="m-0 flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <Icon name="error" size={14} />
                    Your machines didn&apos;t load
                  </p>
                  <p className="m-0 text-xs leading-[1.5] text-ink-soft">The rest of the product page still works.</p>
                  <Button variant="secondary" size="sm" icon="refresh" className="self-start" onClick={() => void reload()}>
                    Try again
                  </Button>
                </div>
              ) : fleet.machines.length === 0 ? (
                <EmptyState
                  title="None of your machines use this product yet"
                  description="Register one to add it to your fleet with this product's details."
                  action={
                    canRegister ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="plus"
                        onClick={() => setDialog("register")}
                        disabled={offline}
                        title={offline ? OFFLINE_HINT : undefined}
                      >
                        Register as machine
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table bare minWidth={420} caption={`Your machines on ${label}`}>
                  <Thead>
                    <Tr>
                      <Th>Asset code</Th>
                      <Th>Registration</Th>
                      <Th>Status</Th>
                      <Th className="w-[1%]">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {[...fleet.machines]
                      .sort((a, b) => a.assetCode.localeCompare(b.assetCode))
                      .map((machine) => (
                        <Tr key={machine.id} interactive>
                          <Td className="whitespace-nowrap font-mono text-xs font-semibold">
                            <UILink href={`/machines/${machine.id}`} className="text-ink no-underline hover:underline">
                              {machine.assetCode}
                            </UILink>
                          </Td>
                          <Td className="whitespace-nowrap font-mono text-xs">{machine.registrationNumber}</Td>
                          <Td>
                            <Status domain="machine" value={machine.status} size="sm" />
                          </Td>
                          <Td>
                            <UILink href={`/machines/${machine.id}`} className={OPEN_LINK} aria-label={`Open ${machine.assetCode}`}>
                              Open
                            </UILink>
                          </Td>
                        </Tr>
                      ))}
                  </Tbody>
                </Table>
              )}
              {canSeeFleet && (
                <p className="m-0 border-t border-border px-4 py-2.5 text-[11px] leading-[1.45] text-meta-light">
                  Your organization&apos;s machines only. FleetIP doesn&apos;t show which other rental companies use this product.
                </p>
              )}
            </Panel>
            <RecordInfoLine createdAt={product.createdAt} />
          </div>
        </div>
      </PageBody>

      {writer && canManage && (
        <ProductFormDialog
          open={dialog === "edit"}
          onClose={() => setDialog(null)}
          writer={writer}
          subcategories={data.subcategories}
          categoriesById={data.categoriesById}
          product={product}
          existingProducts={data.products}
          affectedMachines={fleetCount}
          onSaved={() => void reload()}
        />
      )}
      {organizationId && canManage && dialog === "toggle" && (
        <ProductToggleDialog organizationId={organizationId} product={product} onClose={() => setDialog(null)} onChanged={() => void reload()} />
      )}
      {organizationId && canRegister && dialog === "register" && (
        <RegisterMachineDialog
          open
          onClose={() => setDialog(null)}
          organizationId={organizationId}
          onRegistered={() => void reload()}
          initialCategoryId={subcategory?.productCategoryId}
          initialSubcategoryId={product.productSubcategoryId}
          initialProductId={product.id}
        />
      )}
    </div>
  );
}
