"use client";

import type { AuctionDetail } from "@fleetip/contracts/auction";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type {
  CommercialQuotation,
  CreateCommercialQuotationRequest,
  QuotationResponse,
  ResponsibleParty,
} from "@fleetip/contracts/quotation";
import type { OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Alert,
  Button,
  Checkbox,
  DescriptionList,
  Dialog,
  FormBanner,
  FormSection,
  Icon,
  Input,
  LoadingState,
  RadioGroup,
  SearchSelect,
  Select,
  Textarea,
  UILink,
  cx,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ApiError, apiClient } from "../../../lib/api-client";
import { describeError, OFFLINE_HINT, parseValidationIssues } from "../../../lib/errors";
import { addDuration, formatDate, formatRateUnit, plural, todayIsoDate } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { useSession } from "../../../lib/session-context";
import { statusLabel } from "../../../lib/status";
import { optional } from "../../../lib/use-load";
import { productName } from "../machines/shared";
import { auctionRef } from "../auctions/shared";
import {
  CREW_LABEL,
  DURATION_UNIT_OPTIONS,
  RATE_UNIT_OPTIONS,
  SHIFT_PATTERN_LABEL,
  durationLabel,
  equipmentLine,
  loadSubcategoryIndex,
  requirementRef,
} from "../requirements/shared";
import { OPERATOR_OPTIONS, RESPONSIBLE_PARTY_OPTIONS } from "./shared";

export interface CreateQuotationDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Quote against this requirement (?requirementId=, or a Requested row): customer, dates and rate unit come from it. */
  requirementId: string | null;
  /** Formalize an auction win (?sourceAuctionId=): the rate starts at your last bid. */
  sourceAuctionId: string | null;
  /** Machines preselected (?machineId= / ?machineIds=, from Machine detail or the machines list). */
  initialMachineIds: string[];
  onCreated: () => void;
}

type TextKey =
  | "clientName"
  | "clientContactPerson"
  | "clientPhone"
  | "clientEmail"
  | "paymentTerms"
  | "shiftStructure"
  | "sundayCondition"
  | "fuelNorms"
  | "dehireTerms"
  | "gstTerms"
  | "commercialNotes"
  | "companyTerms";
type NumberKey =
  | "rate"
  | "mobilizationCharge"
  | "demobilizationCharge"
  | "overtimeRate"
  | "workingHours"
  | "workingDaysPerWeek"
  | "minimumRentalPeriodValue"
  | "noticePeriodDays";
type ChoiceKey = "renterOrganizationId" | "rateUnit" | "minimumRentalPeriodUnit" | "operatorScope" | "fuelScope" | "accommodationScope";
type DateKey = "startDate" | "endDate" | "validityDate";
type Key = TextKey | NumberKey | ChoiceKey | DateKey | "machines";

const FIELD_ORDER: Key[] = [
  "machines",
  "renterOrganizationId",
  "clientName",
  "clientContactPerson",
  "clientPhone",
  "clientEmail",
  "startDate",
  "endDate",
  "rate",
  "rateUnit",
  "validityDate",
  "mobilizationCharge",
  "demobilizationCharge",
  "overtimeRate",
  "gstTerms",
  "paymentTerms",
  "minimumRentalPeriodValue",
  "minimumRentalPeriodUnit",
  "noticePeriodDays",
  "operatorScope",
  "workingHours",
  "workingDaysPerWeek",
  "shiftStructure",
  "sundayCondition",
  "fuelScope",
  "fuelNorms",
  "accommodationScope",
  "dehireTerms",
  "commercialNotes",
  "companyTerms",
];

const MAX_LENGTH: Partial<Record<TextKey, number>> = {
  clientName: 200,
  clientContactPerson: 200,
  clientPhone: 50,
  paymentTerms: 1000,
  shiftStructure: 500,
  sundayCondition: 500,
  fuelNorms: 500,
  dehireTerms: 1000,
  gstTerms: 500,
  commercialNotes: 2000,
  companyTerms: 2000,
};

/** API field path → form field. */
const PATH_TO_FIELD: Record<string, Key> = {
  renterOrganizationId: "renterOrganizationId",
  "clientSnapshot.name": "clientName",
  "clientSnapshot.contactPerson": "clientContactPerson",
  "clientSnapshot.phone": "clientPhone",
  "clientSnapshot.email": "clientEmail",
  ...Object.fromEntries(FIELD_ORDER.filter((k) => !k.startsWith("client") && k !== "machines").map((k) => [k, k])),
};

type TextValues = Record<Exclude<Key, "machines">, string>;
/** `machines` is the selected machine ids; every other field is the raw input string. */
type Values = TextValues & { machines: string[] };

function blank(machineIds: string[]): Values {
  const out = { machines: machineIds } as Values;
  for (const key of FIELD_ORDER) if (key !== "machines") out[key] = "";
  return out;
}

/** Re-key 400 issue paths from the request shape to form fields ("clientSnapshot.name" → clientName). */
function toFormPaths(error: unknown): unknown {
  if (!(error instanceof ApiError) || !error.issues.length) return error;
  const issues = error.issues.map((issue) => ({ ...issue, path: issue.path ? (PATH_TO_FIELD[issue.path] ?? issue.path) : issue.path }));
  return new ApiError(error.message, error.status, error.code, issues, error.field);
}
const FORM_FIELDS = new Set<string>(Object.values(PATH_TO_FIELD));

