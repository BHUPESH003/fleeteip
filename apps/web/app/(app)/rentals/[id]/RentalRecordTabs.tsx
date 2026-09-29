"use client";

import { InvoiceStatus } from "@fleetip/contracts/billing";
import { RentalStatus } from "@fleetip/contracts/rental";
import {
  CellStack,
  EmptyState,
  Table,
  TabPanel,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  type TabItem,
} from "@fleetip/ui";
import { useId } from "react";
import { formatDateRange, formatMoney, formatShortDate, rentalRef } from "../../../../lib/format";
import { Status } from "../../../../lib/status";
import { MaintenancePanel } from "../../machines/panels";
import { LogsheetPanel, TransportPanel } from "../panels";
import { invoiceStatus, type RentalData, type RentalTab } from "./derive";

const linkClass = "text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

/**
 * The rental's records, in a card with its own tablist (?tab= in the URL).
 * Transport and logsheets are the shared panels, read-only for a Renter.
 * There's no Activity tab: FleetIP keeps no per-rental audit log.
 */
export function RentalRecordTabs({
  data,
  organizationId,
  tab,
  onTabChange,
  logsheetVersion,
  onChanged,
}: {
  data: RentalData;
  organizationId: string;
  tab: RentalTab;
  onTabChange: (tab: RentalTab) => void;
  /** Bumped after a logsheet is saved elsewhere on the page, so the panel re-reads. */
  logsheetVersion: number;
  onChanged: () => void;
}) {
  const idBase = useId().replace(/:/g, "");
  const { rental, access } = data;

  const items: TabItem[] = [
    { key: "transport", label: "Transport", count: access.transport ? data.transport.length : undefined },
    { key: "logsheets", label: "Logsheets", count: access.logsheets ? data.logsheets.length : undefined },
    { key: "invoices", label: "Invoices", count: access.billing ? data.invoices.length : undefined },
    // Workshop jobs belong to the rental company's machine; a Renter never sees them.
    ...(access.isRenter ? [] : [{ key: "workshop", label: "Workshop", count: access.maintenance ? data.maintenance.length : undefined }]),
  ];

  return (
    <section className="min-w-0 rounded-panel border border-border-strong bg-surface">
      <h2 className="sr-only">Rental records</h2>
      <Tabs variant="card" label="Rental records" idBase={idBase} active={tab} onChange={(key) => onTabChange(key as RentalTab)} items={items} />
      <TabPanel idBase={idBase} tabKey={tab} className="rounded-b-[5px] bg-surface-sunk p-3.5">
        {tab === "transport" &&
          (!access.transport ? (
            <NotVisible
              title="Transport isn't visible to your role"
              body={access.isRenter ? "Seeing transport needs the Transport permission on your side." : "Viewing transport needs the Transport permission."}
            />
          ) : (
            <TransportPanel
              organizationId={organizationId}
              rental={rental}
              readOnly={access.isRenter || !access.transportWrite}
              onChanged={onChanged}
            />
          ))}

        {tab === "logsheets" &&
          (!access.logsheets ? (
            <NotVisible
              title="Logsheets aren't visible to your role"
              body={access.isRenter ? "Seeing logsheets needs the Logsheets permission on your side." : "Viewing logsheets needs the Logsheets permission."}
            />
          ) : (
            <LogsheetPanel
              key={`${rental.id}:${logsheetVersion}`}
              organizationId={organizationId}
              rental={rental}
              readOnly={access.isRenter || !access.logsheetWrite}
              onChanged={onChanged}
            />
          ))}

        {tab === "invoices" && <InvoicesTab data={data} />}

        {tab === "workshop" &&
          !access.isRenter &&
          (!access.maintenance ? (
            <NotVisible title="Workshop jobs aren't visible to your role" body="Viewing maintenance needs the Maintenance permission." />
          ) : !data.machine ? (
            <NotVisible
              title="Workshop jobs are kept per machine"
              body="Your role can't open machines (the Equipment permission), so this machine's jobs can't be shown here."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                Every workshop job on {data.machine.assetCode}. FleetIP doesn&apos;t link a job to a rental, so check the dates against{" "}
                {rentalRef(rental.id)} (<span className="font-mono">{formatDateRange(rental.startDate, rental.endDate)}</span>).
              </p>
              <MaintenancePanel
                organizationId={organizationId}
                machine={data.machine}
                rentals={data.machineRentals}
                onMachineChanged={onChanged}
                title={`Workshop jobs on ${data.machine.assetCode}`}
              />
            </div>
          ))}
      </TabPanel>
    </section>
  );
}

