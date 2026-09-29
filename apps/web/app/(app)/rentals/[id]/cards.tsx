"use client";

import { ActualDatesVerificationStatus, RentalStatus } from "@fleetip/contracts/rental";
import { WorkOrderStatus } from "@fleetip/contracts/work-order";
import { Alert, Button, DescriptionList, Icon, RentalChain, UILink } from "@fleetip/ui";
import { useId, type ReactNode } from "react";
import { formatDate, formatDateTime, rentalRef } from "../../../../lib/format";
import { Status } from "../../../../lib/status";
import { productName } from "../../machines/shared";
import {
  TERMS_LOCKED,
  TERMS_OPEN,
  chainSteps,
  counterpartyName,
  customerName,
  termItems,
  verificationApplies,
  type Coverage,
  type RentalData,
} from "./derive";

function Card({ title, subtitle, children, className }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        <h2 id={id} className="m-0 text-sm font-semibold leading-none text-ink">
          {title}
        </h2>
        {subtitle && <span className="text-[11px] leading-none text-meta">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

const linkClass = "text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

// ------------------------------------------------------------------ chain

export function ChainCard({ data, coverage }: { data: RentalData; coverage: Coverage | null }) {
  return (
    <section aria-label="Where this rental is" className="min-w-0 rounded-panel border border-border-strong bg-surface px-4 py-3.5">
      <RentalChain steps={chainSteps(data, coverage)} note="each step's own stored status" />
      {data.workOrder && data.workOrder.status === WorkOrderStatus.issued && (data.rental.status === RentalStatus.completed || data.rental.status === RentalStatus.cancelled) && (
        <p className="m-0 mt-2 text-[11px] leading-[1.45] text-meta">
          The work order isn&apos;t updated when the rental ends. Open it to complete or cancel it.
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ terms

export function TermsCard({ data }: { data: RentalData }) {
  const { rental, access } = data;
  const locked = rental.status !== RentalStatus.confirmed;
  return (
    <Card title="Terms" subtitle={`as recorded on ${rentalRef(rental.id)}`}>
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <DescriptionList
          layout="stacked"
          minColumnWidth={220}
          items={[
            { label: "Project on the rental", value: rental.projectName, emptyText: "Not recorded" },
            { label: "Site", value: rental.projectLocation, emptyText: "No site recorded" },
          ]}
        />
        <DescriptionList layout="grid" items={termItems(rental)} />
        <span className="flex items-center gap-1.5 text-[11px] leading-[1.4] text-meta">
          <Icon name="lock" size={12} className="text-meta-light" />
          {access.isRenter
            ? `Terms as agreed with ${counterpartyName(data)}. Rental dates can't be changed in FleetIP yet.`
            : locked
              ? TERMS_LOCKED
              : TERMS_OPEN}
        </span>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ aside

export function CounterpartyCard({ data }: { data: RentalData }) {
  const { rental, access } = data;
  if (access.isRenter) {
    return (
      <Card title="Rental company">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <span className="break-words text-[15px] font-medium leading-[1.25] text-ink">{counterpartyName(data)}</span>
          <span className="text-xs leading-[1.45] text-meta">
            They manage the machine, transport, logsheets and invoices on this rental.
          </span>
        </div>
      </Card>
    );
  }
  const snapshot = rental.clientSnapshot;
  const knownName = rental.renterOrganizationId ? data.customerNames.has(rental.renterOrganizationId) : false;
  return (
    <Card title="Customer">
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-col gap-1">
          <span className="break-words text-[15px] font-medium leading-[1.25] text-ink">{customerName(rental, data.customerNames)}</span>
          <span className="text-xs leading-[1.45] text-meta">
            {snapshot
              ? "Customer not on FleetIP · details as entered on the rental"
              : knownName
                ? "FleetIP organization. They see this rental, can verify or dispute its actual dates and see its invoices."
                : "FleetIP organization. Their name needs the Quotations permission."}
          </span>
        </div>
        {snapshot && (
          <DescriptionList
            layout="rows"
            items={[
              { label: "Contact person", value: snapshot.contactPerson, emptyText: "Not recorded" },
              {
                label: "Phone",
                value: snapshot.phone ? (
                  <a href={`tel:${snapshot.phone.replace(/[^\d+]/g, "")}`} className="font-mono text-accent-text hover:underline">
                    {snapshot.phone}
                  </a>
                ) : null,
                emptyText: "Not recorded",
              },
              {
                label: "Email",
                value: snapshot.email ? (
                  <a href={`mailto:${snapshot.email}`} className="break-all text-accent-text hover:underline">
                    {snapshot.email}
                  </a>
                ) : null,
                emptyText: "Not recorded",
              },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

export function MachineCard({ data }: { data: RentalData }) {
  const { machine, product, rental, access } = data;
  if (access.isRenter) {
    return (
      <Card title="Machine">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <span className="font-mono text-sm font-semibold text-ink">{rental.machineAssetCode ?? "Asset code not available"}</span>
          <span className="text-xs leading-[1.45] text-meta">The machine&apos;s records are kept by {counterpartyName(data)}.</span>
        </div>
      </Card>
    );
  }
  if (!machine) {
    return (
      <Card title="Machine">
        <p className="m-0 px-4 py-3.5 text-xs leading-[1.5] text-ink-soft">
          {access.machines
            ? "This rental's machine wasn't found in your fleet list."
            : "Machine details need the Equipment permission. Your role can't open machines."}
        </p>
      </Card>
    );
  }
  return (
    <Card title="Machine">
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <UILink
            href={`/machines/${machine.id}`}
            className="font-mono text-sm font-semibold text-ink no-underline hover:text-accent-text hover:underline"
          >
            {machine.assetCode}
          </UILink>
          <Status domain="machine" value={machine.status} size="sm" />
        </div>
        <DescriptionList
          layout="rows"
          items={[
            { label: "Product", value: productName(product), emptyText: "Catalogue product not found" },
            { label: "Registration", value: machine.registrationNumber, mono: true },
          ]}
        />
        <UILink href={`/machines/${machine.id}`} className={`inline-flex items-center gap-1.5 self-start ${linkClass}`}>
          Open machine
          <Icon name="external" size={12} />
        </UILink>
      </div>
    </Card>
  );
}

export function ActualDatesCard({ data }: { data: RentalData }) {
  const { rental } = data;
  const status = rental.actualDatesVerificationStatus;
  const applies = verificationApplies(rental) || data.access.isRenter;
  return (
    <Card title="Actual dates" subtitle="what happened, against the plan">
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        <DescriptionList
          layout="rows"
          items={[
            {
              label: "Actual start",
              value: rental.actualStartDate ? formatDate(rental.actualStartDate) : null,
              mono: true,
              emptyText: rental.status === RentalStatus.confirmed ? "Recorded when it starts" : "Not recorded",
            },
            {
              label: "Actual end",
              value: rental.actualEndDate ? formatDate(rental.actualEndDate) : null,
              mono: true,
              emptyText: rental.status === RentalStatus.confirmed || rental.status === RentalStatus.active ? "Recorded when it goes off rent" : "Not recorded",
            },
            {
              label: data.access.isRenter ? "Your verification" : "Customer verification",
              value: !status ? null : applies ? <Status domain="actual_dates" value={status} size="sm" /> : null,
              emptyText: !status ? "Nothing to verify yet" : "Not asked · customer isn't on FleetIP",
            },
          ]}
        />
        {status === ActualDatesVerificationStatus.disputed && (
          <p className="m-0 rounded-cell border border-destructive-border bg-destructive-wash px-3 py-2 text-xs leading-[1.5] text-ink-body">
            <span className="font-semibold text-destructive">Reason given: </span>
            {rental.actualDatesDisputeReason ? `“${rental.actualDatesDisputeReason}”` : "No reason was recorded."}
          </p>
        )}
      </div>
    </Card>
  );
}

export function RecordInfo({ data }: { data: RentalData }) {
  return (
    <section aria-label="Record information" className="px-1 py-0.5">
      <p className="m-0 text-[11px] leading-[1.5] text-meta-light">
        Created {formatDateTime(data.rental.createdAt)} · last changed {formatDateTime(data.rental.updatedAt)}. FleetIP doesn&apos;t keep a
        history of who changed what on a rental, so there&apos;s no activity log here.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ Renter: verify or dispute

export function RenterDatesCallout({
  data,
  onVerify,
  onDispute,
  disabledReason,
}: {
  data: RentalData;
  onVerify: () => void;
  onDispute: () => void;
  /** Set while offline — the buttons stay visible and say why. */
  disabledReason: string | null;
}) {
  const { rental } = data;
  const company = counterpartyName(data);
  if (rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.disputed) {
    return (
      <Alert tone="neutral" icon="info" title="You disputed the recorded dates">
        {rental.actualDatesDisputeReason ? `Your reason: “${rental.actualDatesDisputeReason}”. ` : ""}
        {company} has been notified. If they record new dates you&apos;ll be asked to verify them again.
      </Alert>
    );
  }
  if (rental.actualDatesVerificationStatus !== ActualDatesVerificationStatus.pending || !data.access.respond) return null;
  return (
    <Alert
      tone="warning"
      icon="calendar_check"
      title={`Check the dates ${company} recorded`}
      action={
        <>
          <Button size="sm" icon="check" onClick={onVerify} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
            Verify dates
          </Button>
          <Button size="sm" variant="secondary" onClick={onDispute} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
            Dispute
          </Button>
        </>
      }
    >
      Actual start <span className="font-mono">{formatDate(rental.actualStartDate)}</span> · actual end{" "}
      <span className="font-mono">{rental.actualEndDate ? formatDate(rental.actualEndDate) : "not recorded yet"}</span>. Verify them if
      they&apos;re right, or dispute them with a reason.
    </Alert>
  );
}
