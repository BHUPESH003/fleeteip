"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import { ProjectStatus, type Project } from "@fleetip/contracts/project";
import type { RateUnit } from "@fleetip/contracts/rental";
import type { CreateRequirementRequest, CrewRequirement, Requirement, ShiftPattern } from "@fleetip/contracts/rfq";
import {
  Button,
  Dialog,
  FormBanner,
  FormSection,
  Input,
  SearchSelect,
  Select,
  Textarea,
  UILink,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { categoryIcon } from "../../../lib/category-icon";
import { OFFLINE_HINT } from "../../../lib/errors";
import { formatDate, formatRateUnit, todayIsoDate } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { useSession } from "../../../lib/session-context";
import { optional } from "../../../lib/use-load";
import {
  CREW_OPTIONS,
  DURATION_UNIT_OPTIONS,
  SHIFT_PATTERN_OPTIONS,
  loadSubcategoryIndex,
  requirementRef,
  underField,
  type SubcategoryEntry,
} from "./shared";

export interface PostRequirementDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Preselects the project (Projects → "Post a requirement", or a project-filtered list). */
  initialProjectId?: string | null;
  onPosted: (requirement: Requirement) => void;
}

type Key =
  | "projectId"
  | "productSubcategoryId"
  | "capacity"
  | "capacityUnit"
  | "boomLength"
  | "quantity"
  | "requestedStartDate"
  | "expectedDurationValue"
  | "expectedDurationUnit"
  | "shiftPattern"
  | "crewRequirement"
  | "shiftRequirement"
  | "validityDate"
  | "notes";
type Values = Record<Key, string>;

function blank(projectId: string): Values {
  return {
    projectId,
    productSubcategoryId: "",
    capacity: "",
    capacityUnit: "",
    boomLength: "",
    quantity: "1",
    requestedStartDate: "",
    expectedDurationValue: "",
    expectedDurationUnit: "",
    shiftPattern: "",
    crewRequirement: "",
    shiftRequirement: "",
    validityDate: "",
    notes: "",
  };
}

const positive = (raw: string) => Number(raw) > 0 && Number.isFinite(Number(raw));
const wholePositive = (raw: string) => Number.isInteger(Number(raw)) && Number(raw) > 0;
const text = (raw: string) => (raw.trim() ? raw.trim() : undefined);

/**
 * Mirrors createRequirementRequestSchema: start and validity dates not in
 * the past, validity on or before the start date, positive
 * capacity/boom/quantity/duration. Keys are in form order (the first
 * invalid one gets focus). `activeProjectIds` is null until projects load.
 */
