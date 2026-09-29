"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import { OperatorScope, RateUnit, type CreateRentalRequest, type Rental } from "@fleetip/contracts/rental";
import {
  Button,
  Dialog,
  FormBanner,
  FormSection,
  Input,
  RadioGroup,
  SearchSelect,
  Select,
  Textarea,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { ApiError, apiClient } from "../../../lib/api-client";
import { describeError } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { formatDate, formatDateRange, rentalRef, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { MAINTENANCE_TYPE_LABEL, conflictingMaintenance, productName } from "../machines/shared";

const RATE_UNIT_OPTIONS = [
  { value: RateUnit.shift, label: "Per shift" },
  { value: RateUnit.day, label: "Per day" },
  { value: RateUnit.week, label: "Per week" },
  { value: RateUnit.month, label: "Per month" },
];

const OPERATOR_OPTIONS = [
  { value: OperatorScope.with_operator, label: "With operator" },
  { value: OperatorScope.without_operator, label: "Without operator" },
];

export interface CreateRentalDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: (rental: Rental) => void;
  /** Preselects the machine (Machine detail → Create rental). */
  initialMachineId?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}

type Mode = "renter" | "external";

/** Field names are the request paths, so the API's 400 issues land under the right input. */
type Values = {
  mode: Mode;
  machineId: string;
  renterOrganizationId: string;
  "clientSnapshot.name": string;
  "clientSnapshot.contactPerson": string;
  "clientSnapshot.phone": string;
  "clientSnapshot.email": string;
  projectName: string;
  projectLocation: string;
  startDate: string;
  endDate: string;
  rate: string;
  rateUnit: string;
  mobilizationCharge: string;
  demobilizationCharge: string;
  noticePeriodDays: string;
  paymentTerms: string;
  operatorScope: string;
  overtimeRate: string;
  shiftStructure: string;
  sundayCondition: string;
  fuelNorms: string;
  dehireTerms: string;
};

function blank(initial: Partial<Values>): Values {
  return {
    mode: "external",
    machineId: "",
    renterOrganizationId: "",
    "clientSnapshot.name": "",
    "clientSnapshot.contactPerson": "",
    "clientSnapshot.phone": "",
    "clientSnapshot.email": "",
    projectName: "",
    projectLocation: "",
    startDate: todayIsoDate(),
    endDate: "",
    rate: "",
    rateUnit: "",
    mobilizationCharge: "",
    demobilizationCharge: "",
    noticePeriodDays: "",
    paymentTerms: "",
    operatorScope: "",
    overtimeRate: "",
    shiftStructure: "",
    sundayCondition: "",
    fuelNorms: "",
    dehireTerms: "",
    ...initial,
  };
}

const optionalText = (value: string) => (value.trim() ? value.trim() : undefined);
const optionalNumber = (value: string) => (value.trim() === "" ? undefined : Number(value));

interface RentalChecks {
  today: string;
  selectedMachine: Machine | null;
  availability: "unknown" | "checking" | "free" | "booked";
  workshopClash: MaintenanceRecord | null;
}

/**
 * The rules, in the order the form reads (so the first issue is the field
 * that gets focus). Availability and workshop clashes come from the live
 * checks, so a clash shows on the start date instead of after submit.
 */
function createRentalSchema({ today, selectedMachine, availability, workshopClash }: RentalChecks) {
  return z
    .custom<Values>()
    .superRefine((v, ctx) => {
      const fail = (path: keyof Values, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (!v.machineId) fail("machineId", "Choose the machine to rent out.");
      else if (selectedMachine && selectedMachine.status !== MachineStatus.active)
        fail("machineId", "Only Active machines can be rented. This one is under maintenance or retired.");
      if (v.mode === "renter" && !v.renterOrganizationId) fail("renterOrganizationId", "Choose the FleetIP organization renting the machine.");
      if (v.mode === "external" && !v["clientSnapshot.name"].trim())
        fail("clientSnapshot.name", "Enter the customer's name as it should appear on the rental.");
      const email = v["clientSnapshot.email"].trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) fail("clientSnapshot.email", "Enter a valid email address, or leave it empty.");
      if (!v.startDate) fail("startDate", "Pick the day the rental starts.");
      else if (v.startDate < today) fail("startDate", `The start date can't be in the past. The earliest is today, ${formatDate(today)}.`);
      else if (availability === "booked")
        fail("startDate", `${selectedMachine?.assetCode ?? "This machine"} is already booked for part of these dates. Pick other dates.`);
      else if (workshopClash)
        fail(
          "startDate",
          `A ${MAINTENANCE_TYPE_LABEL[workshopClash.maintenanceType].toLowerCase()} job is booked ${formatDateRange(workshopClash.startDate, workshopClash.endDate, "with no end date")}. Pick dates around it.`,
        );
      if (v.endDate && v.startDate && v.endDate < v.startDate) fail("endDate", "The end date can't be before the start date.");
      if (!v.rate.trim()) fail("rate", "Enter the contracted rate.");
      else if (!(Number(v.rate) > 0)) fail("rate", "Enter a rate above ₹0.");
      if (!v.rateUnit) fail("rateUnit", "Choose what the rate is per.");
      for (const key of ["mobilizationCharge", "demobilizationCharge", "overtimeRate"] as const) {
        if (v[key].trim() && !(Number(v[key]) >= 0)) fail(key, "Enter 0 or more, or leave it empty.");
      }
      const notice = v.noticePeriodDays.trim();
      if (notice && !(Number.isInteger(Number(notice)) && Number(notice) >= 0)) fail("noticePeriodDays", "Enter whole days, e.g. 15.");
    })
    .transform(
      (v): CreateRentalRequest => ({
        machineId: v.machineId,
        ...(v.mode === "renter"
          ? { renterOrganizationId: v.renterOrganizationId }
          : {
              clientSnapshot: {
                name: v["clientSnapshot.name"].trim(),
                contactPerson: optionalText(v["clientSnapshot.contactPerson"]),
                phone: optionalText(v["clientSnapshot.phone"]),
                email: optionalText(v["clientSnapshot.email"]),
              },
            }),
        projectName: optionalText(v.projectName),
        projectLocation: optionalText(v.projectLocation),
        startDate: v.startDate,
        endDate: v.endDate || undefined,
        rate: Number(v.rate),
        rateUnit: v.rateUnit as RateUnit,
        mobilizationCharge: optionalNumber(v.mobilizationCharge),
        demobilizationCharge: optionalNumber(v.demobilizationCharge),
        paymentTerms: optionalText(v.paymentTerms),
        shiftStructure: optionalText(v.shiftStructure),
        overtimeRate: optionalNumber(v.overtimeRate),
        sundayCondition: optionalText(v.sundayCondition),
        fuelNorms: optionalText(v.fuelNorms),
        operatorScope: (v.operatorScope || undefined) as OperatorScope | undefined,
        noticePeriodDays: optionalNumber(v.noticePeriodDays),
        dehireTerms: optionalText(v.dehireTerms),
      }),
    );
}

/**
 * Direct rental (no quotation). Checks the machine's availability as dates
 * are entered, so a clash shows on the date field instead of after submit.
 */
export function CreateRentalDialog({
  open,
  onClose,
  organizationId,
  onCreated,
  initialMachineId,
  initialStartDate,
  initialEndDate,
}: CreateRentalDialogProps) {
  const { hasPermission } = useSession();
  const toast = useToast();
  const router = useRouter();
  const canListRenters = hasPermission("quotation.manage");
  const canListMaintenance = hasPermission("maintenance.manage");

  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [renters, setRenters] = useState<Organization[] | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [loadError, setLoadError] = useState<{ title: string; body: string } | null>(null);
  const [availability, setAvailability] = useState<"unknown" | "checking" | "free" | "booked">("unknown");
  const [checks, setChecks] = useState<Omit<RentalChecks, "today">>({ selectedMachine: null, availability: "unknown", workshopClash: null });
  const today = todayIsoDate();
  const schema = useMemo(() => createRentalSchema({ today, ...checks }), [today, checks]);
  const form = useForm({ schema, initial: blank({}), failTitle: "The rental wasn't created" });
  const { values, set, reset } = form;
  const mode = values.mode;

  useEffect(() => {
    if (!open) return;
    reset(
      blank({
        machineId: initialMachineId ?? "",
        startDate: initialStartDate && initialStartDate >= todayIsoDate() ? initialStartDate : todayIsoDate(),
        endDate: initialEndDate ?? "",
      }),
    );
    setLoadError(null);
    void (async () => {
      try {
        const [machineList, productList, renterList] = await Promise.all([
          apiClient.listMachines(organizationId) as Promise<Machine[]>,
          apiClient.listProducts() as Promise<Product[]>,
          canListRenters
            ? (apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>).catch(() => null)
            : Promise.resolve(null),
        ]);
        setMachines(machineList);
        setProducts(new Map(productList.map((p) => [p.id, p])));
        setRenters(renterList);
      } catch (err) {
        setMachines([]);
        const friendly = describeError(err, "Machines couldn't be loaded");
        setLoadError({ title: friendly.title, body: friendly.body });
      }
    })();
  }, [open, organizationId, initialMachineId, initialStartDate, initialEndDate, canListRenters, reset]);

  // Workshop jobs on the selected machine — createRental refuses to overlap one.
  useEffect(() => {
    if (!open || !values.machineId || !canListMaintenance) {
      setMaintenance([]);
      return;
    }
    let cancelled = false;
    (apiClient.listMaintenanceForMachine(organizationId, values.machineId) as Promise<MaintenanceRecord[]>)
      .then((list) => !cancelled && setMaintenance(list))
      .catch(() => !cancelled && setMaintenance([]));
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, values.machineId, canListMaintenance]);

  const datesValid = Boolean(values.startDate) && values.startDate >= today && (!values.endDate || values.endDate >= values.startDate);

  // Realtime availability (rentals) — debounced.
  useEffect(() => {
    if (!open || !values.machineId || !datesValid) {
      setAvailability("unknown");
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const handle = setTimeout(() => {
      (apiClient.checkRentalAvailability(organizationId, values.machineId, values.startDate, values.endDate || undefined) as Promise<{
        available: boolean;
      }>)
        .then((res) => !cancelled && setAvailability(res.available ? "free" : "booked"))
        .catch(() => !cancelled && setAvailability("unknown"));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, organizationId, values.machineId, values.startDate, values.endDate, datesValid]);

  const activeMachines = useMemo(() => (machines ?? []).filter((m) => m.status === MachineStatus.active), [machines]);
  const selectedMachine = (machines ?? []).find((m) => m.id === values.machineId) ?? null;
  const workshopClash = values.machineId && datesValid ? conflictingMaintenance(maintenance, values.startDate, values.endDate || null) : null;

  // The schema reads the live checks; keep them in state so it's rebuilt only when they change.
  useEffect(() => {
    setChecks((current) =>
      current.selectedMachine === selectedMachine && current.availability === availability && current.workshopClash === workshopClash
        ? current
        : { selectedMachine, availability, workshopClash },
    );
  }, [selectedMachine, availability, workshopClash]);

  // The start date's rules (past, booked, workshop) show as soon as there's a date, not on blur.
  const parsed = schema.safeParse(values);
  const firstIssue = (key: keyof Values) => (parsed.success ? undefined : parsed.error.issues.find((issue) => issue.path[0] === key)?.message);

  const bind = form.field;

  const save = form.submit(async (input) => {
    let rental: Rental;
    try {
      rental = (await apiClient.createRental(organizationId, input)) as Rental;
    } catch (error) {
      // createRental's conflicts are all about the dates (booked, workshop,
      // retired) but carry no field, so they're tagged to the start date here.
      if (error instanceof ApiError && error.status === 409 && !error.field)
        throw new ApiError(error.message, error.status, error.code, error.issues, "startDate");
      throw error;
    }
    const customer =
      input.renterOrganizationId !== undefined
        ? (renters?.find((r) => r.id === input.renterOrganizationId)?.name ?? "the customer")
        : (input.clientSnapshot?.name ?? "");
    toast.success({
      title: `Rental ${rentalRef(rental.id)} created`,
      body: `${selectedMachine?.assetCode ?? "The machine"} is booked for ${customer} from ${formatDate(rental.startDate)}.`,
      action: { label: "Open", onClick: () => router.push(`/rentals/${rental.id}`) },
    });
    onCreated(rental);
    onClose();
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (await save(event)) return;
    // The pickers have no `name` for the hook to focus, so they're focused here.
    const first = parsed.success ? undefined : parsed.error.issues[0]?.path[0];
    if (first === "machineId" || first === "renterOrganizationId")
      document.querySelector<HTMLElement>(`[data-field="${first}"] input`)?.focus();
  }

  const machineOptions = activeMachines.map((m) => ({
    value: m.id,
    label: m.assetCode,
    description: [productName(products.get(m.productId)), m.registrationNumber].filter(Boolean).join(" · "),
    keywords: m.registrationNumber,
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a rental"
      description="Book a machine directly for a customer. For a marketplace deal, award a quotation instead — it creates the rental for you."
      icon="rental"
      tone="info"
      size="lg"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Creating…" disabled={machines !== null && activeMachines.length === 0}>
            Create rental
          </Button>
        </>
      }
    >
      {(form.banner ?? loadError) && (
        <FormBanner tone="error" title={(form.banner ?? loadError)?.title}>
          {(form.banner ?? loadError)?.body}
        </FormBanner>
      )}
      {machines !== null && activeMachines.length === 0 ? (
        <FormBanner tone="info" title="No machine can be rented right now">
          Only Active machines can be rented. Register a machine, or bring one back from the workshop, first.
        </FormBanner>
      ) : (
        <>
          <FormSection title="Machine and customer">
            <div data-field="machineId">
              <SearchSelect
                label="Machine"
                required
                options={machineOptions}
                loading={machines === null}
                value={values.machineId}
                onChange={(value) => set("machineId", value)}
                onBlur={form.field("machineId").onBlur}
                placeholder="Search by asset code or registration"
                emptyText="No Active machine matches."
                error={form.errors.machineId}
                hint="Only Active machines are listed."
              />
            </div>
            <RadioGroup
              label="Customer"
              required
              name="rental-customer-mode"
              value={mode}
              onChange={(v) => set("mode", v as Mode)}
              options={[
                { value: "external", label: "Not on FleetIP", description: "Enter their details; they're kept as entered." },
                { value: "renter", label: "A FleetIP organization", description: "They'll see the rental and can verify dates." },
              ]}
            />
            {mode === "external" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div data-field="clientSnapshot.name">
                  <Input label="Customer name" required {...bind("clientSnapshot.name")} />
                </div>
                <Input label="Contact person" {...bind("clientSnapshot.contactPerson")} />
                <Input label="Phone" type="tel" {...bind("clientSnapshot.phone")} />
                <div data-field="clientSnapshot.email">
                  <Input label="Email" type="email" {...bind("clientSnapshot.email")} />
                </div>
              </div>
            ) : renters ? (
              <div data-field="renterOrganizationId">
                <SearchSelect
                  label="Organization"
                  required
                  options={renters.map((r) => ({ value: r.id, label: r.name, description: r.code }))}
                  value={values.renterOrganizationId}
                  onChange={(value) => set("renterOrganizationId", value)}
                  onBlur={form.field("renterOrganizationId").onBlur}
                  placeholder="Search renter organizations"
                  error={form.errors.renterOrganizationId}
                />
              </div>
            ) : (
              <div data-field="renterOrganizationId">
                <Input
                  label="Organization ID"
                  required
                  mono
                  {...bind("renterOrganizationId")}
                  hint="Your role can't list FleetIP organizations (needs the Quotations permission). Paste the organization's ID instead."
                />
              </div>
            )}
          </FormSection>

          <FormSection title="Dates and rate" className="border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-field="startDate">
                <Input
                  label="Start date"
                  required
                  type="date"
                  mono
                  min={today}
                  {...bind("startDate")}
                  error={form.errors.startDate ?? (values.startDate ? firstIssue("startDate") : undefined)}
                  hint={
                    availability === "checking"
                      ? "Checking availability…"
                      : availability === "free"
                        ? `${selectedMachine?.assetCode ?? "The machine"} is free for these dates.`
                        : "Today or later."
                  }
                />
              </div>
              <div data-field="endDate">
                <Input label="End date" type="date" mono min={values.startDate || today} {...bind("endDate")} hint="Leave empty for an open-ended rental." />
              </div>
              <div data-field="rate">
                <Input label="Rate" required prefix="₹" mono inputMode="decimal" {...bind("rate")} />
              </div>
              <div data-field="rateUnit">
                <Select label="Rate is" required placeholder="Choose a unit" options={RATE_UNIT_OPTIONS} {...bind("rateUnit")} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Project" className="border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Project name" {...bind("projectName")} />
              <Input label="Site location" {...bind("projectLocation")} hint="Used as the pickup point for demobilization." />
            </div>
          </FormSection>

          <FormSection title="Commercial terms" className="border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Mobilization charge" prefix="₹" mono inputMode="decimal" {...bind("mobilizationCharge")} />
              <Input label="Demobilization charge" prefix="₹" mono inputMode="decimal" {...bind("demobilizationCharge")} />
              <Input label="Overtime rate" prefix="₹" suffix="per h" mono inputMode="decimal" {...bind("overtimeRate")} />
              <Input label="Notice period" suffix="days" mono inputMode="numeric" {...bind("noticePeriodDays")} />
              <Select label="Operator" placeholder="Not specified" options={OPERATOR_OPTIONS} {...bind("operatorScope")} />
              <Input label="Shift structure" placeholder="e.g. 1 shift × 10 h, 08:00–18:00" {...bind("shiftStructure")} />
              <Input label="Sunday condition" {...bind("sundayCondition")} />
              <Input label="Fuel norms" {...bind("fuelNorms")} />
            </div>
            <Textarea label="Payment terms" rows={2} {...bind("paymentTerms")} />
            <Textarea label="Dehire terms" rows={2} {...bind("dehireTerms")} />
          </FormSection>
        </>
      )}
    </Dialog>
  );
}
