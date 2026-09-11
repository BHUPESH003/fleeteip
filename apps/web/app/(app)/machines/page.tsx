"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import type { Machine, MachineStatus } from "@fleetip/contracts/equipment";
import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

function legalNextStatuses(current: MachineStatus): MachineStatus[] {
  if (current === "active") return ["under_maintenance", "retired"];
  if (current === "under_maintenance") return ["active", "retired"];
  return [];
}

const STATUS_LABEL: Record<MachineStatus, string> = {
  active: "Active",
  under_maintenance: "Under maintenance",
  retired: "Retired",
};

const STATUS_BADGE: Record<MachineStatus, string> = {
  active: "bg-green-100 text-green-800",
  under_maintenance: "bg-amber-100 text-amber-800",
  retired: "bg-gray-200 text-gray-600",
};

export default function MachinesPage() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});

  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [productId, setProductId] = useState("");

  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const session = (await apiClient.me()) as AuthenticatedSession;
        const firstOrganizationId = session.memberships[0]?.organization.id;
        if (!firstOrganizationId) {
          router.replace("/");
          return;
        }
        setOrganizationId(firstOrganizationId);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  useEffect(() => {
    void (async () => {
      setCategories((await apiClient.listProductCategories()) as ProductCategory[]);
      const all = (await apiClient.listProducts()) as Product[];
      setProductsById(Object.fromEntries(all.map((product) => [product.id, product])));
    })();
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    void refreshMachines(organizationId);
  }, [organizationId]);

  async function refreshMachines(orgId: string) {
    try {
      setMachines((await apiClient.listMachines(orgId)) as Machine[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load machines");
    }
  }

  async function handleCategoryChange(value: string) {
    setCategoryId(value);
    setSubcategoryId("");
    setProductId("");
    setProducts([]);
    setSubcategories([]);
    if (value) {
      setSubcategories((await apiClient.listProductSubcategories(value)) as ProductSubcategory[]);
    }
  }

  async function handleSubcategoryChange(value: string) {
    setSubcategoryId(value);
    setProductId("");
    if (value) setProducts((await apiClient.listProducts(value)) as Product[]);
    else setProducts([]);
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
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
      formElement.reset();
      setCategoryId("");
      setSubcategoryId("");
      setProductId("");
      setSubcategories([]);
      setProducts([]);
      await refreshMachines(organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register machine");
    }
  }

  async function handleStatusChange(machineId: string, status: MachineStatus) {
    if (!organizationId) return;
    setError(null);
    try {
      await apiClient.updateMachineStatus(organizationId, machineId, status);
      await refreshMachines(organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  const selectClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
  const inputClass = selectClass;
  const labelClass = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Equipment</h1>

      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Register a machine</h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Category</label>
            <select
              className={selectClass}
              value={categoryId}
              onChange={(e) => void handleCategoryChange(e.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Subcategory</label>
            <select
              className={selectClass}
              value={subcategoryId}
              disabled={!categoryId}
              onChange={(e) => void handleSubcategoryChange(e.target.value)}
            >
              <option value="">Select subcategory</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Product</label>
            <select
              className={selectClass}
              value={productId}
              disabled={!subcategoryId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.manufacturer} {product.name}
                  {product.capacity ? ` (${product.capacity} ${product.capacityUnit})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <form
          onSubmit={handleRegister}
          className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2"
        >
          <div>
            <label className={labelClass}>Asset code</label>
            <input className={inputClass} name="assetCode" required />
          </div>
          <div>
            <label className={labelClass}>Registration number</label>
            <input className={inputClass} name="registrationNumber" required />
          </div>
          <div>
            <label className={labelClass}>Chassis number</label>
            <input className={inputClass} name="chassisNumber" />
          </div>
          <div>
            <label className={labelClass}>Year of manufacture</label>
            <input className={inputClass} name="yearOfManufacture" type="number" />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!productId}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Register machine
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Machines</h2>

        {machines.length === 0 ? (
          <p className="text-sm text-gray-500">No machines registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4 font-medium">Asset code</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Registration</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((machine) => {
                  const product = productsById[machine.productId];
                  return (
                    <tr key={machine.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{machine.assetCode}</td>
                      <td className="py-2 pr-4">
                        {product ? `${product.manufacturer} ${product.name}` : machine.productId}
                      </td>
                      <td className="py-2 pr-4">{machine.registrationNumber}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[machine.status]}`}
                        >
                          {STATUS_LABEL[machine.status]}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <a
                            href={`/machines/${machine.id}`}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Details
                          </a>
                          {legalNextStatuses(machine.status).map((next) => (
                            <button
                              key={next}
                              onClick={() => handleStatusChange(machine.id, next)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Mark {STATUS_LABEL[next]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
