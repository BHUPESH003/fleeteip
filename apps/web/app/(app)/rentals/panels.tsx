"use client";

import type { Logsheet, RentalUtilization } from "@fleetip/contracts/logsheet";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, type TransportRecord } from "@fleetip/contracts/transport";
import {
  Button,
  CellStack,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  EmptyState,
  ErrorState,
  FormBanner,
  Input,
  KeyFigures,
  Menu,
  Panel,
  Skeleton,
  Table,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  useToast,
} from "@fleetip/ui";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError } from "../../../lib/errors";
import { useAction, useForm } from "../../../lib/form";
import {
  addDays,
  daysBetween,
  formatDate,
  formatHours,
  formatMoney,
  formatNumber,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { Status } from "../../../lib/status";
import { LogsheetDrawer } from "./LogsheetDrawer";

const LEG_LABEL: Record<TransportLeg, string> = { mobilization: "Mobilization", demobilization: "Demobilization" };
const LEGS: TransportLeg[] = [TransportLeg.mobilization, TransportLeg.demobilization];

// ======================================================================= Transport

/**
 * A rental's two transport legs. One record per leg (the API refuses a
 * second), so a cancelled leg can't be planned again on the same rental —
 * the cancel confirmation says so. Renters (transport.respond) see it read-only.
 */
export function TransportPanel({
  organizationId,
  rental,
  readOnly = false,
  onChanged,
}: {
  organizationId: string;
  rental: Rental;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const { online } = useConnection();
  const [records, setRecords] = useState<TransportRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<{ leg: TransportLeg; record: TransportRecord | null } | null>(null);
  const [deliver, setDeliver] = useState<TransportRecord | null>(null);
  const [cancel, setCancel] = useState<TransportRecord | null>(null);
  // One write at a time (dispatch or cancel); `target` says which trip it's for.
  const action = useAction();
  const [target, setTarget] = useState<string | null>(null);
  const busyFor = (id: string | undefined) => action.busy && target === id;

  // This panel reports failed writes as a toast rather than a banner.
  useEffect(() => {
    if (action.banner) toast.error(action.banner);
  }, [action.banner]);

  async function refresh() {
    try {
      setRecords((await apiClient.listTransportForRental(organizationId, rental.id)) as TransportRecord[]);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    setRecords(null);
    void refresh();
  }, [organizationId, rental.id]);

  function dispatch(record: TransportRecord) {
    setTarget(record.id);
    void action.run(
      async () => {
        await apiClient.updateTransport(organizationId, rental.id, record.leg, { status: TransportStatus.dispatched });
        await refresh();
      },
      {
        failTitle: `${LEG_LABEL[record.leg]} wasn't updated`,
        success: () => ({ title: `${LEG_LABEL[record.leg]} dispatched`, body: `${rentalRef(rental.id)} · status changed from Planned.` }),
        onDone: () => onChanged?.(),
      },
    );
  }

  if (error && !records) {
    return (
      <ErrorState
        title="Transport didn't load"
        message={describeError(error).body}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      />
    );
  }

  const canWrite = !readOnly && online;
  const closed = rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled;

  return (
    <Panel title="Transport" subtitle="Mobilization and demobilization" padding="none">
      <ul className="m-0 list-none p-0">
        {LEGS.map((leg) => {
          const record = records?.find((r) => r.leg === leg) ?? null;
          const late = record?.plannedDate && record.actualDate ? daysBetween(record.plannedDate, record.actualDate) : null;
          return (
            <li key={leg} className="flex flex-col gap-3 border-b border-border px-4 py-3.5 last:border-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold text-ink">{LEG_LABEL[leg]}</span>
                {records === null ? (
                  <Skeleton className="h-4 w-20" />
                ) : record ? (
                  <Status domain="transport" value={record.status} size="sm" />
                ) : (
                  <span className="text-xs font-medium text-attention">Not planned</span>
                )}
                {canWrite && records !== null && (
                  <span className="ml-auto flex items-center gap-2">
                    {!record && !closed && (
                      <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm({ leg, record: null })}>
                        Plan {LEG_LABEL[leg].toLowerCase()}
                      </Button>
                    )}
                    {record?.status === TransportStatus.planned && (
                      <Button size="sm" variant="secondary" busy={busyFor(record.id)} busyLabel="Saving…" onClick={() => dispatch(record)}>
                        Mark dispatched
                      </Button>
                    )}
                    {record?.status === TransportStatus.dispatched && (
                      <Button size="sm" variant="secondary" onClick={() => setDeliver(record)}>
                        Mark delivered
                      </Button>
                    )}
                    {record && (record.status === TransportStatus.planned || record.status === TransportStatus.dispatched) && (
                      <Menu
                        label={`More actions for ${LEG_LABEL[leg].toLowerCase()}`}
                        triggerSize="sm"
                        items={[
                          { key: "edit", label: "Edit plan", icon: "edit", hint: "Route, planned date, vehicle, charges.", onSelect: () => setForm({ leg, record }) },
                          {
                            key: "cancel",
                            label: `Cancel ${LEG_LABEL[leg].toLowerCase()}`,
                            icon: "close",
                            danger: true,
                            separatorBefore: true,
                            hint: "Final — this leg can't be planned again on this rental.",
                            onSelect: () => setCancel(record),
                          },
                        ]}
                      />
                    )}
                  </span>
                )}
              </div>
              {record ? (
                <DescriptionList
                  layout="grid"
                  minColumnWidth={170}
                  items={[
                    { label: "From", value: record.pickupLocation },
                    { label: "To", value: record.destination },
                    { label: "Planned", value: record.plannedDate ? formatDate(record.plannedDate) : null, mono: true },
                    {
                      label: "Actual",
                      value: record.actualDate
                        ? `${formatDate(record.actualDate)}${late ? ` · ${plural(Math.abs(late), "day")} ${late > 0 ? "late" : "early"}` : ""}`
                        : null,
                      mono: true,
                      emptyText: "Not done yet",
                    },
                    { label: "Charges", value: record.charges != null ? formatMoney(record.charges) : null, mono: true },
                    { label: "Vehicle / details", value: record.transportDetails },
                    ...(record.notes ? [{ label: "Notes", value: record.notes, wide: true }] : []),
                  ]}
                />
              ) : records !== null ? (
                <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                  {closed
                    ? "No trip was recorded for this leg."
                    : leg === TransportLeg.mobilization
                      ? `No trip to site is recorded.${rental.projectLocation ? ` Destination would be ${rental.projectLocation}.` : ""}`
                      : `No return trip is recorded.${rental.projectLocation ? ` Pickup would be ${rental.projectLocation}.` : ""}`}
                </p>
              ) : null}
              {record && (
                <UILink href={`/transport/${record.id}?rentalId=${rental.id}`} className="self-start text-xs font-medium text-accent-text hover:underline">
                  Open trip record
                </UILink>
              )}
            </li>
          );
        })}
      </ul>

      {form && (
        <TransportFormDialog
          organizationId={organizationId}
          rental={rental}
          leg={form.leg}
          record={form.record}
          onClose={() => setForm(null)}
          onSaved={() => {
            void refresh();
            onChanged?.();
          }}
        />
      )}
      {deliver && (
        <DeliverDialog
          organizationId={organizationId}
          rental={rental}
          record={deliver}
          onClose={() => setDeliver(null)}
          onSaved={() => {
            void refresh();
            onChanged?.();
          }}
        />
      )}
      <ConfirmDialog
        open={cancel !== null}
        onClose={() => setCancel(null)}
        icon="close"
        tone="danger"
        title={cancel ? `Cancel ${LEG_LABEL[cancel.leg].toLowerCase()} for ${rentalRef(rental.id)}?` : ""}
        consequences={[
          "The trip record stays, marked Cancelled.",
          "This leg can't be planned again on this rental — FleetIP keeps one record per leg.",
          "The rental itself isn't changed.",
        ]}
        cancelLabel="Keep trip"
        confirmLabel="Cancel trip"
        confirmVariant="danger"
        busyLabel="Cancelling…"
        busy={busyFor(cancel?.id)}
        onConfirm={() => {
          if (!cancel) return;
          setTarget(cancel.id);
          void action.run(() => apiClient.updateTransport(organizationId, rental.id, cancel.leg, { status: TransportStatus.cancelled }), {
            failTitle: "The trip wasn't cancelled",
            success: () => ({ title: `${LEG_LABEL[cancel.leg]} cancelled`, body: `${rentalRef(rental.id)} · the trip is kept as Cancelled.` }),
            onDone: () => {
              setCancel(null);
              void refresh().then(() => onChanged?.());
            },
          });
        }}
      />
    </Panel>
  );
}

type TripValues = Record<"pickupLocation" | "destination" | "plannedDate" | "transportDetails" | "charges" | "notes", string>;

/** A recorded value can be corrected but not cleared (the API has no remove). */
function tripSchema(record: TransportRecord | null) {
  const kept = (was: string | null | undefined) => (now: string) => !(record && was && !now.trim());
  return z
    .object({
      pickupLocation: z
        .string()
        .refine(kept(record?.pickupLocation), "A recorded pickup can be corrected but not removed.")
        .refine((v) => v.length <= 300, "Up to 300 characters."),
      destination: z
        .string()
        .refine(kept(record?.destination), "A recorded destination can be corrected but not removed.")
        .refine((v) => v.length <= 300, "Up to 300 characters."),
      plannedDate: z.string().refine(kept(record?.plannedDate), "A planned date can be changed but not removed."),
      transportDetails: z.string().max(1000, "Up to 1,000 characters."),
      charges: z.string().refine((v) => v.trim() === "" || Number(v) >= 0, "Enter 0 or more, or leave it empty."),
      notes: z.string().max(2000, "Notes are up to 2,000 characters."),
    })
    .transform((v) => ({
      pickupLocation: v.pickupLocation.trim() || undefined,
      destination: v.destination.trim() || undefined,
      plannedDate: v.plannedDate || undefined,
      transportDetails: v.transportDetails.trim() || undefined,
      charges: v.charges.trim() === "" ? undefined : Number(v.charges),
      notes: v.notes.trim() || undefined,
    }));
}

function tripValues(rental: Rental, leg: TransportLeg, record: TransportRecord | null): TripValues {
  const mobilization = leg === TransportLeg.mobilization;
  const charge = mobilization ? rental.mobilizationCharge : rental.demobilizationCharge;
  return {
    pickupLocation: record?.pickupLocation ?? (mobilization ? "" : (rental.projectLocation ?? "")),
    destination: record?.destination ?? (mobilization ? (rental.projectLocation ?? "") : ""),
    plannedDate: record?.plannedDate ?? (mobilization ? rental.startDate : (rental.endDate ?? "")),
    transportDetails: record?.transportDetails ?? "",
    charges: record?.charges != null ? String(record.charges) : charge != null ? String(charge) : "",
    notes: record?.notes ?? "",
  };
}

function TransportFormDialog({
  organizationId,
  rental,
  leg,
  record,
  onClose,
  onSaved,
}: {
  organizationId: string;
  rental: Rental;
  leg: TransportLeg;
  record: TransportRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const schema = useMemo(() => tripSchema(record), [record]);
  const form = useForm({ schema, initial: tripValues(rental, leg, record), failTitle: "The trip wasn't saved" });
  const planned = form.values.plannedDate;
  const warning =
    planned && leg === TransportLeg.mobilization && planned > rental.startDate
      ? `That's after the rental starts (${formatDate(rental.startDate)}).`
      : planned && leg === TransportLeg.demobilization && rental.endDate && planned < rental.endDate
        ? `That's before the rental ends (${formatDate(rental.endDate)}).`
        : undefined;

  const submit = form.submit(async (body) => {
    if (record) await apiClient.updateTransport(organizationId, rental.id, leg, body);
    else await apiClient.createTransport(organizationId, rental.id, { leg, ...body });
    toast.success({
      title: record ? `${LEG_LABEL[leg]} plan updated` : `${LEG_LABEL[leg]} planned`,
      body: `${rentalRef(rental.id)}${body.plannedDate ? ` · ${formatDate(body.plannedDate)}` : ""}.`,
    });
    onSaved();
    onClose();
  });

  // Route and date rules show as you type; the rest wait for blur or submit.
  const parsed = schema.safeParse(form.values);
  const eager = (key: "pickupLocation" | "destination" | "plannedDate") =>
    parsed.success ? undefined : parsed.error.issues.find((issue) => issue.path[0] === key)?.message;
  const bind = (key: keyof TripValues) => {
    const field = form.field(key);
    return { ...field, error: key === "pickupLocation" || key === "destination" || key === "plannedDate" ? (field.error ?? eager(key)) : field.error };
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${record ? "Edit" : "Plan"} ${LEG_LABEL[leg].toLowerCase()} · ${rentalRef(rental.id)}`}
      description={leg === TransportLeg.mobilization ? "The trip that takes the machine to site." : "The trip that brings the machine back."}
      icon="transport"
      size="md"
      dismissible={!form.busy}
      onSubmit={submit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…">
            {record ? "Save plan" : `Plan ${LEG_LABEL[leg].toLowerCase()}`}
          </Button>
        </>
      }
    >
      {form.banner && <FormBanner title="The trip wasn't saved">{form.banner.body}</FormBanner>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Pickup" {...bind("pickupLocation")} />
        <Input label="Destination" {...bind("destination")} />
        <Input label="Planned date" type="date" mono {...bind("plannedDate")} warning={warning} />
        <Input label="Charges" prefix="₹" mono inputMode="decimal" {...bind("charges")} hint="Prefilled from the rental's terms." />
      </div>
      <Input label="Vehicle / details" {...bind("transportDetails")} placeholder="e.g. Low-bed trailer, driver name" />
      <Textarea label="Notes" rows={2} {...bind("notes")} />
    </Dialog>
  );
}

function DeliverDialog({
  organizationId,
  rental,
  record,
  onClose,
  onSaved,
}: {
  organizationId: string;
  rental: Rental;
  record: TransportRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayIsoDate();
  const [date, setDate] = useState(today);
  const action = useAction();
  const error = !date ? "Pick the day it arrived." : date > today ? "This records what happened, so it can't be later than today." : undefined;
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      icon="transport"
      tone="success"
      title={`Mark ${LEG_LABEL[record.leg].toLowerCase()} delivered?`}
      description={`${rentalRef(rental.id)} · ${record.pickupLocation ?? "pickup not recorded"} → ${record.destination ?? "destination not recorded"}`}
      consequences={[
        "Records the delivery date below as the trip's actual date.",
        rental.renterOrganizationId ? "The customer is notified that the trip was delivered." : "No one else is notified — this customer isn't on FleetIP.",
      ]}
      cancelLabel="Not yet"
      confirmLabel="Mark delivered"
      busyLabel="Saving…"
      busy={action.busy}
      confirmDisabled={Boolean(error)}
      onConfirm={() => {
        void action.run(() => apiClient.updateTransport(organizationId, rental.id, record.leg, { status: TransportStatus.delivered, actualDate: date }), {
          failTitle: "Delivery wasn't recorded",
          success: () => ({ title: `${LEG_LABEL[record.leg]} delivered`, body: `${rentalRef(rental.id)} · arrived ${formatDate(date)}.` }),
          onDone: () => {
            onSaved();
            onClose();
          },
        });
      }}
    >
      {action.banner && <FormBanner title="Nothing was changed">{action.banner.body}</FormBanner>}
      <Input label="Delivered on" required type="date" mono max={today} value={date} onChange={(e) => setDate(e.target.value)} error={error} />
    </ConfirmDialog>
  );
}

// ======================================================================= Logsheets

/**
 * A rental's logsheets: utilization figures, every expected day (gaps
 * shown) while it runs, and Submit/correct via the logsheet drawer.
 * Renters (logsheet.respond) see it read-only.
 */
export function LogsheetPanel({
  organizationId,
  rental,
  readOnly = false,
  onChanged,
}: {
  organizationId: string;
  rental: Rental;
  readOnly?: boolean;
  /** Called after a logsheet is saved here, so the host page can re-derive its figures. */
  onChanged?: () => void;
}) {
  const { online } = useConnection();
  const [logsheets, setLogsheets] = useState<Logsheet[] | null>(null);
  const [utilization, setUtilization] = useState<RentalUtilization | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const today = todayIsoDate();

  async function refresh() {
    try {
      const [list, util] = await Promise.all([
        apiClient.listLogsheetsForRental(organizationId, rental.id) as Promise<Logsheet[]>,
        (apiClient.getRentalUtilization(organizationId, rental.id) as Promise<RentalUtilization>).catch(() => null),
      ]);
      setLogsheets(list);
      setUtilization(util);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    setLogsheets(null);
    void refresh();
  }, [organizationId, rental.id]);

  const canSubmit = !readOnly && rental.status === RentalStatus.active && online;
  const running = rental.status === RentalStatus.active || rental.status === RentalStatus.off_rent;

  // Expected days (rental start → yesterday, capped at the end date), newest first, with gaps.
  const rows = useMemo(() => {
    if (!logsheets) return [];
    const byDate = new Map(logsheets.map((l) => [l.logDate, l]));
    if (!running) return [...logsheets].sort((a, b) => b.logDate.localeCompare(a.logDate)).map((l) => ({ date: l.logDate, sheet: l }));
    const from = rental.actualStartDate && rental.actualStartDate > rental.startDate ? rental.actualStartDate : rental.startDate;
    const yesterday = addDays(today, -1);
    let to = rental.endDate && rental.endDate < yesterday ? rental.endDate : yesterday;
    // Once off rent, nothing after the actual end can be logged (same cap as rentals/[id]/derive coverageFor).
    if (rental.actualEndDate && rental.actualEndDate < to) to = rental.actualEndDate;
    const out: Array<{ date: string; sheet: Logsheet | undefined }> = [];
    for (const l of logsheets) if (l.logDate > to) out.push({ date: l.logDate, sheet: l });
    for (let day = to; day >= from; day = addDays(day, -1)) out.push({ date: day, sheet: byDate.get(day) });
    for (const l of logsheets) if (l.logDate < from) out.push({ date: l.logDate, sheet: l });
    return out;
  }, [logsheets, running, rental.actualStartDate, rental.startDate, rental.endDate, rental.actualEndDate, today]);

  if (error && !logsheets) {
    return (
      <ErrorState
        title="Logsheets didn't load"
        message={describeError(error).body}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      />
    );
  }

  const missing = rows.filter((r) => !r.sheet).length;
  const unconfirmed = rows.filter((r) => r.sheet && !r.sheet.customerConfirmed).length;
  const shown = showAll ? rows : rows.slice(0, 31);
  const latestMissing = rows.find((r) => !r.sheet)?.date;

  return (
    <div className="flex flex-col gap-3.5">
      {utilization && (
        <KeyFigures
          label="Utilization"
          items={[
            { key: "days", label: "Rental days", value: formatNumber(utilization.totalRentalDays, 0), unit: "days", context: "From the rental's own dates" },
            {
              key: "logged",
              label: "Days logged",
              value: formatNumber(utilization.loggedDayCount, 0),
              unit: "days",
              context: running ? `${missing} missing · ${unconfirmed} not confirmed · today excluded` : `${unconfirmed} not confirmed by the customer`,
              tone: running && missing ? "warning" : "default",
            },
            { key: "operating", label: "Operating", value: formatNumber(utilization.totalOperatingHours), unit: "h", context: "Total across logsheets" },
            {
              key: "idle",
              label: "Idle · overtime",
              value: `${formatNumber(utilization.totalIdleHours)} · ${formatNumber(utilization.totalOvertimeHours)}`,
              unit: "h",
              context: "Engine on not working · beyond the shift",
            },
          ]}
        />
      )}
      <Panel
        title="Logsheets"
        count={logsheets ? logsheets.length : undefined}
        subtitle={rentalRef(rental.id)}
        padding="none"
        actions={
          canSubmit ? (
            <Button size="sm" icon="logsheet" onClick={() => setDrawerDate(latestMissing ?? today)}>
              Submit logsheet
            </Button>
          ) : undefined
        }
      >
        {!readOnly && rental.status !== RentalStatus.active && (
          <p className="m-0 border-b border-border px-4 py-2.5 text-xs text-ink-soft">
            {rental.status === RentalStatus.confirmed
              ? "Logsheets can be submitted once the rental is Active — the machine is on site."
              : `This rental is ${rental.status === RentalStatus.off_rent ? "off rent" : rental.status}, so no more logsheets can be submitted.`}
          </p>
        )}
        {logsheets === null ? (
          <div className="flex flex-col gap-2 px-4 py-4">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No logsheets yet"
            description={
              rental.status === RentalStatus.confirmed
                ? "Nothing to log until the rental starts."
                : readOnly
                  ? "The rental company hasn't submitted any logsheets yet."
                  : "Submit the first day's hours once the machine has worked."
            }
          />
        ) : (
          <>
            <Table bare minWidth={680} caption={`Logsheets for ${rentalRef(rental.id)}`}>
              <Thead>
                <Tr>
                  <Th className="w-[104px]">Date</Th>
                  <Th align="right">Operating</Th>
                  <Th align="right">Idle</Th>
                  <Th align="right">Overtime</Th>
                  <Th>Operator · fuel</Th>
                  <Th className="w-[160px]">Customer</Th>
                  <Th className="w-[72px]">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {shown.map(({ date, sheet }) =>
                  sheet ? (
                    <Tr key={date}>
                      <Td>
                        {/* The date always opens the logsheet record, even when the row action is Correct. */}
                        <UILink href={`/logsheets/${sheet.id}?rentalId=${rental.id}`} className="whitespace-nowrap font-mono text-xs text-accent-text no-underline hover:underline">
                          {formatDate(date)}
                        </UILink>
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
                          sub={sheet.fuelConsumed != null ? `Fuel ${formatNumber(sheet.fuelConsumed)} ${sheet.fuelUnit ?? ""}`.trim() : sheet.shift ?? "Fuel not recorded"}
                        />
                      </Td>
                      <Td>
                        <Status domain="logsheet" value={sheet.customerConfirmed ? "confirmed" : "unconfirmed"} size="sm" />
                      </Td>
                      <Td>
                        {canSubmit ? (
                          <button type="button" className="text-xs font-medium text-accent-text hover:underline" onClick={() => setDrawerDate(date)}>
                            Correct
                          </button>
                        ) : (
                          <UILink href={`/logsheets/${sheet.id}?rentalId=${rental.id}`} className="text-xs font-medium text-accent-text hover:underline">
                            Open
                          </UILink>
                        )}
                      </Td>
                    </Tr>
                  ) : (
                    <Tr key={date} className="bg-destructive-row">
                      <Td className="font-mono text-xs">{formatDate(date)}</Td>
                      <Td colSpan={4} className="text-xs font-medium text-destructive">
                        No logsheet for this day
                      </Td>
                      <Td className="text-disabled-text">—</Td>
                      <Td>
                        {canSubmit && (
                          <button type="button" className="text-xs font-medium text-accent-text hover:underline" onClick={() => setDrawerDate(date)}>
                            Log
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ),
                )}
              </Tbody>
            </Table>
            {rows.length > 31 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="h-[34px] w-full border-0 border-t border-border bg-surface px-4 text-left text-xs font-medium text-accent-text hover:bg-surface-page"
              >
                {showAll ? "Show the last 31 days" : `Show all ${plural(rows.length, "day")}`}
              </button>
            )}
          </>
        )}
      </Panel>
      {drawerDate && logsheets && (
        <LogsheetDrawer
          open
          onClose={() => setDrawerDate(null)}
          organizationId={organizationId}
          rental={rental}
          logsheets={logsheets}
          initialDate={drawerDate}
          onSaved={() => {
            void refresh();
            onChanged?.();
          }}
        />
      )}
      {!readOnly && rental.status === RentalStatus.active && latestMissing && (
        <p className="m-0 text-[11px] text-meta-light">
          Most recent day without a logsheet: {formatShortDate(latestMissing)}. It&apos;s been {plural(daysBetween(latestMissing, today), "day")}.
        </p>
      )}
    </div>
  );
}
