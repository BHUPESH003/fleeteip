"use client";

import { MachineStatus } from "@fleetip/contracts/equipment";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { Button, DescriptionList, EmptyState, Icon, RentalChain, UILink } from "@fleetip/ui";
import { useId } from "react";
import {
  formatDate,
  formatMoney,
  formatRateUnit,
  formatShortDate,
  humanize,
  rentalRef,
} from "../../../../lib/format";
import { Status } from "../../../../lib/status";
import { chainSteps, customerName, customerNote, type Coverage, type MachineData } from "./derive";

const LOCKED_REASON = "Terms lock when a rental starts. Dates can't be changed on any rental yet.";
const OPEN_REASON = "Terms can be edited until the rental starts. Dates can't be changed here.";

export function CurrentRentalCard({
  data,
  rental,
  coverage,
  canEditTerms,
  onEditTerms,
}: {
  data: MachineData;
  rental: Rental | null;
  coverage: Coverage | null;
  canEditTerms: boolean;
  onEditTerms: () => void;
}) {
  const headingId = useId();
  const retired = data.machine.status === MachineStatus.retired;

  if (!rental) {
    const last = data.rentals.find((r) => r.status === RentalStatus.completed);
    return (
      <section aria-labelledby={headingId} className="overflow-hidden rounded-panel border border-border-strong bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-[13px]">
          <h2 id={headingId} className="m-0 text-sm font-semibold leading-none text-ink">
            Current rental
          </h2>
        </div>
        <EmptyState
          className="px-[18px] py-7"
          title="No current rental"
          description={
            retired
              ? `Retired machines can't be rented.${last ? ` The last rental, ${rentalRef(last.id)}, ended ${formatDate(last.actualEndDate ?? last.endDate)} — it's in the history below.` : ""}`
              : !data.access.rentals
                ? "Your role can't view rentals, so bookings on this machine aren't shown."
                : "Nothing is booked on this machine."
          }
        />
      </section>
    );
  }

  const locked = rental.status !== RentalStatus.confirmed;
  const names = data.customerNames;
  const terms = [
    {
      label: "Start date",
      value: `${formatDate(rental.startDate)}${rental.actualStartDate && rental.actualStartDate !== rental.startDate ? ` · actual ${formatShortDate(rental.actualStartDate)}` : ""}`,
      mono: true,
    },
    {
      label: "End date",
      value: rental.endDate
        ? `${formatDate(rental.endDate)}${rental.actualEndDate && rental.actualEndDate !== rental.endDate ? ` · actual ${formatShortDate(rental.actualEndDate)}` : ""}`
        : "Open-ended",
      mono: true,
    },
    { label: "Overtime rate", value: rental.overtimeRate != null ? `${formatMoney(rental.overtimeRate)} per h` : null, mono: true },
    { label: "Mobilization charge", value: rental.mobilizationCharge != null ? formatMoney(rental.mobilizationCharge) : null, mono: true },
    { label: "Demobilization charge", value: rental.demobilizationCharge != null ? formatMoney(rental.demobilizationCharge) : null, mono: true },
    { label: "Notice period", value: rental.noticePeriodDays != null ? `${rental.noticePeriodDays} days` : null, mono: true },
    { label: "Shift structure", value: rental.shiftStructure },
    { label: "Operator", value: rental.operatorScope ? humanize(rental.operatorScope) : null },
    { label: "Sunday condition", value: rental.sundayCondition },
    { label: "Fuel norms", value: rental.fuelNorms },
    { label: "Payment terms", value: rental.paymentTerms },
    { label: "Dehire terms", value: rental.dehireTerms },
  ];

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-panel border border-border-strong bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-[13px]">
        <h2 id={headingId} className="m-0 text-sm font-semibold leading-none text-ink">
          {rental.status === RentalStatus.confirmed ? "Next rental" : "Current rental"}
        </h2>
        <UILink href={`/rentals/${rental.id}`} className="font-mono text-xs font-medium text-accent-text hover:text-accent-text-hover">
          {rentalRef(rental.id)}
        </UILink>
        <Status domain="rental" value={rental.status} size="sm" />
        {rental.actualDatesVerificationStatus && (
          <Status domain="actual_dates" value={rental.actualDatesVerificationStatus} size="sm" />
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          {canEditTerms &&
            (locked ? (
              <Button variant="secondary" size="sm" icon="lock" disabled title={LOCKED_REASON}>
                Edit terms
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon="edit" onClick={onEditTerms} title={OPEN_REASON}>
                Edit terms
              </Button>
            ))}
          <UILink
            href={`/rentals/${rental.id}`}
            className="inline-flex items-center gap-[5px] text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
          >
            Open rental
            <Icon name="external" size={12} />
          </UILink>
        </span>
      </div>

      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <div className="flex flex-wrap items-start gap-x-7 gap-y-3.5">
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-meta">Customer</span>
            <span className="break-words text-[15px] font-medium leading-[1.25] text-ink">{customerName(rental, names)}</span>
            <span className="text-xs leading-[1.35] text-meta">{customerNote(rental, names)}</span>
          </div>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-meta">Project on the rental</span>
            <span className="break-words text-[15px] font-medium leading-[1.25] text-ink">
              {rental.projectName ?? <span className="italic text-disabled-text">Not recorded</span>}
            </span>
            <span className="text-xs leading-[1.35] text-meta">{rental.projectLocation ?? "No site recorded"}</span>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-meta">Contracted rate</span>
            <span className="font-mono text-[19px] font-semibold leading-none text-ink">{formatMoney(rental.rate)}</span>
            <span className="text-xs leading-none text-meta">{formatRateUnit(rental.rateUnit)}</span>
          </div>
        </div>

        <RentalChain steps={chainSteps(data, rental, coverage)} note="each step's own stored status" />

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">
            Terms — as recorded on {rentalRef(rental.id)}
          </span>
          <DescriptionList layout="grid" items={terms} />
          <span className="mt-2 flex items-center gap-1.5 text-[11px] leading-[1.4] text-meta">
            <Icon name="lock" size={12} className="text-meta-light" />
            {locked ? LOCKED_REASON : OPEN_REASON}
          </span>
        </div>
      </div>
    </section>
  );
}
