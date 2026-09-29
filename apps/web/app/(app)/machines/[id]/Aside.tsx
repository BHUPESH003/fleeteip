"use client";

import { MachineStatus } from "@fleetip/contracts/equipment";
import { Button, DescriptionList, Icon, Input, Meter, UILink, cx } from "@fleetip/ui";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apiClient } from "../../../../lib/api-client";
import { describeError } from "../../../../lib/errors";
import { daysBetween, formatDate, formatDateTime, formatNumber, plural, todayIsoDate } from "../../../../lib/format";
import { specGroups } from "../shared";
import {
  activeRental,
  currentRental,
  freeCheckResult,
  lastInspection,
  workOrderFor,
  type FreeResult,
  type MachineData,
} from "./derive";

function AsideSection({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-panel border border-border-strong bg-surface">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        {icon}
        <h2 id={id} className="m-0 text-sm font-semibold leading-none text-ink">
          {title}
        </h2>
        {subtitle && <span className="text-[11px] leading-none text-meta">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ Is it free?

export interface CheckRequest {
  from: string;
  to: string;
  nonce: number;
}

const RESULT_STYLE: Record<FreeResult["kind"], { box: string; fg: string; icon: "success" | "error" | "warning" }> = {
  ok: { box: "border-available-border bg-available-wash", fg: "text-available", icon: "success" },
  no: { box: "border-destructive-border bg-destructive-wash", fg: "text-destructive", icon: "error" },
  warn: { box: "border-attention-border bg-attention-wash", fg: "text-attention", icon: "warning" },
};

export function IsItFree({
  data,
  organizationId,
  canCheck,
  canCreateRental,
  onCreateRental,
  request,
}: {
  data: MachineData;
  organizationId: string;
  canCheck: boolean;
  canCreateRental: boolean;
  onCreateRental: (from: string, to: string | null) => void;
  /** Filled from an attention row ("Check from 16 Oct"). */
  request: CheckRequest | null;
}) {
  const today = todayIsoDate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fromError = touched && !from ? "Pick a start date to check." : null;
  const fromWarning = from && from < today ? "This date has passed. You can check it, but a new rental can't start before today." : null;
  const toError = touched && to && from && to < from ? "“To” can't be before “From”. Pick a later date or leave it empty." : null;

  async function run(checkFrom: string, checkTo: string) {
    setTouched(true);
    setFailure(null);
    if (!checkFrom || (checkTo && checkTo < checkFrom)) return;
    setBusy(true);
    setResult(null);
    try {
      let apiAvailable: boolean | null = null;
      if (data.machine.status !== MachineStatus.retired) {
        const res = (await apiClient.checkRentalAvailability(
          organizationId,
          data.machine.id,
          checkFrom,
          checkTo || undefined,
        )) as { available: boolean };
        apiAvailable = res.available;
      }
      setResult(freeCheckResult(data, checkFrom, checkTo || null, apiAvailable));
    } catch (err) {
      setFailure(describeError(err, "The check didn't run").body);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!request) return;
    setFrom(request.from);
    setTo(request.to);
    void run(request.from, request.to);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // run() reads the latest data each time it's called
  }, [request?.nonce]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(from, to);
  }

  const style = result ? RESULT_STYLE[result.kind] : null;

  return (
    <AsideSection title="Is it free?" icon={<Icon name="calendar_check" size={15} className="self-center text-on-rent" />}>
      {!canCheck ? (
        <p className="m-0 px-4 py-3.5 text-xs leading-[1.5] text-ink-soft">
          Checking availability needs the Rentals permission. Your role can&apos;t run it.
        </p>
      ) : (
        <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 py-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Input
              label="From"
              required
              type="date"
              mono
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setResult(null);
              }}
              onBlur={() => setTouched(true)}
              error={fromError ?? undefined}
              warning={fromWarning ?? undefined}
            />
            <Input
              label="To"
              type="date"
              mono
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setResult(null);
              }}
              onBlur={() => setTouched(true)}
              error={toError ?? undefined}
            />
          </div>
          <span className="text-[11px] leading-[1.45] text-meta-light">Leave “To” empty to check an open-ended booking.</span>
          <Button type="submit" variant="secondary" busy={busy} busyLabel="Checking…">
            Check availability
          </Button>
          {failure && (
            <div role="alert" className="flex gap-2 rounded-control border border-destructive-border bg-destructive-wash px-3 py-2.5 text-xs leading-[1.5] text-ink-body">
              <Icon name="error" size={14} className="mt-px text-sev-error" />
              {failure}
            </div>
          )}
          {result && style && (
            <div role="status" className={cx("flex flex-col gap-1.5 rounded-control border px-3 py-2.5 animate-fip-in", style.box)}>
              <span className={cx("flex items-center gap-[7px] text-sm font-semibold leading-[1.3]", style.fg)}>
                <Icon name={style.icon} size={15} />
                {result.title}
              </span>
              <span className="text-xs leading-[1.5] text-ink-body">{result.body}</span>
              {result.kind === "ok" && result.canCreate && canCreateRental && (
                <button
                  type="button"
                  onClick={() => onCreateRental(from, to || null)}
                  className="self-start text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline"
                >
                  Create rental with these dates →
                </button>
              )}
            </div>
          )}
          <span className="text-[11px] leading-[1.45] text-meta-light">
            The availability check covers rentals only, so workshop jobs on this machine are compared here in the browser.
          </span>
        </form>
      )}
    </AsideSection>
  );
}

// ------------------------------------------------------------------ Hours logged

