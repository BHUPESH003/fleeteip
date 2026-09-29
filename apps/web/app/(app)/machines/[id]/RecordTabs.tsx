"use client";

import { InvoiceStatus } from "@fleetip/contracts/billing";
import { MachineStatus } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType } from "@fleetip/contracts/maintenance";
import { RentalStatus } from "@fleetip/contracts/rental";
import { TransportLeg } from "@fleetip/contracts/transport";
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
} from "@fleetip/ui";
import { useId, type ReactNode } from "react";
import {
  addDays,
  daysBetween,
  formatCompactRange,
  formatHours,
  formatMoney,
  formatNumber,
  formatRateUnit,
  formatShortDate,
  plural,
  rentalRef,
} from "../../../../lib/format";
import { Status } from "../../../../lib/status";
import { MAINTENANCE_TYPE_LABEL } from "../shared";
import { activeRental, currentRental, customerName, type Coverage, type MachineData, type RecordTab } from "./derive";

const LOG_ROWS = 14;

function TabHeader({ sub, allHref, allLabel }: { sub: ReactNode; allHref?: string; allLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-2.5">
      <span className="text-xs leading-[1.3] text-meta">{sub}</span>
      {allHref && (
        <UILink href={allHref} className="ml-auto whitespace-nowrap text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline">
          {allLabel}
        </UILink>
      )}
    </div>
  );
}

const refClass = "font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

