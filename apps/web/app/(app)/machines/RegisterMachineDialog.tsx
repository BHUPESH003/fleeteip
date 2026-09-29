"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import {
  Button,
  DescriptionList,
  Dialog,
  FormBanner,
  FormSection,
  Icon,
  Input,
  SearchSelect,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { apiClient, type CreateMachineInput } from "../../../lib/api-client";
import { categoryIcon } from "../../../lib/category-icon";
import { describeError, errorStatus } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { capacityLabel, productName, specGroups } from "./shared";

export interface RegisterMachineDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Called with the new machine once it's saved. The dialog shows the success toast itself. */
  onRegistered: (machine: Machine) => void;
  // Pre-fills classification when opened from a specific catalogue product
  // (e.g. "Register as machine" on the product page) instead of the blank
  // machines-page flow. Machine's product reference is fixed once
  // registered — this only saves re-picking the same dropdowns.
  initialCategoryId?: string;
  initialSubcategoryId?: string;
  initialProductId?: string;
}

const THIS_YEAR = new Date().getFullYear();

type Values = Record<
  "categoryId" | "subcategoryId" | "productId" | "assetCode" | "registrationNumber" | "chassisNumber" | "yearOfManufacture",
  string
>;

const EMPTY: Values = {
  categoryId: "",
  subcategoryId: "",
  productId: "",
  assetCode: "",
  registrationNumber: "",
  chassisNumber: "",
  yearOfManufacture: "",
};

const upTo50 = (plural: string) => (value: string) => ({ message: `${plural} are up to 50 characters. This one has ${value.length}.` });

/**
 * Rules mirror createMachineRequestSchema. The cascade reports only the
 * first missing level, and its wording depends on what the catalogue
 * returned (an empty subcategory or product list).
 */
function registerMachineSchema(subcategories: ProductSubcategory[] | null, products: Product[] | null) {
  return z
    .object({
      categoryId: z.string(),
      subcategoryId: z.string(),
      productId: z.string(),
      assetCode: z
        .string()
        .trim()
        .min(1, "Enter the asset code your team uses for this machine.")
        .refine((value) => value.length <= 50, upTo50("Asset codes")),
      registrationNumber: z
        .string()
        .trim()
        .min(1, "Enter the registration number.")
        .refine((value) => value.length <= 50, upTo50("Registration numbers")),
      chassisNumber: z
        .string()
        .trim()
        .refine((value) => value.length <= 50, upTo50("Chassis numbers")),
      yearOfManufacture: z
        .string()
        .trim()
        .refine(
          (value) => !value || (/^\d{4}$/.test(value) && Number(value) >= 1980 && Number(value) <= THIS_YEAR),
          `Enter a year between 1980 and ${THIS_YEAR}.`,
        ),
    })
    .superRefine((values, ctx) => {
      if (!values.categoryId)
        ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose the category, for example Boom pump or Crane." });
      else if (!values.subcategoryId)
        ctx.addIssue({
          code: "custom",
          path: ["subcategoryId"],
          message:
            subcategories && subcategories.length === 0
              ? "This category has no subcategories yet. Choose another category."
              : "Choose the subcategory.",
        });
      else if (!values.productId)
        ctx.addIssue({
          code: "custom",
          path: ["productId"],
          message:
            products && products.length === 0
              ? "This subcategory has no products yet. Choose another subcategory."
              : "Choose the product: the make and model of this machine.",
        });
    })
    .transform(
      (values): CreateMachineInput => ({
        productId: values.productId,
        assetCode: values.assetCode,
        registrationNumber: values.registrationNumber,
        chassisNumber: values.chassisNumber || undefined,
        yearOfManufacture: values.yearOfManufacture ? Number(values.yearOfManufacture) : undefined,
      }),
    );
}

/**
 * Registers a machine against a catalogue product: Category → Subcategory
 * → Product as a searchable cascade, a preview of the chosen product so the
 * wrong one is caught before saving (it can't be changed afterwards —
 * updateMachineRequestSchema excludes productId), then the codes your team
 * identifies it by.
 */