function postRequirementSchema(activeProjectIds: Set<string> | null, today: string) {
  const notPast = (value: string) => value >= today;
  return z
    .object({
      projectId: z
        .string()
        .min(1, "Choose the project this equipment is for.")
        .refine((id) => !activeProjectIds || activeProjectIds.has(id), "This project isn't active any more. Choose an active project."),
      productSubcategoryId: z.string().min(1, "Choose the type of equipment you need."),
      capacity: z.string().refine((raw) => !raw.trim() || positive(raw), "Enter a capacity above 0, e.g. 50."),
      capacityUnit: z.string().refine((raw) => raw.trim().length <= 20, "Units are up to 20 characters, e.g. t or m³."),
      boomLength: z.string().refine((raw) => !raw.trim() || positive(raw), "Enter a boom length above 0, in metres."),
      quantity: z.string().refine((raw) => raw.trim() !== "" && wholePositive(raw), "Enter how many machines you need — 1 or more, in whole numbers."),
      requestedStartDate: z
        .string()
        .min(1, "Pick the day the equipment is needed on site.")
        .refine(notPast, `The start date can't be in the past. The earliest is today, ${formatDate(today)}.`),
      expectedDurationValue: z.string().refine((raw) => !raw.trim() || wholePositive(raw), "Enter the duration in whole units, e.g. 3."),
      expectedDurationUnit: z.string(),
      validityDate: z
        .string()
        .min(1, "Pick the last day rental companies can respond.")
        .refine(notPast, `The validity date can't be in the past. The earliest is today, ${formatDate(today)}.`),
      shiftPattern: z.string(),
      crewRequirement: z.string(),
      shiftRequirement: z.string().refine((raw) => raw.trim().length <= 500, "Shift notes are up to 500 characters."),
      notes: z.string().refine(
        (raw) => raw.trim().length <= 2000,
        (raw) => ({ message: `Notes are up to 2,000 characters. These have ${raw.trim().length.toLocaleString("en-IN")}.` }),
      ),
    })
    .refine((values) => !values.requestedStartDate || values.validityDate <= values.requestedStartDate, {
      message: "Validity date can't be after the requested start date.",
      path: ["validityDate"],
    })
    .transform(
      (values): CreateRequirementRequest => ({
        projectId: values.projectId,
        productSubcategoryId: values.productSubcategoryId,
        capacity: values.capacity.trim() ? Number(values.capacity) : undefined,
        capacityUnit: text(values.capacityUnit),
        // The boom field is shown for boom equipment or once it holds a value, so a value is always visible.
        boomLength: values.boomLength.trim() ? Number(values.boomLength) : undefined,
        quantity: Number(values.quantity),
        requestedStartDate: values.requestedStartDate,
        expectedDurationValue: values.expectedDurationValue.trim() ? Number(values.expectedDurationValue) : undefined,
        expectedDurationUnit: (values.expectedDurationUnit || undefined) as RateUnit | undefined,
        shiftPattern: (values.shiftPattern || undefined) as ShiftPattern | undefined,
        crewRequirement: (values.crewRequirement || undefined) as CrewRequirement | undefined,
        shiftRequirement: text(values.shiftRequirement),
        validityDate: values.validityDate,
        notes: text(values.notes),
      }),
    );
}

/**
 * Post a requirement. The project's name and site come from the Project
 * itself (the API snapshots them) — they're never asked for again here
 * (docs/decisions.md, "asked for the project's name/location twice").
 */