const passedStartMessage = (date: string) =>
  `The requirement's start date (${formatDate(date)}) has passed, so it can't be quoted as it stands. Ask the customer to move it.`;

interface QuotationContext {
  customerMode: "external" | "renter";
  /** The requirement's renter when quoting against one; otherwise the picker value is used. */
  lockedRenterId: string | null;
  lockedStartDate: string | null;
  lockedEndDate: string | null;
  lockedRateUnit: RateUnit | null;
  today: string;
  /** Only Active machines can be quoted. */
  activeIds: Set<string>;
  requirementId: string | null;
  responseId: string | null;
  sourceAuctionId: string | null;
}

/**
 * Mirrors createCommercialQuotationRequestSchema, plus what the form knows
 * (locked requirement dates/unit, Active machines). Issues are added in
 * FIELD_ORDER so a failed submit focuses the first one on screen.
 * Output: the machines to quote and the shared terms for each call.
 */
function quotationSchema(ctx: QuotationContext) {
  return z
    .custom<Values>(() => true)
    .superRefine((values, issues) => {
      const errors: Partial<Record<Key, string>> = {};
      const startDate = ctx.lockedStartDate ?? values.startDate;
      const endDate = ctx.lockedEndDate ?? values.endDate;
      const renterId = ctx.lockedRenterId ?? values.renterOrganizationId;
      if (!values.machines.some((id) => ctx.activeIds.has(id))) errors.machines = "Choose at least one Active machine to quote.";
      if (ctx.customerMode === "renter" && !renterId) errors.renterOrganizationId = "Choose the FleetIP customer this is for.";
      if (ctx.customerMode === "external") {
        if (!values.clientName.trim()) errors.clientName = "Enter the customer's name as it should appear on the quotation.";
        if (values.clientEmail.trim() && !/^\S+@\S+\.\S+$/.test(values.clientEmail.trim())) errors.clientEmail = "Enter a valid email address, or leave it empty.";
      }
      for (const [key, max] of Object.entries(MAX_LENGTH) as [TextKey, number][]) {
        if (values[key].trim().length > max) errors[key] = `This is up to ${max.toLocaleString("en-IN")} characters.`;
      }
      if (ctx.lockedStartDate && ctx.lockedStartDate < ctx.today) errors.startDate = passedStartMessage(ctx.lockedStartDate);
      else if (!startDate) errors.startDate = "Pick the day the rental would start.";
      else if (startDate < ctx.today) errors.startDate = `The start date can't be in the past. The earliest is today, ${formatDate(ctx.today)}.`;
      if (endDate && startDate && endDate < startDate) errors.endDate = "The end date can't be before the start date.";
      if (!values.rate.trim()) errors.rate = "Enter the rate you're quoting.";
      else if (!(Number(values.rate) > 0)) errors.rate = "Enter a rate above ₹0.";
      if (!(ctx.lockedRateUnit ?? values.rateUnit)) errors.rateUnit = "Choose what the rate is per.";
      if (!values.validityDate) errors.validityDate = "Pick the last day the customer can accept.";
      else if (values.validityDate < ctx.today) errors.validityDate = `The validity date can't be in the past. The earliest is today, ${formatDate(ctx.today)}.`;
      else if (startDate && values.validityDate > startDate) errors.validityDate = "Validity date can't be after the start date.";
      for (const key of ["mobilizationCharge", "demobilizationCharge", "overtimeRate"] as const) {
        if (values[key].trim() && !(Number(values[key]) >= 0)) errors[key] = "Enter 0 or more, or leave it empty.";
      }
      if (values.workingHours.trim() && !(Number(values.workingHours) > 0)) errors.workingHours = "Enter hours per shift above 0, e.g. 10.";
      if (values.workingDaysPerWeek.trim()) {
        const d = Number(values.workingDaysPerWeek);
        if (!Number.isInteger(d) || d < 1 || d > 7) errors.workingDaysPerWeek = "Enter whole days from 1 to 7.";
      }
      if (values.minimumRentalPeriodValue.trim()) {
        const p = Number(values.minimumRentalPeriodValue);
        if (!Number.isInteger(p) || p < 1) errors.minimumRentalPeriodValue = "Enter a whole number above 0, e.g. 1.";
      }
      if (values.noticePeriodDays.trim() && !(Number.isInteger(Number(values.noticePeriodDays)) && Number(values.noticePeriodDays) >= 0))
        errors.noticePeriodDays = "Enter whole days, e.g. 15.";
      for (const key of FIELD_ORDER) {
        const message = errors[key];
        if (message) issues.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
      }
    })
    .transform((values): { machineIds: string[]; terms: Omit<CreateCommercialQuotationRequest, "machineId"> } => ({
      machineIds: values.machines.filter((id) => ctx.activeIds.has(id)),
      terms: {
        requirementId: ctx.requirementId ?? undefined,
        quotationResponseId: ctx.responseId ?? undefined,
        sourceAuctionId: ctx.sourceAuctionId ?? undefined,
        ...(ctx.customerMode === "renter"
          ? { renterOrganizationId: ctx.lockedRenterId ?? values.renterOrganizationId }
          : {
              clientSnapshot: {
                name: values.clientName.trim(),
                contactPerson: text(values.clientContactPerson),
                phone: text(values.clientPhone),
                email: text(values.clientEmail),
              },
            }),
        startDate: ctx.lockedStartDate ?? values.startDate,
        endDate: (ctx.lockedEndDate ?? values.endDate) || undefined,
        rate: Number(values.rate),
        rateUnit: (ctx.lockedRateUnit ?? values.rateUnit) as RateUnit,
        validityDate: values.validityDate,
        mobilizationCharge: num(values.mobilizationCharge),
        demobilizationCharge: num(values.demobilizationCharge),
        overtimeRate: num(values.overtimeRate),
        fuelScope: (values.fuelScope || undefined) as ResponsibleParty | undefined,
        accommodationScope: (values.accommodationScope || undefined) as ResponsibleParty | undefined,
        operatorScope: (values.operatorScope || undefined) as OperatorScope | undefined,
        workingHours: num(values.workingHours),
        workingDaysPerWeek: num(values.workingDaysPerWeek),
        minimumRentalPeriodValue: num(values.minimumRentalPeriodValue),
        minimumRentalPeriodUnit: (values.minimumRentalPeriodUnit || undefined) as RateUnit | undefined,
        noticePeriodDays: num(values.noticePeriodDays),
        gstTerms: text(values.gstTerms),
        paymentTerms: text(values.paymentTerms),
        shiftStructure: text(values.shiftStructure),
        sundayCondition: text(values.sundayCondition),
        fuelNorms: text(values.fuelNorms),
        dehireTerms: text(values.dehireTerms),
        commercialNotes: text(values.commercialNotes),
        companyTerms: text(values.companyTerms),
      },
    }));
}