export function RecordTabs({
  data,
  coverage,
  tab,
  onTabChange,
  canLog,
  onLogDate,
}: {
  data: MachineData;
  coverage: Coverage | null;
  tab: RecordTab;
  onTabChange: (tab: RecordTab) => void;
  canLog: boolean;
  onLogDate: (date: string) => void;
}) {
  const idBase = useId().replace(/:/g, "");
  const { machine, access } = data;
  const current = currentRental(data);
  const active = activeRental(data);
  const logRental = active ?? data.rentals.find((r) => r.status === RentalStatus.off_rent) ?? null;

  const counts: Record<RecordTab, number | string | undefined> = {
    rentals: access.rentals ? data.rentals.length : undefined,
    logsheets: data.utilization ? data.utilization.loggedDayCount : access.logsheets ? data.logsheets.length : undefined,
    workshop: access.maintenance ? data.maintenance.length : undefined,
    transport: access.transport ? data.transport.length : undefined,
    invoices: access.billing ? data.invoices.length : undefined,
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
      <h2 className="sr-only">Machine record</h2>
      <Tabs
        variant="card"
        label="Machine record"
        idBase={idBase}
        active={tab}
        onChange={(key) => onTabChange(key as RecordTab)}
        items={[
          { key: "rentals", label: "Rentals", count: counts.rentals },
          { key: "logsheets", label: "Logsheets", count: counts.logsheets },
          { key: "workshop", label: "Workshop", count: counts.workshop },
          { key: "transport", label: "Transport", count: counts.transport },
          { key: "invoices", label: "Invoices", count: counts.invoices },
        ]}
      />

      <TabPanel idBase={idBase} tabKey={tab}>
        {tab === "rentals" &&
          (!access.rentals ? (
            <EmptyState title="Rentals aren't visible to your role" description="Viewing rentals needs the Rentals permission." />
          ) : data.rentals.length === 0 ? (
            <EmptyState
              title="No rentals yet"
              description={machine.status === MachineStatus.retired ? "This machine was never rented." : "Rentals booked on this machine will appear here, newest first."}
            />
          ) : (
            <>
              <TabHeader sub={`${plural(data.rentals.length, "rental")}, newest first`} allHref={`/rentals?machine=${machine.id}`} allLabel="All rentals" />
              <Table bare minWidth={620} caption={`Rentals of ${machine.assetCode}`}>
                <Thead>
                  <Tr>
                    <Th className="w-[104px]">Rental</Th>
                    <Th>Customer · project</Th>
                    <Th className="w-[190px]">Dates</Th>
                    <Th className="w-[110px]">Status</Th>
                    <Th align="right" className="w-[130px]">
                      Rate
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.rentals.map((r) => (
                    <Tr key={r.id} className={r.id === current?.id ? "bg-surface-selected" : undefined}>
                      <Td>
                        <UILink href={`/rentals/${r.id}`} className={refClass}>
                          {rentalRef(r.id)}
                        </UILink>
                      </Td>
                      <Td>
                        <CellStack title={customerName(r, data.customerNames)} sub={r.projectName ?? "No project recorded"} />
                      </Td>
                      <Td className="font-mono text-xs">{formatCompactRange(r.startDate, r.endDate)}</Td>
                      <Td>
                        <Status domain="rental" value={r.status} size="sm" />
                      </Td>
                      <Td align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-xs font-semibold text-ink">{formatMoney(r.rate)}</span>
                          <span className="text-[11px] text-meta-light">{formatRateUnit(r.rateUnit)}</span>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </>
          ))}

        {tab === "logsheets" &&
          (!access.logsheets ? (
            <EmptyState title="Logsheets aren't visible to your role" description="Viewing logsheets needs the Logsheets permission." />
          ) : !logRental ? (
            <EmptyState
              title="No rental is running, so there's nothing to log today"
              description={`${data.utilization ? `${plural(data.utilization.loggedDayCount, "day")} ${data.utilization.loggedDayCount === 1 ? "has" : "have"} a logsheet from earlier rentals.` : "Logsheets from earlier rentals are kept."} Open “All logsheets” to see them by rental.`}
              action={
                <UILink href={`/logsheets?machine=${machine.id}`} className="text-xs font-medium text-accent-text hover:underline">
                  All logsheets
                </UILink>
              }
            />
          ) : (
            <LogsheetRows data={data} coverage={coverage} rentalId={logRental.id} canLog={canLog && logRental.status === RentalStatus.active} onLogDate={onLogDate} />
          ))}

        {tab === "workshop" &&
          (!access.maintenance ? (
            <EmptyState title="Workshop records aren't visible to your role" description="Viewing maintenance needs the Maintenance permission." />
          ) : data.maintenance.length === 0 ? (
            <EmptyState title="No workshop jobs recorded" description="Services, breakdowns and inspections logged on this machine appear here." />
          ) : (
            <>
              <TabHeader sub="Most recent first" allHref={`/maintenance?machine=${machine.id}`} allLabel="All workshop records" />
              <Table bare minWidth={620} caption={`Workshop jobs on ${machine.assetCode}`}>
                <Thead>
                  <Tr>
                    <Th className="w-[140px]">Reason</Th>
                    <Th className="w-[170px]">Dates</Th>
                    <Th>Notes</Th>
                    <Th className="w-[110px]">Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.maintenance.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        <UILink
                          href={`/maintenance/${m.id}?machineId=${machine.id}`}
                          className={cx(
                            "text-xs font-medium no-underline hover:underline",
                            m.maintenanceType === MaintenanceType.breakdown ? "text-destructive" : "text-ink-strong",
                          )}
                        >
                          {MAINTENANCE_TYPE_LABEL[m.maintenanceType]}
                        </UILink>
                      </Td>
                      <Td className={cx("font-mono text-xs", !m.endDate && m.status !== MaintenanceStatus.completed && "text-destructive")}>
                        {formatShortDate(m.startDate)} → {m.endDate ? formatShortDate(m.endDate) : "no end date"}
                      </Td>
                      <Td className="text-ink-muted">
                        <span className="clamp-2" title={m.notes ?? undefined}>
                          {m.notes ?? <span className="italic text-disabled-text">No notes</span>}
                        </span>
                      </Td>
                      <Td>
                        <Status domain="maintenance" value={m.status} size="sm" />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </>
          ))}

        {tab === "transport" &&
          (!access.transport ? (
            <EmptyState title="Transport isn't visible to your role" description="Viewing transport needs the Transport permission." />
          ) : data.transport.length === 0 ? (
            <EmptyState title="No transport trips recorded" description="Mobilization and demobilization trips are planned from each rental's Transport tab." />
          ) : (
            <>
              <TabHeader sub="Mobilization and demobilization trips" allHref="/transport" allLabel="All transport" />
              <Table bare minWidth={680} caption={`Transport trips for ${machine.assetCode}`}>
                <Thead>
                  <Tr>
                    <Th className="w-[130px]">Leg</Th>
                    <Th className="w-[160px]">Planned → actual</Th>
                    <Th>Route</Th>
                    <Th align="right" className="w-[100px]">
                      Charges
                    </Th>
                    <Th className="w-[104px]">Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.transport.map((t) => {
                    const late = t.plannedDate && t.actualDate ? daysBetween(t.plannedDate, t.actualDate) : null;
                    return (
                      <Tr key={t.id}>
                        <Td>
                          <UILink href={`/transport/${t.id}?rentalId=${t.rentalId}`} className="no-underline hover:underline">
                            <CellStack
                              title={t.leg === TransportLeg.mobilization ? "Mobilization" : "Demobilization"}
                              sub={rentalRef(t.rentalId)}
                            />
                          </UILink>
                        </Td>
                        <Td>
                          <CellStack
                            mono
                            title={`${formatShortDate(t.plannedDate)} → ${formatShortDate(t.actualDate)}`}
                            sub={late === null ? (t.actualDate ? "no plan date" : "not done yet") : late === 0 ? "on plan" : `${plural(Math.abs(late), "day")} ${late > 0 ? "late" : "early"}`}
                          />
                        </Td>
                        <Td>
                          <CellStack title={t.pickupLocation ?? "Pickup not recorded"} sub={`→ ${t.destination ?? "destination not recorded"}`} />
                        </Td>
                        <Td align="right" className="font-mono text-xs">
                          {t.charges != null ? formatMoney(t.charges) : "—"}
                        </Td>
                        <Td>
                          <Status domain="transport" value={t.status} size="sm" />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </>
          ))}

        {tab === "invoices" &&
          (!access.billing ? (
            <EmptyState title="Invoices aren't visible to your role" description="Viewing billing needs the Billing permission." />
          ) : data.invoices.length === 0 ? (
            <EmptyState title="No invoices raised" description="Invoices raised against this machine's rentals appear here. Lines are entered by hand, per billing period." />
          ) : (
            <>
              <TabHeader sub="Raised by hand, per billing period" allHref="/billing" allLabel="All invoices" />
              <Table bare minWidth={680} caption={`Invoices for ${machine.assetCode}`}>
                <Thead>
                  <Tr>
                    <Th className="w-[120px]">Invoice</Th>
                    <Th className="w-[150px]">Billing period</Th>
                    <Th className="w-[90px]">Due</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Balance due</Th>
                    <Th className="w-[100px]">Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.invoices.map((inv) => {
                    const detail = data.invoiceDetails.get(inv.id);
                    const status = detail?.invoice.status ?? inv.status;
                    const overdue = status === InvoiceStatus.overdue || (status === InvoiceStatus.issued && inv.dueDate < data.today);
                    return (
                      <Tr key={inv.id} className={overdue ? "bg-destructive-row" : undefined}>
                        <Td>
                          <UILink href={`/billing?invoiceId=${inv.id}`} className={refClass}>
                            {inv.invoiceNumber}
                          </UILink>
                        </Td>
                        <Td>
                          <CellStack mono title={`${formatShortDate(inv.billingPeriodStart)} → ${formatShortDate(inv.billingPeriodEnd)}`} sub={rentalRef(inv.rentalId)} />
                        </Td>
                        <Td className={cx("font-mono text-xs", overdue && "font-semibold text-destructive")}>{formatShortDate(inv.dueDate)}</Td>
                        <Td align="right" className="font-mono text-xs">
                          {formatMoney(inv.totalAmount)}
                        </Td>
                        <Td align="right" className="font-mono text-xs font-semibold">
                          {detail ? (
                            detail.balanceDue > 0 ? (
                              formatMoney(detail.balanceDue)
                            ) : (
                              <span className="text-disabled-text">—</span>
                            )
                          ) : status === InvoiceStatus.paid || status === InvoiceStatus.cancelled || status === InvoiceStatus.draft ? (
                            <span className="text-disabled-text">—</span>
                          ) : (
                            <span className="font-normal text-meta-light" title="Balance comes from the invoice detail">
                              Open invoice
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Status domain="invoice" value={overdue ? InvoiceStatus.overdue : status} size="sm" />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </>
          ))}
      </TabPanel>
    </section>
  );
}

function LogsheetRows({
  data,
  coverage,
  rentalId,
  canLog,
  onLogDate,
}: {
  data: MachineData;
  coverage: Coverage | null;
  rentalId: string;
  canLog: boolean;
  onLogDate: (date: string) => void;
}) {
  const byDate = new Map(data.logsheets.filter((l) => l.rentalId === rentalId).map((l) => [l.logDate, l]));
  // The last 14 expected days, newest first, gaps included.
  const days: string[] = [];
  if (coverage) {
    for (let i = 0; i < LOG_ROWS; i++) {
      const day = addDays(coverage.to, -i);
      if (day < coverage.from) break;
      days.push(day);
    }
  }
  // Logsheets for today (or after the expected window) still show.
  for (const l of byDate.values()) if (!days.includes(l.logDate) && (!coverage || l.logDate > coverage.to)) days.unshift(l.logDate);

  if (days.length === 0) {
    return <EmptyState title="No days to log yet" description="Logsheets start from the rental's first day. Today is logged once it's over." />;
  }

  return (
    <>
      <TabHeader
        sub={`${rentalRef(rentalId)} · last ${plural(days.length, "day")}${coverage ? ` · ${coverage.logged} of ${coverage.elapsed} days logged` : ""}`}
        allHref={`/logsheets?rental=${rentalId}`}
        allLabel={`All logsheets for ${rentalRef(rentalId)}`}
      />
      <Table bare minWidth={640} caption="Recent logsheets">
        <Thead>
          <Tr>
            <Th className="w-[92px]">Date</Th>
            <Th align="right" className="w-[92px]">
              Operating
            </Th>
            <Th align="right" className="w-[80px]">
              Idle
            </Th>
            <Th align="right" className="w-[88px]">
              Overtime
            </Th>
            <Th>Operator · fuel</Th>
            <Th className="w-[160px]">Customer</Th>
          </Tr>
        </Thead>
        <Tbody>
          {days.map((day) => {
            const sheet = byDate.get(day);
            if (!sheet) {
              return (
                <Tr key={day} className="bg-destructive-row">
                  <Td className="font-mono text-xs">{formatShortDate(day)}</Td>
                  <Td colSpan={3} className="text-xs font-medium text-destructive">
                    No logsheet
                  </Td>
                  <Td className="text-xs text-meta-light">
                    {canLog ? (
                      <button type="button" onClick={() => onLogDate(day)} className="text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline">
                        Log {formatShortDate(day)}
                      </button>
                    ) : (
                      "Submitting for this date fills the gap"
                    )}
                  </Td>
                  <Td className="text-disabled-text">—</Td>
                </Tr>
              );
            }
            return (
              <Tr key={day}>
                <Td className="font-mono text-xs">
                  {canLog ? (
                    <button type="button" onClick={() => onLogDate(day)} className="font-mono text-xs text-accent-text hover:underline" title="Correct this logsheet">
                      {formatShortDate(day)}
                    </button>
                  ) : (
                    formatShortDate(day)
                  )}
                </Td>
                <Td align="right" className="font-mono text-xs">
                  {formatHours(sheet.operatingHours)}
                </Td>
                <Td align="right" className={cx("font-mono text-xs", (sheet.idleHours ?? 0) >= 3 && "text-attention")}>
                  {formatHours(sheet.idleHours)}
                </Td>
                <Td align="right" className="font-mono text-xs">
                  {sheet.overtimeHours ? formatHours(sheet.overtimeHours) : "—"}
                </Td>
                <Td>
                  <CellStack
                    title={sheet.operatorName ?? "Operator not recorded"}
                    sub={
                      sheet.fuelConsumed != null
                        ? `Fuel ${formatNumber(sheet.fuelConsumed)}${sheet.fuelUnit ? ` ${sheet.fuelUnit}` : ""}`
                        : "Fuel not recorded"
                    }
                  />
                </Td>
                <Td>
                  <Status domain="logsheet" value={sheet.customerConfirmed ? "confirmed" : "unconfirmed"} size="sm" />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </>
  );
}
