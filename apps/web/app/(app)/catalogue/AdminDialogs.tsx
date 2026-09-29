"use client";

import type {
  CapacityUnit,
  CreateProductRequest,
  Product,
  ProductCategory,
  ProductSubcategory,
  UpdateProductRequest,
} from "@fleetip/contracts/catalogue";
import {
  Button,
  ConfirmDialog,
  Dialog,
  FormBanner,
  FormSection,
  Icon,
  Input,
  SearchSelect,
  Select,
  cx,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { ApiError } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { plural } from "../../../lib/format";
import {
  CAPACITY_UNITS,
  SPEC_FORM_GROUPS,
  buildSpecifications,
  checkedString,
  codeError,
  filledSpecCount,
  nameError,
  specFieldError,
  specPath,
  specValuesFrom,
  type CatalogueWriter,
  type SpecGroupKey,
} from "./shared";

/**
 * Create/edit forms for the shared Product Catalogue (category,
 * subcategory, product). Used by tenant admins holding catalogue.manage and
 * by FleetIP staff in Platform Admin — the caller passes the writer.
 * Rules mirror packages/contracts/src/catalogue: codes are capital A–Z/0–9
 * (category 2–10, subcategory 2–20) and fixed once created; names 1–200;
 * capacity above 0; spec numbers above 0. There is no delete or disable
 * endpoint, so none of these forms offers one.
 */

type FormProblem = { title: string; body: string } | null;

/**
 * The staff writer's errors lose the API's `field` (AdminApiError carries
 * only the message), and products' duplicate manufacturer + name 409 never
 * names one. Each form knows which field its only 409 is about, so tie it
 * there and let `conflicts` word it.
 */
async function tieConflictTo<T>(field: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && !error.field) {
      throw new ApiError(error.message, 409, error.code, [], field);
    }
    throw error;
  }
}

function sharedDataNote(editing: boolean) {
  return editing
    ? "This is shared catalogue data: every rental company on FleetIP sees your change."
    : "This adds to the shared catalogue every rental company on FleetIP uses.";
}

function FormProblems({ formError, online }: { formError: FormProblem; online: boolean }) {
  return (
    <>
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          Nothing can be saved until the connection is back. Your entries are kept.
        </FormBanner>
      )}
      {formError && (
        <FormBanner tone="error" title={formError.title}>
          {formError.body}
        </FormBanner>
      )}
    </>
  );
}

// ------------------------------------------------------------------ category