interface MachineResult {
  machineId: string;
  assetCode: string;
  outcome: "created" | "failed" | "skipped";
  quotation?: CommercialQuotation;
  reason?: string;
}

const wholeAbove0 = (raw: string) => Number.isInteger(Number(raw)) && Number(raw) >= 1;
const text = (raw: string) => (raw.trim() ? raw.trim() : undefined);
const num = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));

/**
 * New commercial quotation(s). One quotation per selected machine — the
 * data model has no multi-machine quotation (commercial_quotations has no
 * unique constraint on requirementId alone), so N machines means N calls
 * with the same customer, dates and terms, and a result per machine: a
 * created reference or the reason it failed. Never reports success for a
 * machine that failed.
 */
export function CreateQuotationDialog({
  open,
  onClose,
  organizationId,
  requirementId,
  sourceAuctionId,
  initialMachineIds,
  onCreated,
}: CreateQuotationDialogProps) {
  const { hasPermission } = useSession();
  const toast = useToast();
  const router = useRouter();
  const canListMachines = hasPermission("equipment.manage");
  const isFromRequirement = Boolean(requirementId);

  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [machinesFailed, setMachinesFailed] = useState(false);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [renters, setRenters] = useState<Organization[] | null>(null);
  const [rentersFailed, setRentersFailed] = useState(false);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [requirementEquipment, setRequirementEquipment] = useState<string | null>(null);
  // This company's own "interested" response to the requirement, if any —
  // recorded on the created quotation as quotationResponseId so the
  // Renter's requirement page links back to it, and so the response drops
  // off the Quotations page's "Requested" tab once formalized.
  const [responseId, setResponseId] = useState<string | null>(null);
  // Two sources, resolved by two effects — the response rate wins when both
  // exist (it's the more specific figure already stated for this requirement).
  const [responseRate, setResponseRate] = useState<number | null>(null);
  const [auctionBidRate, setAuctionBidRate] = useState<number | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingAuctionPrefill, setLoadingAuctionPrefill] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [mode, setMode] = useState<"external" | "renter">("external");
  const [machineFilter, setMachineFilter] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<MachineResult[] | null>(null);

  const initialKey = initialMachineIds.join(",");

  // Locked to the requirement's own unit and dates when it has them —
  // CommercialQuotationService.createQuotation enforces this server-side
  // regardless; this avoids showing pickers whose choice would be overridden.
  const lockedRateUnit = requirement?.expectedDurationUnit ?? null;
  const lockedStartDate = requirement?.requestedStartDate ?? null;
  const lockedEndDate =
    lockedStartDate && requirement?.expectedDurationValue && requirement.expectedDurationUnit
      ? addDuration(lockedStartDate, requirement.expectedDurationValue, requirement.expectedDurationUnit)
      : null;
  const customerMode: "external" | "renter" = isFromRequirement ? "renter" : mode;
  const today = todayIsoDate();

  const machineList = useMemo(() => machines ?? [], [machines]);
  // Only Active machines can be quoted (retired ones are refused by the API; under-maintenance ones aren't offered).
  const activeMachines = useMemo(() => machineList.filter((m) => m.status === MachineStatus.active), [machineList]);
  const activeIds = useMemo(() => new Set(activeMachines.map((m) => m.id)), [activeMachines]);

  const lockedRenterId = isFromRequirement ? (requirement?.renterOrganizationId ?? "") : null;
  const schema = useMemo(
    () =>
      quotationSchema({
        customerMode,
        lockedRenterId,
        lockedStartDate,
        lockedEndDate,
        lockedRateUnit,
        today,
        activeIds,
        requirementId,
        responseId,
        sourceAuctionId,
      }),
    [customerMode, lockedRenterId, lockedStartDate, lockedEndDate, lockedRateUnit, today, activeIds, requirementId, responseId, sourceAuctionId],
  );
  const form = useForm({ schema, initial: blank(initialMachineIds), failTitle: "No quotation was created" });
  const { values, busy, online, reset } = form;

  // Reset and load the pickers every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    reset(blank(initialMachineIds));
    setMachineFilter("");
    setMode("external");
    setResults(null);
    setProgress(null);
    let cancelled = false;
    void (async () => {
      const [machineList, productList, renterList] = await Promise.all([
        optional(canListMachines, () => apiClient.listMachines(organizationId) as Promise<Machine[]>, null as Machine[] | null),
        optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
        optional(true, () => apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>, null as Organization[] | null),
      ]);
      if (cancelled) return;
      setMachinesFailed(canListMachines && machineList === null);
      setMachines(machineList ?? []);
      setProducts(new Map(productList.map((p) => [p.id, p])));
      setRentersFailed(renterList === null);
      setRenters(renterList ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, canListMachines, initialKey]);

  useEffect(() => {
    if (!open || !requirementId) {
      setRequirement(null);
      return;
    }
    // This dialog stays mounted (only `open` toggles) — a notification for a
    // *different* requirement arriving after this effect already settled
    // must flip these back, not rely on a mount-time initializer.
    setLoadingContext(true);
    setContextError(null);
    setResponseId(null);
    setResponseRate(null);
    let cancelled = false;
    void (async () => {
      try {
        const req = (await apiClient.getRequirementForDiscovery(organizationId, requirementId)) as Requirement;
        const index = await loadSubcategoryIndex();
        if (cancelled) return;
        setRequirement(req);
        setRequirementEquipment(equipmentLine(req, index.get(req.productSubcategoryId)?.subcategory.name));
        // Best-effort — creating a quotation without ever having submitted
        // an "interested" response first (e.g. straight from Open Market)
        // is valid; there's just nothing to link back to in that case.
        try {
          const response = (await apiClient.getMyResponse(organizationId, requirementId)) as QuotationResponse;
          if (cancelled) return;
          setResponseId(response.id);
          if (response.indicativeRate != null) setResponseRate(response.indicativeRate);
        } catch {
          // No response on file for this requirement — fine.
        }
      } catch (err) {
        if (!cancelled) setContextError(describeError(err, "The requirement didn't load").body);
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, requirementId]);

  useEffect(() => {
    if (!open || !sourceAuctionId) {
      setAuctionBidRate(null);
      return;
    }
    // Same reasoning as loadingContext above — this dialog stays mounted.
    setLoadingAuctionPrefill(true);
    let cancelled = false;
    void (async () => {
      try {
        const detail = (await apiClient.getAuctionDetail(organizationId, sourceAuctionId)) as AuctionDetail;
        // A participant's detail only carries its own participant row.
        const ownParticipantId = detail.participants[0]?.id;
        const ownBids = detail.bids.filter((bid) => bid.participantId === ownParticipantId);
        const lastBid = ownBids[ownBids.length - 1];
        if (!cancelled && lastBid) setAuctionBidRate(lastBid.amount);
      } catch {
        // Best-effort pre-fill only — the form still works without it.
      } finally {
        if (!cancelled) setLoadingAuctionPrefill(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, sourceAuctionId]);

  // Prefill from the requirement: validity, a starting point for the site
  // conditions (Requirement has no numeric working-hours field to map).
  // Runs after the open reset (the requirement loads after it), so `values` is current.
  useEffect(() => {
    if (!requirement) return;
    const shiftSummary = [
      requirement.shiftPattern ? SHIFT_PATTERN_LABEL[requirement.shiftPattern] : null,
      requirement.crewRequirement ? CREW_LABEL[requirement.crewRequirement] : null,
      requirement.shiftRequirement,
    ]
      .filter(Boolean)
      .join(" · ");
    if (!values.validityDate) form.set("validityDate", requirement.validityDate);
    if (!values.commercialNotes) form.set("commercialNotes", shiftSummary);
  }, [requirement]);

  const prefilledRate = responseRate ?? auctionBidRate;
  useEffect(() => {
    if (prefilledRate != null && !values.rate) form.set("rate", String(prefilledRate));
  }, [prefilledRate]);

  const startDate = lockedStartDate ?? values.startDate;
  const renterId = lockedRenterId ?? values.renterOrganizationId;
  const selected = new Set(values.machines);
  const unquotable = machineList.filter((m) => selected.has(m.id) && m.status !== MachineStatus.active);
  const missing = machines === null ? [] : initialMachineIds.filter((id) => !machineList.some((m) => m.id === id));
  const selectedActive = activeMachines.filter((m) => selected.has(m.id));
  const matchesRequirement = (m: Machine) => Boolean(requirement && products.get(m.productId)?.productSubcategoryId === requirement.productSubcategoryId);
  const visibleMachines = useMemo(() => {
    const q = machineFilter.trim().toLowerCase();
    return activeMachines
      .filter((m) => !q || `${m.assetCode} ${m.registrationNumber} ${productName(products.get(m.productId)) ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => Number(matchesRequirement(b)) - Number(matchesRequirement(a)) || a.assetCode.localeCompare(b.assetCode));
  }, [activeMachines, machineFilter, products, requirement]);

  // Warnings never block; they show when errors would.
  const periodUnitWarning =
    wholeAbove0(values.minimumRentalPeriodValue) && !values.minimumRentalPeriodUnit
      ? "Choose days, weeks, months or shifts, or the minimum period can't be read."
      : undefined;

  function bind(key: Exclude<Key, "machines">) {
    return { ...form.field(key), warning: key === "minimumRentalPeriodUnit" && form.shown(key) ? periodUnitWarning : undefined };
  }

  function toggleMachine(id: string, checked: boolean) {
    form.set("machines", checked ? [...values.machines, id] : values.machines.filter((m) => m !== id));
    form.field("machines").onBlur();
  }

  const customerName =
    customerMode === "renter" ? (renters?.find((r) => r.id === renterId)?.name ?? "the customer") : values.clientName.trim() || "the customer";

  // One create call per machine (the data model has no multi-machine
  // quotation), so the save reports per machine: form.fail() puts a
  // shared-terms problem under its fields, and the results list says which
  // machines were quoted and which weren't.
  const handleSubmit = form.submit(async ({ machineIds, terms }) => {
    const targets = activeMachines.filter((m) => machineIds.includes(m.id));
    const out: MachineResult[] = [];
    let stopReason: string | null = null;
    let fieldProblem = false;
    let lastError: unknown = null;
    setProgress({ done: 0, total: targets.length });
    for (const machine of targets) {
      if (stopReason) {
        out.push({ machineId: machine.id, assetCode: machine.assetCode, outcome: "skipped", reason: stopReason });
        continue;
      }
      try {
        const quotation = (await apiClient.createQuotation(organizationId, { ...terms, machineId: machine.id })) as CommercialQuotation;
        out.push({ machineId: machine.id, assetCode: machine.assetCode, outcome: "created", quotation });
      } catch (err) {
        const error = toFormPaths(err);
        lastError = error;
        const { fieldErrors, formError: unpathed } = parseValidationIssues(error);
        const onFields = Object.entries(fieldErrors).filter(([path]) => FORM_FIELDS.has(path));
        if (onFields.length) {
          // A problem with the shared terms, not this machine — every
          // remaining machine would fail the same way, so stop here.
          form.fail(error);
          fieldProblem = true;
          stopReason = "Not tried — the terms need fixing first.";
          out.push({ machineId: machine.id, assetCode: machine.assetCode, outcome: "failed", reason: onFields.map(([, message]) => message).join(" ") });
        } else if (describeError(error).network) {
          stopReason = "Not tried — the connection dropped.";
          out.push({ machineId: machine.id, assetCode: machine.assetCode, outcome: "failed", reason: describeError(error).body });
        } else {
          out.push({ machineId: machine.id, assetCode: machine.assetCode, outcome: "failed", reason: unpathed ?? describeError(error, "Not created").body });
        }
      }
      setProgress({ done: out.length, total: targets.length });
    }
    setProgress(null);

    const created = out.filter((r) => r.outcome === "created");
    if (created.length > 0) onCreated();
    // Created machines leave the selection, so going back and trying again never duplicates them.
    form.set("machines", out.filter((r) => r.outcome !== "created").map((r) => r.machineId));

    const single = out.length === 1 ? out[0] : undefined;
    if (single?.outcome === "created" && single.quotation) {
      const quotation = single.quotation;
      toast.success({
        title: `Quotation ${quotation.referenceNumber} created`,
        body: `Saved as a draft for ${customerName} on ${single.assetCode}. Send it from its page when it's ready.`,
        action: { label: "Open", onClick: () => router.push(`/quotations/${quotation.id}`) },
      });
      onClose();
      return;
    }
    // One machine, one failure: keep the form (input kept) and say why — on
    // the fields when the API named them (done above), otherwise in the banner.
    if (single) {
      if (!fieldProblem) form.fail(lastError);
      return;
    }
    // Nothing created because the shared terms need a fix: the fields say so.
    if (created.length === 0 && fieldProblem) return;
    if (created.length > 0) {
      toast.success({
        title: `${plural(created.length, "quotation")} created`,
        body: `Drafts for ${customerName}: ${created.map((r) => r.quotation?.referenceNumber).join(", ")}.${created.length < out.length ? " Some machines weren't quoted — see the list." : ""}`,
      });
    }
    setResults(out);
  });

  // ------------------------------------------------------------------ render
  const loading = machines === null || loadingContext || loadingAuctionPrefill;
  const noMachines = machines !== null && !machinesFailed && activeMachines.length === 0;
  const failedCount = results?.filter((r) => r.outcome !== "created").length ?? 0;
  const resultsTitle = failedCount === 0 ? "Quotations created" : failedCount === results?.length ? "No quotations were created" : "Some machines weren't quoted";

  const footer = results ? (
    <>
      {failedCount > 0 && (
        <Button variant="secondary" onClick={() => setResults(null)}>
          Back to the form ({plural(failedCount, "machine")} left)
        </Button>
      )}
      <Button onClick={onClose}>Done</Button>
    </>
  ) : (
    <>
      <Button variant="tertiary" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button
        type="submit"
        busy={busy}
        busyLabel={progress && progress.total > 1 ? `Creating ${progress.done + 1} of ${progress.total}…` : "Creating…"}
        disabled={!online || loading || noMachines || machinesFailed || !canListMachines || Boolean(contextError)}
        title={!online ? OFFLINE_HINT : undefined}
      >
        {selectedActive.length > 1 ? `Create ${selectedActive.length} quotations` : "Create quotation"}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={results ? resultsTitle : isFromRequirement ? `Quote for ${requirementId ? requirementRef(requirementId) : "a requirement"}` : "New quotation"}
      description={
        results
          ? "One quotation per machine. Each is a draft until you send it."
          : "Formal terms for a customer. Saved as a draft — the customer sees it only after you send it."
      }
      icon="quotation"
      tone="info"
      size="lg"
      dismissible={!busy}
      onSubmit={results ? undefined : handleSubmit}
      footer={footer}
    >
      {results ? (
        <ResultsList results={results} />
      ) : (
        <>
          {form.banner && (
            <FormBanner tone="error" title={form.banner.title}>
              {form.banner.body}
            </FormBanner>
          )}
          {contextError && (
            <FormBanner tone="error" title="The requirement didn't load">
              {contextError} Close this form and open it again from the requirement.
            </FormBanner>
          )}
          {!canListMachines ? (
            <FormBanner tone="warning" title="Your role can't choose machines">
              Quoting needs the Equipment permission to list your fleet. Ask an organization admin to add it to your role.
            </FormBanner>
          ) : machinesFailed ? (
            <FormBanner tone="error" title="Your machines didn't load">
              Close this form and try again in a moment.
            </FormBanner>
          ) : null}

          {loading && canListMachines && !machinesFailed ? (
            <LoadingState label={loadingContext ? "Loading the requirement…" : loadingAuctionPrefill ? "Loading your last bid…" : "Loading machines…"} />
          ) : noMachines ? (
            <FormBanner tone="info" title="No machine can be quoted right now">
              Only Active machines can be quoted. Register a machine, or bring one back from the workshop, first.
            </FormBanner>
          ) : canListMachines && !machinesFailed ? (
            <>
              {requirement && (
                <Alert tone="info" icon="requirement" title={`Quoting against ${requirementRef(requirement.id)} — this quotation stays tied to it`}>
                  <DescriptionList
                    layout="inline"
                    className="mt-1.5"
                    items={[
                      { label: "Customer", value: renters?.find((r) => r.id === requirement.renterOrganizationId)?.name ?? "FleetIP customer" },
                      { label: "Equipment", value: requirementEquipment },
                      { label: "Quantity", value: String(requirement.quantity), mono: true },
                      { label: "Project", value: requirement.projectName },
                      { label: "Site", value: requirement.projectLocation },
                      { label: "Needed from", value: formatDate(requirement.requestedStartDate), mono: true },
                      { label: "Duration", value: durationLabel(requirement.expectedDurationValue, requirement.expectedDurationUnit) },
                      { label: "Responses until", value: formatDate(requirement.validityDate), mono: true },
                    ]}
                  />
                  {requirement.notes && <p className="m-0 mt-1.5 text-xs text-ink-body">Notes: {requirement.notes}</p>}
                </Alert>
              )}
              {sourceAuctionId && (
                <Alert tone="neutral" icon="auction">
                  Formalizing your win in auction {auctionRef(sourceAuctionId)}.{" "}
                  {auctionBidRate != null ? "The rate starts at your last bid." : "Your last bid couldn't be read, so enter the rate."}
                </Alert>
              )}

              <FormSection
                title="Machines"
                description={
                  requirement && requirement.quantity > 1
                    ? `The customer needs ${requirement.quantity}. Select more than one to quote several machines in one go — one quotation is created per machine, all with the same terms below.`
                    : "One quotation is created per machine selected, all with the same terms below."
                }
              >
                <div data-field="machines" className="flex flex-col gap-2">
                  <Input
                    size="sm"
                    type="search"
                    // name: the focus target when no machine is chosen on submit.
                    name="machines"
                    aria-label="Filter machines"
                    placeholder="Filter by asset code, registration or model"
                    prefix={<Icon name="search" size={13} />}
                    value={machineFilter}
                    onChange={(event) => setMachineFilter(event.target.value)}
                  />
                  <div
                    role="group"
                    aria-label="Machines to quote"
                    aria-describedby="quote-machines-msg"
                    className={cx(
                      "flex max-h-[220px] flex-col overflow-y-auto rounded-control border bg-surface",
                      form.errors.machines ? "border-[1.5px] border-danger-edge" : "border-border-control",
                    )}
                  >
                    {visibleMachines.length === 0 ? (
                      <p className="m-0 px-3 py-2.5 text-xs text-meta">No Active machine matches “{machineFilter}”.</p>
                    ) : (
                      visibleMachines.map((machine) => (
                        <Checkbox
                          key={machine.id}
                          className="border-b border-border px-3 py-2 last:border-0"
                          checked={selected.has(machine.id)}
                          onChange={(event) => toggleMachine(machine.id, event.target.checked)}
                          label={<span className="font-mono text-xs font-medium">{machine.assetCode}</span>}
                          description={[
                            productName(products.get(machine.productId)),
                            machine.registrationNumber,
                            matchesRequirement(machine) ? "matches the requirement's equipment type" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      ))
                    )}
                  </div>
                  <span id="quote-machines-msg" className={cx("text-[11px] leading-[1.4]", form.errors.machines ? "text-destructive" : "text-meta-light")}>
                    {form.errors.machines ?? `${plural(selectedActive.length, "machine")} selected. Only Active machines are listed.`}
                  </span>
                  {unquotable.length > 0 && (
                    <FormBanner tone="warning" title={`${plural(unquotable.length, "preselected machine")} can't be quoted`}>
                      Only Active machines can be quoted:{" "}
                      {unquotable.map((m) => `${m.assetCode} (${statusLabel("machine", m.status)})`).join(", ")}. They won&apos;t get a quotation.
                    </FormBanner>
                  )}
                  {missing.length > 0 && (
                    <FormBanner tone="warning" title={`${plural(missing.length, "preselected machine")} not found`}>
                      It isn&apos;t in your organization&apos;s fleet any more, so it was left out.
                    </FormBanner>
                  )}
                </div>
              </FormSection>

              <FormSection title="Customer" className="border-t border-border pt-4">
                {isFromRequirement ? (
                  <Input
                    label="Customer"
                    value={requirement ? (renters?.find((r) => r.id === requirement.renterOrganizationId)?.name ?? "The requirement's renter") : ""}
                    readOnly
                    disabled
                    suffix={<Icon name="lock" size={12} />}
                    hint="Locked to the renter who posted the requirement."
                  />
                ) : (
                  <>
                    <RadioGroup
                      label="Who is it for"
                      required
                      name="quotation-customer-mode"
                      value={mode}
                      onChange={(value) => setMode(value as "external" | "renter")}
                      options={[
                        { value: "external", label: "Not on FleetIP", description: "Enter their details; they're kept as entered. Nobody is notified." },
                        { value: "renter", label: "A FleetIP customer", description: "They're notified when you send it, and accept or counter in FleetIP." },
                      ]}
                    />
                    {mode === "external" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div data-field="clientName">
                          <Input label="Customer name" required maxLength={220} {...bind("clientName")} />
                        </div>
                        <div data-field="clientContactPerson">
                          <Input label="Contact person" maxLength={220} {...bind("clientContactPerson")} />
                        </div>
                        <div data-field="clientPhone">
                          <Input label="Phone" type="tel" maxLength={60} {...bind("clientPhone")} />
                        </div>
                        <div data-field="clientEmail">
                          <Input label="Email" type="email" {...bind("clientEmail")} />
                        </div>
                      </div>
                    ) : (
                      <div data-field="renterOrganizationId">
                        <SearchSelect
                          label="FleetIP customer"
                          name="renterOrganizationId"
                          required
                          options={(renters ?? []).map((r) => ({ value: r.id, label: r.name, description: r.code }))}
                          loading={renters === null}
                          value={values.renterOrganizationId}
                          onChange={(value) => form.set("renterOrganizationId", value)}
                          onBlur={form.field("renterOrganizationId").onBlur}
                          placeholder="Search renter organizations"
                          emptyText={rentersFailed ? "Customers didn't load." : "No renter organization matches."}
                          error={form.errors.renterOrganizationId}
                          hint={rentersFailed ? "FleetIP customers didn't load. Close the form and open it again to retry." : undefined}
                        />
                      </div>
                    )}
                  </>
                )}
              </FormSection>

              <FormSection title="Dates and rate" className="border-t border-border pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div data-field="startDate">
                    {lockedStartDate ? (
                      <Input
                        label="Start date"
                        mono
                        value={formatDate(lockedStartDate)}
                        readOnly
                        disabled
                        suffix={<Icon name="lock" size={12} />}
                        // A passed requirement start shows straight away: nothing on this form can fix it.
                        error={form.errors.startDate ?? (lockedStartDate < today ? passedStartMessage(lockedStartDate) : undefined)}
                        hint="The requirement's start date. Propose other dates after sending, if needed."
                      />
                    ) : (
                      <Input label="Start date" required type="date" mono min={today} {...bind("startDate")} hint="Today or later." />
                    )}
                  </div>
                  <div data-field="endDate">
                    {lockedEndDate ? (
                      <Input
                        label="End date"
                        mono
                        value={formatDate(lockedEndDate)}
                        readOnly
                        disabled
                        suffix={<Icon name="lock" size={12} />}
                        hint="Worked out from the requirement's duration."
                      />
                    ) : (
                      <Input label="End date" type="date" mono min={startDate || today} {...bind("endDate")} hint="Leave empty for an open-ended rental." />
                    )}
                  </div>
                  <div data-field="rate">
                    <Input
                      label="Rate"
                      required
                      prefix="₹"
                      mono
                      inputMode="decimal"
                      {...bind("rate")}
                      hint={
                        responseRate != null
                          ? "Starts at the indicative rate you gave in your response."
                          : auctionBidRate != null
                            ? "Starts at your last bid in the auction."
                            : undefined
                      }
                    />
                  </div>
                  <div data-field="rateUnit">
                    {lockedRateUnit ? (
                      <Input
                        label="Rate is"
                        value={formatRateUnit(lockedRateUnit).replace(/^per/, "Per")}
                        readOnly
                        disabled
                        suffix={<Icon name="lock" size={12} />}
                        hint="Set by the requirement, so every quotation compares like for like."
                      />
                    ) : (
                      <Select label="Rate is" required placeholder="Choose a unit" options={RATE_UNIT_OPTIONS} {...bind("rateUnit")} />
                    )}
                  </div>
                  <div data-field="validityDate">
                    <Input
                      label="Valid until"
                      required
                      type="date"
                      mono
                      min={today}
                      max={startDate || undefined}
                      {...bind("validityDate")}
                      hint="Last day the customer can accept. On or before the start date; it lapses after."
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Charges and commercial terms" className="border-t border-border pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div data-field="mobilizationCharge">
                    <Input label="Mobilization charge" prefix="₹" mono inputMode="decimal" {...bind("mobilizationCharge")} />
                  </div>
                  <div data-field="demobilizationCharge">
                    <Input label="Demobilization charge" prefix="₹" mono inputMode="decimal" {...bind("demobilizationCharge")} />
                  </div>
                  <div data-field="overtimeRate">
                    <Input label="Overtime rate" prefix="₹" suffix="per h" mono inputMode="decimal" {...bind("overtimeRate")} />
                  </div>
                  <div data-field="minimumRentalPeriodValue">
                    <Input label="Minimum rental period" mono inputMode="numeric" {...bind("minimumRentalPeriodValue")} />
                  </div>
                  <div data-field="minimumRentalPeriodUnit">
                    <Select label="Period unit" placeholder="Not specified" options={DURATION_UNIT_OPTIONS} {...bind("minimumRentalPeriodUnit")} />
                  </div>
                  <div data-field="noticePeriodDays">
                    <Input label="Notice period" suffix="days" mono inputMode="numeric" {...bind("noticePeriodDays")} />
                  </div>
                </div>
                <div data-field="gstTerms">
                  <Input label="GST terms" placeholder="e.g. GST extra @ 18%" {...bind("gstTerms")} />
                </div>
                <div data-field="paymentTerms">
                  <Textarea label="Payment terms" rows={2} {...bind("paymentTerms")} />
                </div>
              </FormSection>

              <FormSection title="Operating terms" className="border-t border-border pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div data-field="operatorScope">
                    <Select label="Operator" placeholder="Not specified" options={OPERATOR_OPTIONS} {...bind("operatorScope")} />
                  </div>
                  <div data-field="workingHours">
                    <Input label="Working hours" suffix="per shift" mono inputMode="decimal" {...bind("workingHours")} />
                  </div>
                  <div data-field="workingDaysPerWeek">
                    <Input label="Working days" suffix="per week" mono inputMode="numeric" {...bind("workingDaysPerWeek")} />
                  </div>
                  <div data-field="fuelScope">
                    <Select label="Fuel" placeholder="Not specified" options={RESPONSIBLE_PARTY_OPTIONS} {...bind("fuelScope")} />
                  </div>
                  <div data-field="accommodationScope">
                    <Select label="Accommodation" placeholder="Not specified" options={RESPONSIBLE_PARTY_OPTIONS} {...bind("accommodationScope")} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div data-field="shiftStructure">
                    <Input label="Shift structure" placeholder="e.g. 1 shift × 10 h, 08:00–18:00" {...bind("shiftStructure")} />
                  </div>
                  <div data-field="sundayCondition">
                    <Input label="Sunday condition" {...bind("sundayCondition")} />
                  </div>
                  <div data-field="fuelNorms">
                    <Input label="Fuel norms" {...bind("fuelNorms")} />
                  </div>
                  <div data-field="dehireTerms">
                    <Input label="Dehire terms" {...bind("dehireTerms")} />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Conditions" className="border-t border-border pt-4">
                <div data-field="commercialNotes">
                  <Textarea
                    label="Special and site conditions"
                    rows={2}
                    {...bind("commercialNotes")}
                    hint={requirement ? "Starts with the requirement's shift and crew details." : undefined}
                  />
                </div>
                <div data-field="companyTerms">
                  <Textarea label="Company terms and conditions" rows={2} {...bind("companyTerms")} />
                </div>
              </FormSection>
            </>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

function ResultsList({ results }: { results: MachineResult[] }) {
  const created = results.filter((r) => r.outcome === "created").length;
  return (
    <>
      <p className="m-0 text-sm text-ink-body" role="status">
        {created} of {plural(results.length, "machine")} quoted.
        {created < results.length ? " The rest have no quotation — nothing was created for them." : ""}
      </p>
      <ul className="m-0 flex list-none flex-col rounded-control border border-border-strong p-0">
        {results.map((r) => (
          <li key={r.machineId} className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-0">
            <Icon
              name={r.outcome === "created" ? "success" : r.outcome === "failed" ? "error" : "warning"}
              size={16}
              label={r.outcome === "created" ? "Created" : r.outcome === "failed" ? "Failed" : "Not tried"}
              className={cx("mt-px", r.outcome === "created" ? "text-available" : r.outcome === "failed" ? "text-sev-error" : "text-sev-warning")}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-xs font-semibold text-ink">{r.assetCode}</span>
              {r.outcome === "created" && r.quotation ? (
                <span className="text-xs text-ink-body">
                  Created{" "}
                  <UILink href={`/quotations/${r.quotation.id}`} className="font-mono font-medium text-accent-text hover:underline">
                    {r.quotation.referenceNumber}
                  </UILink>{" "}
                  as a draft.
                </span>
              ) : (
                <span className="text-xs text-destructive">{r.reason}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