export function RegisterMachineDialog({
  open,
  onClose,
  organizationId,
  onRegistered,
  initialCategoryId,
  initialSubcategoryId,
  initialProductId,
}: RegisterMachineDialogProps) {
  const toast = useToast();
  const router = useRouter();

  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState({ categories: false, subcategories: false, products: false });
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const schema = useMemo(() => registerMachineSchema(subcategories, products), [subcategories, products]);
  const form = useForm({
    schema,
    initial: EMPTY,
    failTitle: "The machine wasn't registered",
    conflicts: {
      // A getter so the copy names the code that was submitted (read when the 409 arrives, after `form` exists).
      get assetCode(): string {
        return `${form.values.assetCode.trim()} is already used by another machine in your organization.`;
      },
    },
  });
  const { values, set, reset } = form;
  // A 404 on create means the product left the catalogue; useForm can only route 400/409 to a field, so this one is local.
  const [productGone, setProductGone] = useState<string | null>(null);
  // Each cascade level ignores answers that arrive after its parent changed again.
  const requests = useRef({ categories: 0, subcategories: 0, products: 0 });

  async function loadProducts(subcategoryId: string, preselect?: string) {
    const token = ++requests.current.products;
    setProducts(null);
    setLoading((l) => ({ ...l, products: true }));
    try {
      const list: Product[] = (await apiClient.listProducts(subcategoryId, false)) ?? [];
      if (token !== requests.current.products) return;
      setProducts(list);
      const pick = preselect && list.some((p) => p.id === preselect) ? preselect : list.length === 1 ? (list[0]?.id ?? "") : "";
      if (pick) set("productId", pick);
    } catch (err) {
      if (token === requests.current.products) setCatalogueError(describeError(err, "The catalogue didn't load").body);
    } finally {
      if (token === requests.current.products) setLoading((l) => ({ ...l, products: false }));
    }
  }

  async function loadSubcategories(categoryId: string, preset?: { subcategoryId?: string; productId?: string }) {
    const token = ++requests.current.subcategories;
    requests.current.products++;
    setSubcategories(null);
    setProducts(null);
    setLoading((l) => ({ ...l, subcategories: true, products: false }));
    try {
      const list: ProductSubcategory[] = (await apiClient.listProductSubcategories(categoryId)) ?? [];
      if (token !== requests.current.subcategories) return;
      setSubcategories(list);
      const pick =
        preset?.subcategoryId && list.some((s) => s.id === preset.subcategoryId)
          ? preset.subcategoryId
          : list.length === 1
            ? (list[0]?.id ?? "")
            : "";
      if (pick) {
        set("subcategoryId", pick);
        void loadProducts(pick, preset?.productId);
      }
    } catch (err) {
      if (token === requests.current.subcategories) setCatalogueError(describeError(err, "The catalogue didn't load").body);
    } finally {
      if (token === requests.current.subcategories) setLoading((l) => ({ ...l, subcategories: false }));
    }
  }

  async function loadCategories() {
    const token = ++requests.current.categories;
    requests.current.subcategories++;
    requests.current.products++;
    setCategories(null);
    setSubcategories(null);
    setProducts(null);
    setCatalogueError(null);
    setLoading({ categories: true, subcategories: false, products: false });
    try {
      const list: ProductCategory[] = (await apiClient.listProductCategories()) ?? [];
      if (token !== requests.current.categories) return;
      setCategories(list);
      const pick =
        initialCategoryId && list.some((c) => c.id === initialCategoryId)
          ? initialCategoryId
          : list.length === 1
            ? (list[0]?.id ?? "")
            : "";
      if (pick) {
        set("categoryId", pick);
        void loadSubcategories(pick, { subcategoryId: initialSubcategoryId, productId: initialProductId });
      }
    } catch (err) {
      if (token === requests.current.categories) setCatalogueError(describeError(err, "The catalogue didn't load").body);
    } finally {
      if (token === requests.current.categories) setLoading((l) => ({ ...l, categories: false }));
    }
  }

  // Every open starts clean (and re-applies the catalogue pre-fill, if any).
  useEffect(() => {
    if (!open) return;
    reset(EMPTY);
    setProductGone(null);
    void loadCategories();
    // loadCategories reads the initial* props of this render
  }, [open, initialCategoryId, initialSubcategoryId, initialProductId]);

  function pickCategory(id: string) {
    set("categoryId", id);
    set("subcategoryId", "");
    set("productId", "");
    setProductGone(null);
    if (id) void loadSubcategories(id);
    else {
      requests.current.subcategories++;
      requests.current.products++;
      setSubcategories(null);
      setProducts(null);
      setLoading((l) => ({ ...l, subcategories: false, products: false }));
    }
  }

  function pickSubcategory(id: string) {
    set("subcategoryId", id);
    set("productId", "");
    setProductGone(null);
    if (id) void loadProducts(id);
    else {
      requests.current.products++;
      setProducts(null);
      setLoading((l) => ({ ...l, products: false }));
    }
  }

  function pickProduct(id: string) {
    set("productId", id);
    setProductGone(null);
  }

  const category = categories?.find((c) => c.id === values.categoryId) ?? null;
  const subcategory = subcategories?.find((s) => s.id === values.subcategoryId) ?? null;
  const product = products?.find((p) => p.id === values.productId) ?? null;

  const save = form.submit(async (body) => {
    let machine: Machine;
    try {
      machine = (await apiClient.createMachine(organizationId, body)) as Machine;
    } catch (err) {
      if (errorStatus(err) !== 404) throw err;
      setProductGone("This product isn't in the catalogue any more. Choose another one.");
      return;
    }
    toast.success({
      title: `${machine.assetCode} registered`,
      body: `${productName(product) ?? "Catalogue product"} · registration ${machine.registrationNumber}. It's Active, so it can be quoted and rented now.`,
      action: { label: "Open", onClick: () => router.push(`/machines/${machine.id}`) },
    });
    onRegistered(machine);
    onClose();
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formElement = event.currentTarget;
    await save(event);
    // The cascade pickers have no `name` for useForm to focus, so move focus to the first field showing an error.
    requestAnimationFrame(() => formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  const cascadeField = (name: "categoryId" | "subcategoryId" | "productId") => {
    const { onBlur, error } = form.field(name);
    return { value: values[name], onBlur, error };
  };

  const groups = specGroups(product?.specifications);
  const capacity = capacityLabel(product);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register machine"
      description="Add a machine to your fleet. It starts as Active, so it can be quoted and rented straight away."
      icon="plus"
      tone="info"
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
            icon="plus"
            busy={form.busy}
            busyLabel="Registering…"
            disabled={!form.online}
            title={!form.online ? "You're offline. Machines can be registered once the connection is back." : undefined}
          >
            Register machine
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      {catalogueError && (
        <FormBanner
          tone="error"
          title="The catalogue didn't load"
          action={
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void loadCategories()}>
              Try again
            </Button>
          }
        >
          {catalogueError}
        </FormBanner>
      )}

      <FormSection title="What it is" description="Pick the catalogue product this machine is. Its specifications come from the catalogue.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SearchSelect
            label="Category"
            required
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name, keywords: c.code }))}
            loading={loading.categories}
            {...cascadeField("categoryId")}
            onChange={pickCategory}
            placeholder="Search categories"
            emptyText="No category matches."
          />
          <SearchSelect
            label="Subcategory"
            required
            options={(subcategories ?? []).map((s) => ({ value: s.id, label: s.name, keywords: s.code }))}
            loading={loading.subcategories}
            disabled={!values.categoryId}
            {...cascadeField("subcategoryId")}
            onChange={pickSubcategory}
            placeholder={values.categoryId ? "Search subcategories" : "Choose a category first"}
            emptyText="No subcategory matches."
          />
        </div>
        <SearchSelect
          label="Product"
          required
          options={(products ?? []).map((p) => ({
            value: p.id,
            label: productName(p) ?? p.name,
            description: capacityLabel(p) ?? undefined,
            keywords: `${p.manufacturer} ${p.name}`,
          }))}
          loading={loading.products}
          disabled={!values.subcategoryId}
          {...cascadeField("productId")}
          onChange={pickProduct}
          placeholder={values.subcategoryId ? "Search by make or model" : "Choose a subcategory first"}
          emptyText="No product matches."
          error={productGone ?? cascadeField("productId").error}
          hint="The product can't be changed after registration."
        />

        {product && (
          <section
            aria-label="Chosen product"
            className="flex flex-col gap-3 rounded-panel border border-border bg-surface-sunk px-3.5 py-3"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control border border-tile-border bg-tile text-tile-icon">
                <Icon name={categoryIcon(category)} size={20} strokeWidth={1.4} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold leading-tight text-ink">{productName(product)}</span>
                <span className="text-xs leading-tight text-meta">
                  {[category?.name, subcategory?.name, capacity].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <DescriptionList
              layout="rows"
              items={[
                { label: "Manufacturer", value: product.manufacturer },
                { label: "Model", value: product.name },
                { label: "Rated capacity", value: capacity, mono: true },
              ]}
            />
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-2 border-t border-border pt-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">{group.label}</span>
                <DescriptionList
                  layout="rows"
                  items={group.items.map((item) => ({ label: item.label, value: item.value, mono: true }))}
                />
              </div>
            ))}
            {groups.length === 0 && (
              <p className="m-0 text-xs text-ink-soft">No detailed specifications are recorded on this catalogue product.</p>
            )}
            <p className="m-0 flex items-center gap-1.5 text-[11px] leading-[1.4] text-meta">
              <Icon name="lock" size={12} className="text-meta-light" />
              Check this is the right product. It can&apos;t be changed after registration.
            </p>
          </section>
        )}
      </FormSection>

      <FormSection
        title="How you identify it"
        description="Your own codes for this machine. They can be corrected later."
        className="border-t border-border pt-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Asset code"
            required
            mono
            maxLength={60}
            autoComplete="off"
            {...form.field("assetCode")}
            // Opened from a catalogue product: the cascade is pre-filled, so start on the first code.
            {...(initialProductId ? { "data-autofocus": "" } : {})}
            hint="Your own fleet code, e.g. KPH-BP-036. Up to 50 characters."
          />
          <Input
            label="Registration number"
            required
            mono
            maxLength={60}
            autoComplete="off"
            {...form.field("registrationNumber")}
            hint="Up to 50 characters."
          />
          <Input label="Chassis number" mono maxLength={60} autoComplete="off" {...form.field("chassisNumber")} hint="Up to 50 characters." />
          <Input
            label="Year built"
            mono
            inputMode="numeric"
            maxLength={4}
            {...form.field("yearOfManufacture")}
            hint={`1980 to ${THIS_YEAR}.`}
          />
        </div>
      </FormSection>
    </Dialog>
  );
}