function NotVisible({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-panel border border-border-strong bg-surface">
      <EmptyState title={title} description={body} />
    </div>
  );
}

function InvoicesTab({ data }: { data: RentalData }) {
  const { rental, access } = data;
  const ref = rentalRef(rental.id);
  const raise =
    access.billingWrite && rental.status !== RentalStatus.cancelled ? (
      <UILink href={`/billing?create=1&rentalId=${rental.id}`} className={linkClass}>
        Raise invoice
      </UILink>
    ) : null;

  if (!access.billing) {
    return (
      <NotVisible
        title="Invoices aren't visible to your role"
        body={access.isRenter ? "Seeing invoices needs the Billing permission on your side." : "Viewing invoices needs the Billing permission."}
      />
    );
  }

  return (
    <section aria-label={`Invoices on ${ref}`} className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold leading-none text-ink">Invoices</span>
        <span className="text-xs leading-[1.3] text-meta">Raised by hand, per billing period</span>
        <span className="ml-auto flex items-center gap-3">
          {raise}
          <UILink href="/billing" className={linkClass}>
            All invoices
          </UILink>
        </span>
      </div>
      {data.invoices.length === 0 ? (
        <EmptyState
          title="No invoices raised"
          description={
            access.isRenter
              ? "Invoices the rental company raises for this rental appear here."
              : "Invoices raised against this rental appear here. Lines are entered by hand, per billing period."
          }
          action={raise ?? undefined}
        />
      ) : (
        <Table bare minWidth={680} caption={`Invoices on ${ref}`}>
          <Thead>
            <Tr>
              <Th className="w-[130px]">Invoice</Th>
              <Th className="w-[160px]">Billing period</Th>
              <Th className="w-[90px]">Due</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance due</Th>
              <Th className="w-[110px]">Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.invoices.map((invoice) => {
              const detail = data.invoiceDetails.get(invoice.id);
              const status = invoiceStatus(data, invoice);
              const overdue = status === InvoiceStatus.overdue;
              return (
                <Tr key={invoice.id} className={overdue ? "bg-destructive-row" : undefined}>
                  <Td>
                    <UILink
                      href={`/billing?invoiceId=${invoice.id}`}
                      className="whitespace-nowrap font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </UILink>
                  </Td>
                  <Td>
                    <CellStack mono title={`${formatShortDate(invoice.billingPeriodStart)} → ${formatShortDate(invoice.billingPeriodEnd)}`} sub={invoice.billingPeriodEnd.slice(0, 4)} />
                  </Td>
                  <Td className={cx("font-mono text-xs", overdue && "font-semibold text-destructive")}>{formatShortDate(invoice.dueDate)}</Td>
                  <Td align="right" className="font-mono text-xs">
                    {formatMoney(invoice.totalAmount)}
                  </Td>
                  <Td align="right" className="font-mono text-xs font-semibold">
                    {detail ? (
                      detail.balanceDue > 0 ? (
                        formatMoney(detail.balanceDue)
                      ) : (
                        <span className="font-normal text-disabled-text">Nothing due</span>
                      )
                    ) : status === InvoiceStatus.paid || status === InvoiceStatus.cancelled || status === InvoiceStatus.draft ? (
                      <span className="font-normal text-disabled-text">—</span>
                    ) : (
                      <span className="font-normal text-meta-light" title="The balance comes from the invoice's detail, which didn't load">
                        Open the invoice
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Status domain="invoice" value={status} size="sm" />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </section>
  );
}
