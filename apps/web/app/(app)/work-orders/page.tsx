"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import { useMemo } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { describeError, errorStatus } from "../../../lib/errors";
import { formatDateRange, formatMoney, formatRateUnit, rentalRef } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import {
  ListCard,
  ListSearch,
  NoMatches,
  PAGE_SIZE,
  RefCell,
  matches,
  paginate,
  quoted,
  sortRows,
  useListView,
} from "../../../components/list-kit";
import { productName } from "../machines/shared";
import { workOrderMismatch } from "./shared";

interface WorkOrderData {
  workOrders: WorkOrder[];
  /** null when the role can't view rentals. */
  rentals: Map<string, Rental> | null;
  machines: Map<string, Machine>;
  products: Map<string, Product>;
  customerNames: Map<string, string>;
}

async function loadWorkOrders(
  orgId: string,
  access: { rentals: boolean; machines: boolean; customers: boolean },
): Promise<WorkOrderData> {
  // A Rental Company's work orders don't carry the machine code or product
  // name (it has them through equipment.manage), so they're looked up here —
  // as enrichment, never required.
  const [workOrders, rentals, machines, products, renters] = await Promise.all([
    apiClient.listWorkOrders(orgId) as Promise<WorkOrder[]>,
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, null as Rental[] | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  return {
    workOrders,
    rentals: rentals ? new Map(rentals.map((r) => [r.id, r])) : null,
    machines: new Map(machines.map((m) => [m.id, m])),
    products: new Map(products.map((p) => [p.id, p])),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
  };
}

type SortKey = "reference" | "dates" | "rate";
const SORTS: Record<SortKey, "asc" | "desc"> = { reference: "desc", dates: "desc", rate: "desc" };
const MISMATCH = "rental_ended";
const COLUMNS = 7;

export default function WorkOrdersPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const isRentalCompany = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.rental_company;
  // listWorkOrders serves both sides: rental.manage (Rental Company, its own
  // work orders) or rental.respond (Renter, the ones issued to it).
  const canView = isRentalCompany ? hasPermission("rental.manage") : hasPermission("rental.respond");
  const access = {
    rentals: canView,
    machines: isRentalCompany && hasPermission("equipment.manage"),
    customers: isRentalCompany && hasPermission("quotation.manage"),
  };

  const { data, error, reload } = useLoad(
    () => loadWorkOrders(organizationId!, access),
    [organizationId, access.rentals, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );
  const view = useListView<SortKey>("work-orders", SORTS, "reference");
  const { get, set } = view;
  const statusParam = get("status");

  const workOrders = useMemo(() => data?.workOrders ?? [], [data?.workOrders]);

  const assetOf = (wo: WorkOrder) => wo.machineAssetCode ?? data?.machines.get(wo.machineId)?.assetCode ?? null;
  const productOf = (wo: WorkOrder) => {
    if (wo.productName) return wo.productName;
    const machine = data?.machines.get(wo.machineId);
    return machine ? productName(data?.products.get(machine.productId)) : null;
  };
  const counterpartOf = (wo: WorkOrder): { name: string; note: string } | null => {
    if (!isRentalCompany) {
      const name = data?.rentals?.get(wo.rentalId)?.rentalCompanyOrganizationName;
      return name ? { name, note: "Rental company" } : null;
    }
    if (wo.clientSnapshot) return { name: wo.clientSnapshot.name, note: "Not on FleetIP · as entered" };
    if (wo.renterOrganizationId) return { name: data?.customerNames.get(wo.renterOrganizationId) ?? "FleetIP customer", note: "On FleetIP" };
    return null;
  };

  const filtered = workOrders.filter((wo) => {
    if (statusParam === MISMATCH) {
      if (!workOrderMismatch(wo, data?.rentals?.get(wo.rentalId))) return false;
    } else if (statusParam && wo.status !== statusParam) {
      return false;
    }
    if (
      view.query &&
      !matches(view.query, [wo.referenceNumber, rentalRef(wo.rentalId), assetOf(wo), productOf(wo), counterpartOf(wo)?.name, wo.projectCode])
    ) {
      return false;
    }
    return true;
  });
  const compare =
    view.sortKey === "dates"
      ? (a: WorkOrder, b: WorkOrder) => a.startDate.localeCompare(b.startDate)
      : view.sortKey === "rate"
        ? (a: WorkOrder, b: WorkOrder) => a.rate - b.rate
        : (a: WorkOrder, b: WorkOrder) => a.createdAt.localeCompare(b.createdAt) || a.referenceNumber.localeCompare(b.referenceNumber);
  const sorted = sortRows(filtered, compare, view.sortDir);
  const page = paginate(sorted, view.page);

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="work orders"
        permissionHint={isRentalCompany ? "Work orders need the Rentals permission." : "Seeing the work orders issued to you needs the Rentals permission."}
      />
    );
  }
  if (error && errorStatus(error) === 403) {
    return <ForbiddenPage what="work orders" permissionHint="Work orders need the Rentals permission." />;
  }

  const mismatches = data?.rentals ? workOrders.filter((wo) => workOrderMismatch(wo, data.rentals?.get(wo.rentalId))) : [];
  const clearFilters = () => set({ status: null, q: null });
  const filterParts = [
    statusParam ? (statusParam === MISMATCH ? "Issued · rental ended" : statusLabel("work_order", statusParam)) : null,
    view.queryLabel ? quoted(view.queryLabel) : null,
  ].filter((p): p is string => Boolean(p));

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Work orders"
        description="The finalized commercial order for each awarded quotation — created automatically, with the agreed terms snapshotted."
      />
      <PageBody>
        {data && isRentalCompany && (
          <AttentionStrip
            items={[
              {
                key: "mismatch",
                count: mismatches.length,
                text: `${mismatches.length === 1 ? "work order is" : "work orders are"} still Issued on a rental that has ended — they aren't closed automatically`,
                onClick: () => set({ status: MISMATCH }),
              },
            ]}
          />
        )}

        {error ? (
          <ErrorState
            title="Work orders didn't load"
            message={describeError(error).body}
            action={
              <Button variant="secondary" size="sm" onClick={() => void reload()}>
                Try again
              </Button>
            }
          />
        ) : data && workOrders.length === 0 ? (
          <section className="rounded-panel border border-border-strong bg-surface">
            <EmptyState
              variant="page"
              icon="work_order"
              title="No work orders yet"
              description="A work order is created automatically the moment a quotation is awarded — it's never entered by hand."
            />
          </section>
        ) : (
          <ListCard
            label="Work orders"
            toolbar={
              <>
                <ListSearch search={view.search} label="Search work orders" placeholder="Reference, rental, machine, customer…" />
                <Select
                  aria-label="Status"
                  className="w-full min-[760px]:w-[210px]"
                  placeholder="All statuses"
                  value={statusParam}
                  onChange={(e) => set({ status: e.target.value || null })}
                  options={[
                    ...statusOptions("work_order"),
                    ...(isRentalCompany && data?.rentals ? [{ value: MISMATCH, label: "Issued · rental ended" }] : []),
                  ]}
                />
                {(statusParam || view.queryLabel) && (
                  <Button variant="tertiary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </>
            }
            footer={
              data && sorted.length > 0 ? (
                <Pagination page={page.page} pageCount={page.pageCount} onPageChange={view.setPage} total={sorted.length} pageSize={PAGE_SIZE} noun="work orders" />
              ) : undefined
            }
          >
            {data && sorted.length === 0 ? (
              <NoMatches noun="work orders" parts={filterParts} onClear={clearFilters} />
            ) : (
              <Table bare minWidth={1000} caption="Work orders">
                <Thead>
                  <Tr>
                    <Th className="w-[160px]" {...view.sortProps("reference")}>
                      Work order
                    </Th>
                    <Th className="w-[150px]">Rental</Th>
                    <Th className="w-[190px]">Machine</Th>
                    <Th>{isRentalCompany ? "Customer" : "Rental company"}</Th>
                    <Th className="w-[200px]" {...view.sortProps("dates")}>
                      Dates
                    </Th>
                    <Th align="right" className="w-[130px]" {...view.sortProps("rate")}>
                      Rate
                    </Th>
                    <Th className="w-[110px]">Status</Th>
                  </Tr>
                </Thead>
                {!data ? (
                  <TableSkeleton columns={COLUMNS} rows={8} label="Loading work orders" />
                ) : (
                  <Tbody>
                    {page.rows.map((wo) => {
                      const rental = data.rentals?.get(wo.rentalId);
                      const counterpart = counterpartOf(wo);
                      const mismatch = workOrderMismatch(wo, rental);
                      return (
                        <Tr key={wo.id} className={mismatch ? "bg-attention-wash" : undefined}>
                          <Td>
                            <RefCell
                              href={`/work-orders/${wo.id}`}
                              label={wo.referenceNumber}
                              sub={wo.projectCode ? `Project ${wo.projectCode}` : undefined}
                            />
                          </Td>
                          <Td>
                            <RefCell
                              href={data.rentals ? `/rentals/${wo.rentalId}` : null}
                              label={rentalRef(wo.rentalId)}
                              sub={
                                rental ? (
                                  <span className={mismatch ? "font-medium text-attention" : undefined}>
                                    Rental {statusLabel("rental", rental.status).toLowerCase()}
                                  </span>
                                ) : undefined
                              }
                            />
                          </Td>
                          <Td>
                            <CellStack
                              title={assetOf(wo) ?? "Machine not visible"}
                              titleClassName="font-mono text-xs"
                              sub={productOf(wo) ?? undefined}
                            />
                          </Td>
                          <Td>
                            {counterpart ? (
                              <CellStack title={counterpart.name} sub={counterpart.note} />
                            ) : (
                              <span className="text-xs italic text-disabled-text">Not specified</span>
                            )}
                          </Td>
                          <Td className="font-mono text-xs">{formatDateRange(wo.startDate, wo.endDate)}</Td>
                          <Td align="right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-mono text-xs font-semibold text-ink">{formatMoney(wo.rate)}</span>
                              <span className="text-[11px] text-meta-light">{formatRateUnit(wo.rateUnit)}</span>
                            </div>
                          </Td>
                          <Td>
                            <Status domain="work_order" value={wo.status} size="sm" />
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                )}
              </Table>
            )}
          </ListCard>
        )}
      </PageBody>
    </div>
  );
}