export function CategoryFormDialog({
  open,
  onClose,
  writer,
  category,
  existingCategories = [],
  affectedMachines = null,
  onSaved,
  openHref,
}: {
  open: boolean;
  onClose: () => void;
  writer: CatalogueWriter;
  /** Edit this category; omit to create one. */
  category?: ProductCategory | null;
  /** For the duplicate-code check before saving. */
  existingCategories?: ProductCategory[];
  /** Machines in the caller's fleet in this category; confirms an edit when above 0. */
  affectedMachines?: number | null;
  onSaved: () => void;
  /** Where the success toast's "Open" goes for a new category. */
  openHref?: (id: string) => string;
}) {
  const toast = useToast();
  const router = useRouter();
  const editing = Boolean(category);
  const schema = useMemo(
    () =>
      z.object({
        name: checkedString((name) => nameError(name, "category name")),
        code: editing
          ? z.string()
          : checkedString((code) => {
              const clash = existingCategories.find((c) => c.code === code);
              return codeError(code, 2, 10) ?? (clash ? `${code} is already the code of ${clash.name}. Pick a different code.` : null);
            }),
      }),
    [editing, existingCategories],
  );
  // The 409 copy names the typed code; filled in once values are known, read when a 409 comes back.
  const conflicts = { code: "" };
  const form = useForm({
    schema,
    initial: { name: category?.name ?? "", code: category?.code ?? "" },
    failTitle: editing ? "The new name wasn't saved" : "The category wasn't created",
    conflicts,
  });
  const { reset } = form;
  const [confirming, setConfirming] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset({ name: category?.name ?? "", code: category?.code ?? "" });
    setTried(false);
    // Keyed on the id: a re-read of the same category while open mustn't reset the form.
  }, [open, category?.id]);

  const name = form.values.name.trim();
  const code = form.values.code.trim();
  conflicts.code = `${code} is already used by another category. Pick a different code.`;
  const dirty = category ? name !== category.name : true;

  const save = form.submit(async (body) => {
    if (category) {
      await writer.updateCategory(category.id, { name: body.name });
      toast.success({ title: `Category renamed to ${body.name}`, body: `It was ${category.name}. Every rental company sees the new name.` });
    } else {
      const created = await tieConflictTo("code", () => writer.createCategory(body));
      toast.success({
        title: `Category ${body.name} created`,
        body: `Code ${body.code}. Add its subcategories next.`,
        action: created && openHref ? { label: "Open", onClick: () => router.push(openHref(created.id)) } : undefined,
      });
    }
    onSaved();
    onClose();
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (form.valid && (!dirty || !form.online)) return;
    if (form.valid && editing && (affectedMachines ?? 0) > 0) return setConfirming(true);
    void save(); // Invalid: shows the errors and focuses the first.
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={category ? `Rename ${category.name}` : "New category"}
        description={sharedDataNote(editing)}
        icon={category ? "edit" : "catalogue"}
        size="md"
        dismissible={!form.busy}
        onSubmit={handleSubmit}
        footer={
          <>
            <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              busy={form.busy && !confirming}
              busyLabel="Saving…"
              disabled={!dirty || !form.online}
              title={!form.online ? OFFLINE_HINT : undefined}
            >
              {category ? "Save name" : "Create category"}
            </Button>
          </>
        }
      >
        <FormProblems formError={form.banner} online={form.online} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div data-field="name">
            <Input label="Category name" required maxLength={220} placeholder="e.g. Cranes" {...form.field("name")} />
          </div>
          <div data-field="code">
            {category ? (
              <Input label="Code" mono value={category.code} disabled hideOptional hint="Codes can't be changed once created." />
            ) : (
              <Input
                label="Code"
                required
                mono
                maxLength={12}
                placeholder="e.g. CRN"
                autoCapitalize="characters"
                {...form.field("code")}
                onChange={(event) => form.set("code", event.target.value.toUpperCase())}
                hint="2 to 10 capital letters or digits."
              />
            )}
          </div>
        </div>
        {tried && !dirty && <p className="m-0 text-xs text-meta">The name hasn&apos;t changed yet.</p>}
      </Dialog>
      {category && (
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await save();
            setConfirming(false);
          }}
          title={`Rename ${category.name} to ${name}?`}
          icon="catalogue"
          tone="warning"
          consequences={[
            `${plural(affectedMachines ?? 0, "machine")} in your fleet ${affectedMachines === 1 ? "is" : "are"} in this category and will show the new name.`,
            "Every other rental company on FleetIP sees the new name too — FleetIP can't count their machines.",
            "The category code stays the same.",
          ]}
          confirmLabel="Rename category"
          cancelLabel="Keep editing"
          busy={form.busy}
          busyLabel="Saving…"
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ subcategory

export function SubcategoryFormDialog({
  open,
  onClose,
  writer,
  categories,
  subcategory,
  fixedCategoryId,
  existingSubcategories = [],
  affectedMachines = null,
  onSaved,
  openHref,
}: {
  open: boolean;
  onClose: () => void;
  writer: CatalogueWriter;
  categories: ProductCategory[];
  /** Edit this subcategory; omit to create one. */
  subcategory?: ProductSubcategory | null;
  /** Create inside this category (from its page) — the picker is locked. */
  fixedCategoryId?: string;
  /** For the duplicate-code check (codes are unique within a category). */
  existingSubcategories?: ProductSubcategory[];
  affectedMachines?: number | null;
  onSaved: () => void;
  openHref?: (id: string) => string;
}) {
  const toast = useToast();
  const router = useRouter();
  const editing = Boolean(subcategory);
  const initial = () => ({
    productCategoryId: subcategory?.productCategoryId ?? fixedCategoryId ?? "",
    name: subcategory?.name ?? "",
    code: subcategory?.code ?? "",
  });
  const schema = useMemo(
    () =>
      z
        .object({
          productCategoryId: editing ? z.string() : z.string().min(1, "Choose the category it belongs to."),
          name: checkedString((name) => nameError(name, "subcategory name")),
          code: editing ? z.string() : checkedString((code) => codeError(code, 2, 20)),
        })
        .superRefine((values, ctx) => {
          if (editing || codeError(values.code, 2, 20)) return;
          const clash = existingSubcategories.find((s) => s.productCategoryId === values.productCategoryId && s.code === values.code);
          const categoryName = categories.find((c) => c.id === values.productCategoryId)?.name;
          if (clash) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["code"],
              message: `${values.code} is already used by ${clash.name}${categoryName ? ` in ${categoryName}` : ""}. Pick a different code.`,
            });
          }
        }),
    [editing, existingSubcategories, categories],
  );
  // The 409 copy names the typed code; filled in once values are known, read when a 409 comes back.
  const conflicts = { code: "" };
  const form = useForm({
    schema,
    initial: initial(),
    failTitle: editing ? "The new name wasn't saved" : "The subcategory wasn't created",
    conflicts,
  });
  const { reset } = form;
  const [confirming, setConfirming] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset(initial());
    setTried(false);
    // Keyed on what the dialog opened for: a re-read of the same record while open mustn't reset the form.
  }, [open, subcategory?.id, fixedCategoryId]);

  const categoryId = form.values.productCategoryId;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const name = form.values.name.trim();
  const code = form.values.code.trim();
  const locked = editing || Boolean(fixedCategoryId);
  conflicts.code = `${code} is already used by another subcategory${category ? ` in ${category.name}` : ""}. Pick a different code.`;
  const dirty = subcategory ? name !== subcategory.name : true;

  const save = form.submit(async (body) => {
    if (subcategory) {
      await writer.updateSubcategory(subcategory.id, { name: body.name });
      toast.success({ title: `Subcategory renamed to ${body.name}`, body: `It was ${subcategory.name}. Every rental company sees the new name.` });
    } else {
      const created = await tieConflictTo("code", () => writer.createSubcategory(body));
      toast.success({
        title: `Subcategory ${body.name} created`,
        body: `In ${category?.name ?? "the category"}, code ${body.code}.`,
        action: created && openHref ? { label: "Open", onClick: () => router.push(openHref(created.id)) } : undefined,
      });
    }
    onSaved();
    onClose();
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (form.valid && (!dirty || !form.online)) return;
    if (form.valid && editing && (affectedMachines ?? 0) > 0) return setConfirming(true);
    void save(); // Invalid: shows the errors and focuses the first.
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={subcategory ? `Rename ${subcategory.name}` : "New subcategory"}
        description={sharedDataNote(editing)}
        icon={subcategory ? "edit" : "catalogue"}
        size="md"
        dismissible={!form.busy}
        onSubmit={handleSubmit}
        footer={
          <>
            <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              busy={form.busy && !confirming}
              busyLabel="Saving…"
              disabled={!dirty || !form.online}
              title={!form.online ? OFFLINE_HINT : undefined}
            >
              {subcategory ? "Save name" : "Create subcategory"}
            </Button>
          </>
        }
      >
        <FormProblems formError={form.banner} online={form.online} />
        <div data-field="productCategoryId">
          {locked ? (
            <Input
              label="Category"
              value={category?.name ?? "Not specified"}
              disabled
              hideOptional
              hint={editing ? "A subcategory stays in the category it was created in." : undefined}
            />
          ) : (
            <Select
              label="Category"
              required
              placeholder="Choose a category"
              options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
              {...form.field("productCategoryId")}
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div data-field="name">
            <Input label="Subcategory name" required maxLength={220} placeholder="e.g. Mobile crane" {...form.field("name")} />
          </div>
          <div data-field="code">
            {subcategory ? (
              <Input label="Code" mono value={subcategory.code} disabled hideOptional hint="Codes can't be changed once created." />
            ) : (
              <Input
                label="Code"
                required
                mono
                maxLength={22}
                placeholder="e.g. MCR"
                autoCapitalize="characters"
                {...form.field("code")}
                onChange={(event) => form.set("code", event.target.value.toUpperCase())}
                hint="2 to 20 capital letters or digits, unique in its category."
              />
            )}
          </div>
        </div>
        {tried && !dirty && <p className="m-0 text-xs text-meta">The name hasn&apos;t changed yet.</p>}
      </Dialog>
      {subcategory && (
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await save();
            setConfirming(false);
          }}
          title={`Rename ${subcategory.name} to ${name}?`}
          icon="catalogue"
          tone="warning"
          consequences={[
            `${plural(affectedMachines ?? 0, "machine")} in your fleet ${affectedMachines === 1 ? "is" : "are"} in this subcategory and will show the new name.`,
            "Every other rental company on FleetIP sees the new name too — FleetIP can't count their machines.",
            "The subcategory code stays the same.",
          ]}
          confirmLabel="Rename subcategory"
          cancelLabel="Keep editing"
          busy={form.busy}
          busyLabel="Saving…"
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ product

const PRODUCT_FIELD_WORD: Record<string, string> = {
  name: "name",
  manufacturer: "manufacturer",
  capacity: "capacity",
  capacityUnit: "capacity unit",
  specifications: "specifications",
};

type ProductValues = Record<string, string> & {
  productSubcategoryId: string;
  manufacturer: string;
  name: string;
  capacity: string;
  capacityUnit: string;
};

const SPEC_FIELDS = SPEC_FORM_GROUPS.flatMap((group) => group.fields.map((field) => ({ path: specPath(group.key, field.key), field })));

/** The create request from the form's strings: only filled fields, specifications only when some are filled. */
function productInput(values: ProductValues): CreateProductRequest {
  const capacity = values.capacity.trim();
  const specs = buildSpecifications(values);
  return {
    productSubcategoryId: values.productSubcategoryId,
    manufacturer: values.manufacturer.trim(),
    name: values.name.trim(),
    ...(capacity ? { capacity: Number(capacity) } : {}),
    ...(values.capacityUnit ? { capacityUnit: values.capacityUnit as CapacityUnit } : {}),
    ...(Object.keys(specs).length > 0 ? { specifications: specs } : {}),
  };
}

/** What an edit changes. Specifications are replaced whole, so they're sent complete (possibly empty) when they differ. */
function productChanges(product: Product, input: CreateProductRequest): UpdateProductRequest {
  const changes: UpdateProductRequest = {};
  if (input.name !== product.name) changes.name = input.name;
  if (input.manufacturer !== product.manufacturer) changes.manufacturer = input.manufacturer;
  if (input.capacity !== undefined && input.capacity !== product.capacity) changes.capacity = input.capacity;
  if (input.capacityUnit && input.capacityUnit !== product.capacityUnit) changes.capacityUnit = input.capacityUnit;
  const specs = input.specifications ?? {};
  if (JSON.stringify(specs) !== JSON.stringify(buildSpecifications(specValuesFrom(product.specifications)))) changes.specifications = specs;
  return changes;
}

/**
 * Rules in the words users read. A recorded capacity or unit can be
 * corrected but not removed; manufacturer + name must be new to the
 * catalogue. Produces the create request (an edit sends productChanges of it).
 */
function productSchema(product: Product | null, existingProducts: Product[]) {
  return z
    .object({
      productSubcategoryId: product ? z.string() : z.string().min(1, "Choose the subcategory this product belongs to."),
      manufacturer: checkedString((value) => nameError(value, "manufacturer")),
      name: checkedString((value) => nameError(value, "product name")),
      capacity: checkedString((value) => {
        if (!value) return product?.capacity != null ? "A recorded capacity can be corrected but not removed." : null;
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? null : "Enter a capacity above 0, e.g. 36.";
      }),
      capacityUnit: z.string().refine((value) => value || !product?.capacityUnit, "A recorded unit can be changed but not removed."),
      ...Object.fromEntries(SPEC_FIELDS.map(({ path, field }) => [path, checkedString((value) => specFieldError(field, value))])),
    })
    .superRefine((values, ctx) => {
      const manufacturer = values.manufacturer.toLowerCase();
      const name = values.name.toLowerCase();
      if (!manufacturer || !name || nameError(values.name, "product name")) return;
      const duplicate = existingProducts.find(
        (p) => p.id !== product?.id && p.manufacturer.trim().toLowerCase() === manufacturer && p.name.trim().toLowerCase() === name,
      );
      if (duplicate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: `${duplicate.manufacturer} ${duplicate.name} is already in the catalogue. Change the name or the manufacturer.`,
        });
      }
    })
    .transform((values) => productInput(values as ProductValues)) as z.ZodType<CreateProductRequest, z.ZodTypeDef, ProductValues>;
}

export function ProductFormDialog({
  open,
  onClose,
  writer,
  subcategories,
  categoriesById,
  product,
  fixedSubcategoryId,
  existingProducts = [],
  affectedMachines = null,
  onSaved,
  openHref,
}: {
  open: boolean;
  onClose: () => void;
  writer: CatalogueWriter;
  subcategories: ProductSubcategory[];
  categoriesById: Map<string, ProductCategory>;
  /** Edit this product; omit to create one. */
  product?: Product | null;
  /** Create inside this subcategory (from its page) — the picker is locked. */
  fixedSubcategoryId?: string;
  /** For the duplicate manufacturer + name check. */
  existingProducts?: Product[];
  /** Machines in the caller's fleet on this product; confirms an edit when above 0. */
  affectedMachines?: number | null;
  onSaved: () => void;
  openHref?: (id: string) => string;
}) {
  const toast = useToast();
  const router = useRouter();
  const baseId = useId();
  const editing = Boolean(product);
  const initial = (): ProductValues => ({
    productSubcategoryId: product?.productSubcategoryId ?? fixedSubcategoryId ?? "",
    manufacturer: product?.manufacturer ?? "",
    name: product?.name ?? "",
    capacity: product?.capacity != null ? String(product.capacity) : "",
    capacityUnit: product?.capacityUnit ?? "",
    ...specValuesFrom(product?.specifications),
  });
  const schema = useMemo(() => productSchema(product ?? null, existingProducts), [product, existingProducts]);
  // The 409 copy names the product; filled in once values are known, read when a 409 comes back.
  const conflicts = { name: "" };
  const form = useForm({
    schema,
    initial: initial(),
    failTitle: editing ? "Changes weren't saved" : "The product wasn't created",
    conflicts,
  });
  const { reset } = form;
  const [confirming, setConfirming] = useState(false);
  const [tried, setTried] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<SpecGroupKey>>(new Set());

  useEffect(() => {
    if (!open) return;
    const values = initial();
    reset(values);
    setTried(false);
    setOpenGroups(new Set(SPEC_FORM_GROUPS.filter((g) => filledSpecCount(values, g.key) > 0).map((g) => g.key)));
    // Keyed on what the dialog opened for: a re-read of the same record while open mustn't reset the form.
  }, [open, product?.id, fixedSubcategoryId]);

  /** Opens every spec group holding one of these field paths. */
  function openGroupsFor(paths: string[]) {
    const groups = SPEC_FORM_GROUPS.filter((g) => paths.some((path) => path.startsWith(`specifications.${g.key}.`))).map((g) => g.key);
    if (groups.length) setOpenGroups((current) => new Set([...current, ...groups]));
    return groups.length > 0;
  }

  // A server message on a spec field may sit in a collapsed group: open it.
  const errorPaths = Object.keys(form.errors).filter((key) => form.errors[key]);
  const errorPathsKey = errorPaths.join("|");
  useEffect(() => {
    openGroupsFor(errorPathsKey ? errorPathsKey.split("|") : []);
  }, [errorPathsKey]);

  const values = form.values;
  const subcategoryId = values.productSubcategoryId;
  const subcategory = subcategories.find((s) => s.id === subcategoryId) ?? null;
  const subcategoryLabel = (s: ProductSubcategory | null) =>
    s ? [categoriesById.get(s.productCategoryId)?.name, s.name].filter(Boolean).join(" · ") : "Not specified";
  const manufacturer = values.manufacturer.trim();
  const name = values.name.trim();
  const capacityRaw = values.capacity.trim();
  const unit = values.capacityUnit;
  const locked = editing || Boolean(fixedSubcategoryId);

  // Warnings never block saving.
  const unitWarning = capacityRaw && !unit ? "Add a unit so the capacity reads clearly, e.g. Ton." : undefined;
  const capacityWarning = !capacityRaw && unit && !form.errors.capacity ? "The unit only shows next to a capacity." : undefined;

  const changes = product ? productChanges(product, productInput(values)) : {};
  const dirty = product ? Object.keys(changes).length > 0 : true;
  const label = `${manufacturer || "This"} ${name || "product"}`.trim();
  conflicts.name = `${label} is already in the catalogue. Change the name or the manufacturer.`;

  const save = form.submit(async (input) => {
    if (product) {
      const update = productChanges(product, input);
      // The only conflict products return: manufacturer + name must be unique.
      await tieConflictTo("name", () => writer.updateProduct(product.id, update));
      toast.success({
        title: `${label} updated`,
        body: `Changed: ${Object.keys(update)
          .map((key) => PRODUCT_FIELD_WORD[key] ?? key)
          .join(", ")}.`,
      });
    } else {
      const created = await tieConflictTo("name", () => writer.createProduct(input));
      toast.success({
        title: `${label} added to the catalogue`,
        body: `In ${subcategoryLabel(subcategory)}. Machines can now be registered against it.`,
        action: created && openHref ? { label: "Open", onClick: () => router.push(openHref(created.id)) } : undefined,
      });
    }
    onSaved();
    onClose();
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!form.valid) {
      // A spec error may sit in a collapsed group: open it, then validate (and focus) once it renders.
      const parsed = schema.safeParse(values);
      const paths = parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0]));
      if (openGroupsFor(paths)) setTimeout(() => void save(), 0);
      else void save();
      return;
    }
    if (!dirty || !form.online) return;
    if (editing && (affectedMachines ?? 0) > 0) return setConfirming(true);
    void save();
  }

  function toggleGroup(key: SpecGroupKey) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const subcategoryOptions = subcategories
    .map((s) => ({
      value: s.id,
      label: s.name,
      description: [categoriesById.get(s.productCategoryId)?.name, s.code].filter(Boolean).join(" · "),
      keywords: s.code,
    }))
    .sort((a, b) => a.description.localeCompare(b.description) || a.label.localeCompare(b.label));

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={product ? `Edit ${product.manufacturer} ${product.name}` : "New product"}
        description={sharedDataNote(editing)}
        icon={product ? "edit" : "catalogue"}
        size="lg"
        dismissible={!form.busy}
        onSubmit={handleSubmit}
        footer={
          <>
            <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              busy={form.busy && !confirming}
              busyLabel="Saving…"
              disabled={!dirty || !form.online}
              title={!form.online ? OFFLINE_HINT : undefined}
            >
              {product ? "Save changes" : "Create product"}
            </Button>
          </>
        }
      >
        <FormProblems formError={form.banner} online={form.online} />
        <FormSection title="What it is">
          <div data-field="productSubcategoryId">
            {locked ? (
              <Input
                label="Subcategory"
                value={subcategoryLabel(subcategory)}
                disabled
                hideOptional
                hint={editing ? "A product stays in the subcategory it was created in." : undefined}
              />
            ) : (
              <SearchSelect
                label="Subcategory"
                required
                options={subcategoryOptions}
                value={subcategoryId}
                onChange={(value) => form.set("productSubcategoryId", value)}
                onBlur={form.field("productSubcategoryId").onBlur}
                placeholder="Search subcategories"
                emptyText="No subcategory matches. Create it on its category first."
                error={form.errors.productSubcategoryId}
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div data-field="manufacturer">
              <Input label="Manufacturer" required maxLength={220} placeholder="e.g. Putzmeister" {...form.field("manufacturer")} />
            </div>
            <div data-field="name">
              <Input label="Product name" required maxLength={220} placeholder="e.g. M36-4" {...form.field("name")} />
            </div>
            <div data-field="capacity">
              <Input
                label="Rated capacity"
                mono
                inputMode="decimal"
                placeholder="e.g. 36"
                {...form.field("capacity")}
                warning={capacityWarning}
              />
            </div>
            <div data-field="capacityUnit">
              <Select
                label="Capacity unit"
                placeholder="No unit"
                options={CAPACITY_UNITS.map((u) => ({ value: u, label: u }))}
                {...form.field("capacityUnit")}
                warning={unitWarning}
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Specifications"
          description="Optional. Fill only what applies — empty groups aren't shown on the product page."
          className="border-t border-border pt-4"
        >
          <div className="flex flex-col gap-2">
            {SPEC_FORM_GROUPS.map((group) => {
              const isOpen = openGroups.has(group.key);
              const filled = filledSpecCount(values, group.key);
              const panelId = `${baseId}-${group.key}`;
              return (
                <div key={group.key} className="overflow-hidden rounded-control border border-border-soft">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 border-0 bg-surface px-3 py-2 text-left text-sm font-medium text-ink-strong hover:bg-surface-row-hover focus-visible:-outline-offset-2"
                  >
                    <Icon name="chevron_right" size={13} className={cx("text-meta transition-transform", isOpen && "rotate-90")} />
                    {group.label}
                    <span className="ml-auto text-[11px] font-normal text-meta-light">
                      {filled > 0 ? `${filled} of ${group.fields.length} filled` : "Empty"}
                    </span>
                  </button>
                  {isOpen && (
                    <div id={panelId} className="grid grid-cols-1 gap-3 border-t border-border-soft bg-surface-sunk p-3 sm:grid-cols-2">
                      {group.fields.map((field) => {
                        const path = specPath(group.key, field.key);
                        return (
                          <div key={path} data-field={path}>
                            <Input
                              label={field.label}
                              mono={field.kind !== "text"}
                              inputMode={field.kind === "integer" ? "numeric" : field.kind === "number" ? "decimal" : undefined}
                              suffix={field.unit}
                              {...form.field(path)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </FormSection>
        {tried && !dirty && <p className="m-0 text-xs text-meta">Nothing has changed yet.</p>}
      </Dialog>
      {product && (
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await save();
            setConfirming(false);
          }}
          title={`Save changes to ${product.manufacturer} ${product.name}?`}
          description={`Changing: ${Object.keys(changes)
            .map((key) => PRODUCT_FIELD_WORD[key] ?? key)
            .join(", ")}.`}
          icon="catalogue"
          tone="warning"
          consequences={[
            `${plural(affectedMachines ?? 0, "machine")} in your fleet ${affectedMachines === 1 ? "uses" : "use"} this product and will show the new details.`,
            "Other rental companies' machines on this product change too — FleetIP can't count those.",
            "The machines' own records (asset codes, rentals, history) don't change.",
          ]}
          confirmLabel="Save changes"
          cancelLabel="Keep editing"
          busy={form.busy}
          busyLabel="Saving…"
        />
      )}
    </>
  );
}