export function HoursLogged({ data }: { data: MachineData }) {
  const u = data.utilization;
  if (!data.access.logsheets) {
    return (
      <AsideSection title="Hours logged">
        <p className="m-0 px-4 py-3.5 text-xs leading-[1.5] text-ink-soft">Viewing logsheets needs the Logsheets permission.</p>
      </AsideSection>
    );
  }
  const total = u ? u.totalOperatingHours + u.totalIdleHours + u.totalOvertimeHours : 0;
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <AsideSection title="Hours logged" subtitle="all rentals, from logsheets">
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {!u || u.loggedDayCount === 0 ? (
          <p className="m-0 text-xs leading-[1.5] text-ink-soft">No logsheets yet. Hours appear once the first one is submitted.</p>
        ) : (
          <>
            <Meter
              segments={[
                { label: "Operating", count: `${formatNumber(u.totalOperatingHours)} h`, pct: share(u.totalOperatingHours), tone: "operating", share: `${share(u.totalOperatingHours)}%` },
                { label: "Idle", count: `${formatNumber(u.totalIdleHours)} h`, pct: share(u.totalIdleHours), tone: "idle", share: `${share(u.totalIdleHours)}%` },
                { label: "Overtime", count: `${formatNumber(u.totalOvertimeHours)} h`, pct: share(u.totalOvertimeHours), tone: "overtime", share: `${share(u.totalOvertimeHours)}%` },
              ]}
            />
            <DescriptionList layout="rows" items={[{ label: "Days with a logsheet", value: formatNumber(u.loggedDayCount, 0), mono: true }]} />
          </>
        )}
        <span className="text-[11px] leading-[1.5] text-meta">
          Shares are of logged hours. FleetIP doesn&apos;t count days on rent per machine, so there&apos;s no “% of the year” figure.
        </span>
      </div>
    </AsideSection>
  );
}

// ------------------------------------------------------------------ Inspection & documents

export function InspectionDocuments({ data }: { data: MachineData }) {
  const inspection = data.access.maintenance ? lastInspection(data) : null;
  const rental = currentRental(data) ?? activeRental(data);
  const wo = rental ? workOrderFor(data, rental) : null;
  const inspectedOn = inspection ? (inspection.endDate ?? inspection.startDate) : null;
  const daysSince = inspectedOn ? daysBetween(inspectedOn, data.today) : null;
  return (
    <AsideSection title="Inspection & documents">
      <div className="border-b border-border px-4 py-3">
        <DescriptionList
          layout="rows"
          items={[
            {
              label: "Last inspection",
              value: !data.access.maintenance ? "Needs Maintenance permission" : inspectedOn ? formatDate(inspectedOn) : null,
              emptyText: "None recorded",
              mono: Boolean(inspectedOn),
            },
            {
              label: "Days since",
              value:
                daysSince === null ? null : (
                  <span className={daysSince > 180 ? "text-attention" : undefined}>{formatNumber(daysSince, 0)}</span>
                ),
              emptyText: "—",
              mono: true,
            },
            {
              label: "Work order on file",
              value: wo ? (
                <UILink href={`/work-orders/${wo.id}`} className="font-mono text-accent-text hover:underline">
                  {wo.referenceNumber}
                </UILink>
              ) : null,
              emptyText: rental ? "None for this rental" : "No current rental",
            },
          ]}
        />
      </div>
      <div className="flex items-start gap-2 px-4 py-3">
        <Icon name="document" size={14} className="mt-px text-meta-light" />
        <span className="text-xs leading-[1.5] text-ink-soft">
          Insurance, fitness, PUC and load-test certificates aren&apos;t tracked in FleetIP yet, so there&apos;s nothing here to
          expire or warn about.
        </span>
      </div>
    </AsideSection>
  );
}

// ------------------------------------------------------------------ Specifications

export function Specifications({ data }: { data: MachineData }) {
  const groups = specGroups(data.product?.specifications);
  const { product } = data;
  return (
    <AsideSection title="Specifications" subtitle="from catalogue product">
      <div className="border-b border-border px-4 py-[11px] last:border-0">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">Product</span>
        <DescriptionList
          layout="rows"
          items={[
            { label: "Manufacturer", value: product?.manufacturer },
            { label: "Model", value: product?.name },
            {
              label: "Rated capacity",
              value: product?.capacity ? `${formatNumber(product.capacity, 2)} ${product.capacityUnit ?? ""}`.trim() : null,
              mono: true,
            },
          ]}
        />
      </div>
      {groups.map((group) => (
        <div key={group.key} className="border-b border-border px-4 py-[11px] last:border-0">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{group.label}</span>
          <DescriptionList layout="rows" items={group.items.map((item) => ({ label: item.label, value: item.value, mono: true }))} />
        </div>
      ))}
      {groups.length === 0 && (
        <p className="m-0 px-4 py-3 text-xs text-ink-soft">No detailed specifications are recorded on this catalogue product.</p>
      )}
    </AsideSection>
  );
}

// ------------------------------------------------------------------ Record info

export function RecordInfo({ data }: { data: MachineData }) {
  return (
    <section aria-label="Record information" className="px-1 py-0.5">
      <p className="m-0 text-[11px] leading-[1.5] text-meta-light">
        Registered in FleetIP {formatDateTime(data.machine.createdAt)}. FleetIP doesn&apos;t record who registered it or when it
        was last edited{data.machine.status === MachineStatus.retired ? ", or when it was retired" : ""}.
      </p>
      {data.rentals.length > 0 && (
        <p className="m-0 mt-1 text-[11px] leading-[1.5] text-meta-light">{plural(data.rentals.length, "rental")} on record.</p>
      )}
    </section>
  );
}