export function PostRequirementDialog({ open, onClose, organizationId, initialProjectId, onPosted }: PostRequirementDialogProps) {
  const { hasPermission } = useSession();
  const toast = useToast();
  const router = useRouter();
  const canListProjects = hasPermission("project.manage");

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [subcategories, setSubcategories] = useState<Map<string, SubcategoryEntry> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const today = todayIsoDate();
  // RequirementService.createRequirement refuses a project that isn't active.
  const activeProjects = useMemo(() => (projects ?? []).filter((p) => p.status === ProjectStatus.active), [projects]);
  const schema = useMemo(
    () => postRequirementSchema(projects ? new Set(activeProjects.map((p) => p.id)) : null, today),
    [projects, activeProjects, today],
  );
  const form = useForm({ schema, initial: blank(""), failTitle: "The requirement wasn't posted" });
  const { values, busy, online, reset } = form;
  // Warnings (never block) show once a field was left or a submit was tried — same as errors.
  const [seen, setSeen] = useState<Partial<Record<Key, boolean>>>({});
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset(blank(initialProjectId ?? ""));
    setSeen({});
    setTried(false);
    let cancelled = false;
    void (async () => {
      const [projectList, index, productList] = await Promise.all([
        canListProjects
          ? optional(true, () => apiClient.listProjects(organizationId) as Promise<Project[]>, null as Project[] | null)
          : Promise.resolve(null),
        loadSubcategoryIndex(),
        optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
      ]);
      if (cancelled) return;
      setProjectsFailed(canListProjects && projectList === null);
      setProjects(projectList ?? []);
      setSubcategories(index);
      setProducts(productList);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, initialProjectId, canListProjects, reset]);

  const selectedProject = activeProjects.find((p) => p.id === values.projectId) ?? null;
  const entry = subcategories?.get(values.productSubcategoryId) ?? null;

  // Boom length only means something for boom equipment. Shown when the
  // catalogue says so: the category is a crane/boom family, or a product
  // in this subcategory carries boom specifications.
  const isBoomEquipment = Boolean(
    entry &&
      (["crane", "boom_pump"].includes(categoryIcon(entry.category)) ||
        products.some((p) => p.productSubcategoryId === entry.subcategory.id && p.specifications?.boomFamily)),
  );
  const showBoom = isBoomEquipment || values.boomLength.trim() !== "";

  const warnings: Partial<Record<Key, string>> = {};
  if (values.capacity.trim() && !values.capacityUnit.trim())
    warnings.capacityUnit = `Add a unit so rental companies know what ${values.capacity.trim()} means, e.g. t or m³.`;
  if (values.expectedDurationValue.trim() && wholePositive(values.expectedDurationValue) && !values.expectedDurationUnit)
    warnings.expectedDurationUnit = "Choose days, weeks, months or shifts — a number alone can't be used for quotation dates.";
  else if (!values.expectedDurationValue.trim() && values.expectedDurationUnit)
    warnings.expectedDurationValue = "Add how long you need it for, e.g. 3.";

  function bind(key: Key) {
    const field = form.field(key);
    return {
      ...field,
      onBlur: () => {
        field.onBlur();
        setSeen((current) => ({ ...current, [key]: true }));
      },
      warning: seen[key] || tried ? warnings[key] : undefined,
    };
  }

  function pick(key: Key) {
    return (value: string) => form.set(key, value);
  }

  const submit = form.submit(async (input) => {
    const requirement = (await apiClient
      .createRequirement(organizationId, input)
      // "Cannot post a requirement against a project that is not active" has no field path.
      .catch(underField(/project/i, "projectId"))) as Requirement;
    toast.success({
      title: `Requirement ${requirementRef(requirement.id)} posted`,
      body: `${entry?.subcategory.name ?? "Equipment"} for ${requirement.projectName ?? selectedProject?.projectName ?? "your project"}. Rental companies can respond until ${formatDate(requirement.validityDate)}.`,
      action: { label: "Open", onClick: () => router.push(`/requirements/${requirement.id}`) },
    });
    onPosted(requirement);
    onClose();
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setTried(true);
    return submit(event);
  };

  const projectOptions = activeProjects.map((p) => ({
    value: p.id,
    label: p.projectName,
    description: `${p.projectCode} · ${p.siteLocation}`,
    keywords: `${p.projectCode} ${p.projectType}`,
  }));
  const subcategoryOptions = [...(subcategories?.values() ?? [])]
    .map(({ subcategory, category }) => ({
      value: subcategory.id,
      label: subcategory.name,
      description: category?.name ?? undefined,
      keywords: `${subcategory.code} ${category?.code ?? ""}`,
    }))
    .sort((a, b) => `${a.description} ${a.label}`.localeCompare(`${b.description} ${b.label}`));

  const noProjects = canListProjects && !projectsFailed && projects !== null && activeProjects.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Post a requirement"
      description="Rental companies see it in the Open Market until the validity date and reply with an indicative rate."
      icon="requirement"
      tone="info"
      size="lg"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={busy}
            busyLabel="Posting…"
            disabled={!online || noProjects || !canListProjects || projectsFailed}
            title={!online ? OFFLINE_HINT : undefined}
          >
            Post requirement
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      {projectsFailed ? (
        <FormBanner tone="error" title="Your projects didn't load">
          A requirement needs a project. Close this form and try again in a moment.
        </FormBanner>
      ) : !canListProjects ? (
        <FormBanner tone="warning" title="Your role can't choose a project">
          Every requirement belongs to a project, and listing projects needs the Projects permission. Ask an organization
          admin to add it to your role.
        </FormBanner>
      ) : noProjects ? (
        <FormBanner
          tone="info"
          title="Create a project first"
          action={
            <UILink href="/projects?create=1" className="text-xs font-medium text-accent-text hover:underline">
              New project
            </UILink>
          }
        >
          Requirements are posted against an active project, which supplies the project name and site. You have no active
          project yet.
        </FormBanner>
      ) : null}

      <FormSection title="Project">
        <div data-field="projectId">
          <SearchSelect
            label="Project"
            required
            options={projectOptions}
            loading={projects === null}
            disabled={!canListProjects || noProjects}
            value={values.projectId}
            onChange={pick("projectId")}
            onBlur={bind("projectId").onBlur}
            placeholder="Search by name, code or site"
            emptyText="No active project matches."
            error={form.errors.projectId}
            hint={
              selectedProject
                ? `Rental companies see “${selectedProject.projectName}, ${selectedProject.siteLocation}” on this requirement.`
                : "Only active projects are listed. The project's name and site are copied onto the requirement."
            }
          />
        </div>
      </FormSection>

      <FormSection title="Equipment" className="border-t border-border pt-4">
        <div data-field="productSubcategoryId">
          <SearchSelect
            label="Equipment type"
            required
            options={subcategoryOptions}
            loading={subcategories === null}
            value={values.productSubcategoryId}
            onChange={pick("productSubcategoryId")}
            onBlur={bind("productSubcategoryId").onBlur}
            placeholder="Search the catalogue, e.g. crawler crane"
            emptyText="No equipment type matches."
            error={form.errors.productSubcategoryId}
            hint="From the FleetIP catalogue. It can't be changed after posting."
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div data-field="capacity">
            <Input label="Capacity" mono inputMode="decimal" {...bind("capacity")} />
          </div>
          <div data-field="capacityUnit">
            <Input label="Capacity unit" maxLength={30} placeholder="e.g. t, m³" {...bind("capacityUnit")} />
          </div>
          <div data-field="quantity">
            <Input label="Quantity" required mono inputMode="numeric" suffix="machines" {...bind("quantity")} />
          </div>
        </div>
        {showBoom && (
          <div data-field="boomLength" className="sm:max-w-[calc((100%-1.5rem)/3)]">
            <Input label="Boom length" mono inputMode="decimal" suffix="m" {...bind("boomLength")} hint="For cranes and other boom equipment." />
          </div>
        )}
      </FormSection>

      <FormSection title="Schedule" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="requestedStartDate">
            <Input label="Needed on site from" required type="date" mono min={today} {...bind("requestedStartDate")} hint="Today or later." />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
            <div data-field="expectedDurationValue">
              <Input label="Expected duration" mono inputMode="numeric" {...bind("expectedDurationValue")} />
            </div>
            <div data-field="expectedDurationUnit">
              <Select label="Unit" placeholder="Not specified" options={DURATION_UNIT_OPTIONS} {...bind("expectedDurationUnit")} />
            </div>
          </div>
          <div data-field="validityDate">
            <Input
              label="Responses accepted until"
              required
              type="date"
              mono
              min={today}
              max={values.requestedStartDate || undefined}
              {...bind("validityDate")}
              hint="The validity date: after it, the requirement leaves the Open Market. On or before the start date."
            />
          </div>
          <p className="m-0 self-center text-xs leading-[1.5] text-meta">
            {values.expectedDurationUnit
              ? `Responses and quotations will be priced ${formatRateUnit(values.expectedDurationUnit)}, so they compare like for like.`
              : "The duration unit, when given, becomes the rate unit on every response and quotation."}
          </p>
        </div>
      </FormSection>

      <FormSection title="Shift and crew" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="shiftPattern">
            <Select label="Shift pattern" placeholder="Not specified" options={SHIFT_PATTERN_OPTIONS} {...bind("shiftPattern")} />
          </div>
          <div data-field="crewRequirement">
            <Select label="Crew" placeholder="Not specified" options={CREW_OPTIONS} {...bind("crewRequirement")} />
          </div>
        </div>
        <div data-field="shiftRequirement">
          <Input label="Shift notes" maxLength={520} placeholder="e.g. 08:00 start, night shift preferred" {...bind("shiftRequirement")} />
        </div>
      </FormSection>

      <FormSection title="Notes" className="border-t border-border pt-4">
        <div data-field="notes">
          <Textarea label="Notes for rental companies" rows={3} {...bind("notes")} hint="Site access, ground conditions, anything that affects the price." />
        </div>
      </FormSection>
    </Dialog>
  );
}
