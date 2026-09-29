"use client";

import type { Logsheet, SubmitLogsheetRequest } from "@fleetip/contracts/logsheet";
import type { Rental } from "@fleetip/contracts/rental";
import { Button, Checkbox, Drawer, FormBanner, Input, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { parseValidationIssues } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { formatDate, formatMoney, formatNumber, rentalRef, todayIsoDate } from "../../../lib/format";

type Key = "logDate" | "shift" | "operatingHours" | "idleHours" | "overtimeHours" | "operatorName" | "fuelConsumed" | "fuelUnit" | "remarks";
type LogValues = Record<Key, string> & { customerConfirmed: boolean };

function valuesFrom(sheet: Logsheet | undefined, date: string, fallbackUnit: string): LogValues {
  const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return {
    logDate: date,
    shift: sheet?.shift ?? "",
    operatingHours: num(sheet?.operatingHours),
    idleHours: num(sheet?.idleHours),
    overtimeHours: num(sheet?.overtimeHours),
    operatorName: sheet?.operatorName ?? "",
    fuelConsumed: num(sheet?.fuelConsumed),
    fuelUnit: sheet?.fuelUnit ?? fallbackUnit,
    remarks: sheet?.remarks ?? "",
    customerConfirmed: sheet?.customerConfirmed ?? false,
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
/** Empty, or a number that's 0 or more. */
const blankOrNonNegative = (v: string) => v.trim() === "" || Number(v) >= 0;
const HOURS = "Enter hours as 0 or more, e.g. 7.5.";

/**
 * The API upserts on (rental, date), needs the rental Active and the date
 * inside it, and rejects future dates — all checked here first, on the field.
 */
function logsheetSchema(rental: Rental, today: string) {
  const ref = rentalRef(rental.id);
  return z
    .object({
      logDate: z
        .string()
        .min(1, "Pick the day these hours are for.")
        .refine((v) => v <= today, "Logsheets are for days that have happened. Pick today or earlier.")
        .refine((v) => v >= rental.startDate, `${ref} started on ${formatDate(rental.startDate)}. Pick a date on or after that.`)
        .refine((v) => !rental.endDate || v <= rental.endDate, `${ref} ended on ${formatDate(rental.endDate)}. Pick a date on or before that.`),
      shift: z.string(),
      operatingHours: z
        .string()
        .refine((v) => v.trim() !== "", "Enter operating hours. Use 0 if the machine didn't work.")
        .refine(blankOrNonNegative, HOURS),
      idleHours: z.string().refine(blankOrNonNegative, HOURS),
      overtimeHours: z.string().refine(blankOrNonNegative, HOURS),
      operatorName: z.string(),
      fuelConsumed: z.string().refine(blankOrNonNegative, "Enter fuel as 0 or more, or leave it empty."),
      fuelUnit: z.string(),
      remarks: z.string().max(2000, "Remarks are up to 2,000 characters."),
      customerConfirmed: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const hours = [v.operatingHours, v.idleHours, v.overtimeHours];
      const sum = hours.reduce((total, h) => total + (num(h) ?? 0), 0);
      if (v.operatingHours.trim() !== "" && hours.every(blankOrNonNegative) && sum > 24)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["overtimeHours"], message: `These hours add up to ${formatNumber(sum)} — more than a day. Check the entries.` });
      if (num(v.fuelConsumed) !== null && !v.fuelUnit.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fuelUnit"], message: "Say what the fuel figure is in, e.g. L." });
    })
    .transform((v): SubmitLogsheetRequest => {
      const fuel = num(v.fuelConsumed);
      return {
        logDate: v.logDate,
        shift: v.shift.trim() || undefined,
        operatingHours: num(v.operatingHours) ?? undefined,
        idleHours: num(v.idleHours) ?? undefined,
        overtimeHours: num(v.overtimeHours) ?? undefined,
        operatorName: v.operatorName.trim() || undefined,
        fuelConsumed: fuel ?? undefined,
        fuelUnit: fuel !== null ? v.fuelUnit.trim() || undefined : undefined,
        remarks: v.remarks.trim() || undefined,
        customerConfirmed: v.customerConfirmed,
      };
    });
}

/** Submit (or correct) one day's logsheet. */
export function LogsheetDrawer({
  open,
  onClose,
  organizationId,
  rental,
  logsheets,
  initialDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  rental: Rental;
  /** Existing logsheets on this rental — a date that has one is a correction. */
  logsheets: Logsheet[];
  initialDate: string;
  onSaved: (logsheet: Logsheet) => void;
}) {
  const toast = useToast();
  const today = todayIsoDate();
  const lastUnit = [...logsheets].sort((a, b) => b.logDate.localeCompare(a.logDate)).find((l) => l.fuelUnit)?.fuelUnit ?? "L";
  const byDate = new Map(logsheets.map((l) => [l.logDate, l]));
  const schema = useMemo(() => logsheetSchema(rental, today), [rental, today]);
  const form = useForm({
    schema,
    initial: valuesFrom(byDate.get(initialDate), initialDate, lastUnit),
    failTitle: "The logsheet wasn't saved",
    statusCopy: {
      409: {
        title: "This rental can't take logsheets now",
        body: `${rentalRef(rental.id)} isn't Active any more. Reload the page to see its current status.`,
      },
    },
  });
  const { values, set, reset } = form;
  // The one case the hook can't express: a date-range 400 comes back without
  // a path, so it's recognised by its text ("Log date cannot be…") and shown on the date.
  const [dateIssue, setDateIssue] = useState<string | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    if (!open) return;
    reset(valuesFrom(byDate.get(initialDate), initialDate, lastUnit));
    setDateIssue(null);
    edited.current = false;
    // byDate/lastUnit derive from logsheets, which the caller refreshes after saving
  }, [open, initialDate]);

  function setField(key: Key, value: string) {
    if (key === "logDate") {
      setDateIssue(null);
      // Changing the day loads that day's logsheet if the rest is untouched.
      if (!edited.current) {
        const next = valuesFrom(byDate.get(value), value, lastUnit);
        (Object.keys(next) as Array<keyof LogValues>).forEach((k) => set(k, next[k]));
      } else set("logDate", value);
    } else {
      edited.current = true;
      set(key, value);
    }
  }

  const ref = rentalRef(rental.id);

  // The date and the hours total are checked as you type, not on blur.
  const parsed = schema.safeParse(values);
  const ruleError = (key: Key) => (parsed.success ? undefined : parsed.error.issues.find((issue) => issue.path[0] === key)?.message);
  const eager = new Set<Key>(["logDate", "overtimeHours"]);

  const warnings: Partial<Record<Key, string>> = {};
  if (values.logDate && !ruleError("logDate") && byDate.has(values.logDate))
    warnings.logDate = `A logsheet already exists for ${formatDate(values.logDate)}. Submitting replaces it.`;
  const sum = (num(values.operatingHours) ?? 0) + (num(values.idleHours) ?? 0) + (num(values.overtimeHours) ?? 0);
  if (!ruleError("operatingHours") && !ruleError("idleHours") && !ruleError("overtimeHours") && sum > 14)
    warnings.overtimeHours = `${formatNumber(sum)} h in total is more than a shift plus overtime usually allows. Submit if it's correct.`;

  const bind = (key: Key) => {
    const field = form.field(key);
    return {
      ...field,
      onChange: (e: { target: { value: string } }) => setField(key, e.target.value),
      error: (key === "logDate" ? dateIssue : null) ?? field.error ?? (eager.has(key) ? ruleError(key) : undefined),
      warning: warnings[key],
    };
  };

  const submit = form.submit(async (input) => {
    setDateIssue(null);
    let saved: Logsheet;
    try {
      saved = (await apiClient.submitLogsheet(organizationId, rental.id, input)) as Logsheet;
    } catch (err) {
      const unpathed = parseValidationIssues(err).formError;
      if (unpathed && /log date/i.test(unpathed)) return setDateIssue(unpathed);
      throw err;
    }
    toast.success({
      title: `Logsheet saved for ${formatDate(input.logDate)}`,
      body: `${ref} · ${input.customerConfirmed ? "Marked as confirmed by the customer." : "Not yet confirmed by the customer."}`,
    });
    onSaved(saved);
    onClose();
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker="Logsheet"
      title={byDate.has(values.logDate) ? "Correct logsheet" : "Submit logsheet"}
      dismissible={!form.busy}
      onSubmit={submit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…">
            Submit logsheet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-[18px] py-4">
        <p className="m-0 text-xs leading-[1.5] text-ink-soft">
          For rental <span className="font-mono text-ink-strong">{ref}</span>. One logsheet per date — submitting a date that
          already has one corrects it.
        </p>
        {form.banner && (
          <FormBanner tone="error" title={form.banner.title}>
            {form.banner.body}
          </FormBanner>
        )}
        <Input
          label="Date"
          required
          type="date"
          mono
          min={rental.startDate}
          max={rental.endDate && rental.endDate < today ? rental.endDate : today}
          {...bind("logDate")}
          hint={`Any day from ${formatDate(rental.startDate)} to ${rental.endDate && rental.endDate < today ? formatDate(rental.endDate) : "today"}.`}
          data-autofocus=""
        />
        <Input label="Shift" placeholder="e.g. Day, 08:00–18:00" {...bind("shift")} />
        <Input label="Operating hours" required suffix="h" mono inputMode="decimal" placeholder="e.g. 8.5" {...bind("operatingHours")} />
        <Input label="Idle hours" suffix="h" mono inputMode="decimal" placeholder="0" {...bind("idleHours")} hint="Engine on, not working." />
        <Input
          label="Overtime hours"
          suffix="h"
          mono
          inputMode="decimal"
          placeholder="0"
          {...bind("overtimeHours")}
          hint={rental.overtimeRate != null ? `Billed at ${formatMoney(rental.overtimeRate)} per h on ${ref}.` : `No overtime rate is set on ${ref}.`}
        />
        <Input label="Operator" placeholder="Name as on the sheet" {...bind("operatorName")} />
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
          <Input label="Fuel used" mono inputMode="decimal" placeholder="e.g. 96" {...bind("fuelConsumed")} />
          <Input label="Unit" {...bind("fuelUnit")} hint="As written, e.g. L" hideOptional />
        </div>
        <Textarea label="Remarks" rows={2} {...bind("remarks")} />
        <Checkbox
          label="Customer has confirmed these hours"
          description="Tick only if the site engineer signed or approved the sheet. Unconfirmed days are the ones disputed at billing."
          checked={values.customerConfirmed}
          onChange={(e) => {
            edited.current = true;
            set("customerConfirmed", e.target.checked);
          }}
        />
      </div>
    </Drawer>
  );
}
