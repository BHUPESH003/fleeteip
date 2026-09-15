"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { Button, Dialog, Input, Select } from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

export interface RegisterMachineDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onRegistered: () => void;
  // Pre-fills classification when opened from a specific catalogue product
  // (e.g. "Register as machine" on the product page) instead of the blank
  // machines-page flow. Machine's product reference is fixed once
  // registered — this only saves re-picking the same dropdowns.
  initialCategoryId?: string;
  initialSubcategoryId?: string;
  initialProductId?: string;
}

export function RegisterMachineDialog({
  open,
  onClose,
  organizationId,
  onRegistered,
  initialCategoryId,
  initialSubcategoryId,
  initialProductId,
}: RegisterMachineDialogProps) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setCategories((await apiClient.listProductCategories()) as ProductCategory[]);
      if (initialCategoryId && initialSubcategoryId && initialProductId) {
        setCategoryId(initialCategoryId);
        setSubcategories(
          (await apiClient.listProductSubcategories(initialCategoryId)) as ProductSubcategory[],
        );
        setSubcategoryId(initialSubcategoryId);
        setProducts((await apiClient.listProducts(initialSubcategoryId)) as Product[]);
        setProductId(initialProductId);
      }
    })();
  }, [open, initialCategoryId, initialSubcategoryId, initialProductId]);

  async function handleCategoryChange(value: string) {
    setCategoryId(value);
    setSubcategoryId("");
    setProductId("");
    setProducts([]);
    setSubcategories(
      value ? ((await apiClient.listProductSubcategories(value)) as ProductSubcategory[]) : [],
    );
  }

  async function handleSubcategoryChange(value: string) {
    setSubcategoryId(value);
    setProductId("");
    setProducts(value ? ((await apiClient.listProducts(value)) as Product[]) : []);
  }

  function reset() {
    setCategoryId("");
    setSubcategoryId("");
    setProductId("");
    setSubcategories([]);
    setProducts([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const yearOfManufacture = form.get("yearOfManufacture");
    try {
      await apiClient.createMachine(organizationId, {
        productId,
        assetCode: String(form.get("assetCode")),
        chassisNumber: form.get("chassisNumber") ? String(form.get("chassisNumber")) : undefined,
        registrationNumber: String(form.get("registrationNumber")),
        yearOfManufacture: yearOfManufacture ? Number(yearOfManufacture) : undefined,
      });
      reset();
      onRegistered();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register machine");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Register machine">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">Product</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select
              label="Category"
              options={[
                { value: "", label: "Select a category" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={categoryId}
              onChange={(e) => void handleCategoryChange(e.target.value)}
            />
            <Select
              label="Subcategory"
              options={[
                { value: "", label: subcategories.length ? "Select a subcategory" : "—" },
                ...subcategories.map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={subcategoryId}
              disabled={!categoryId}
              onChange={(e) => void handleSubcategoryChange(e.target.value)}
            />
            <Select
              label="Product"
              options={[
                { value: "", label: products.length ? "Select a product" : "—" },
                ...products.map((p) => ({
                  value: p.id,
                  label: `${p.manufacturer} ${p.name}${p.capacity ? ` (${p.capacity} ${p.capacityUnit})` : ""}`,
                })),
              ]}
              value={productId}
              disabled={!subcategoryId}
              onChange={(e) => setProductId(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">Identification</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Asset code" name="assetCode" required />
            <Input label="Registration number" name="registrationNumber" required />
            <Input label="Chassis number" name="chassisNumber" />
            <Input label="Year of manufacture" name="yearOfManufacture" type="number" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!productId}>
            Register machine
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
