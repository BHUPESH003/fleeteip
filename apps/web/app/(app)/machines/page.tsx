"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { downloadCsv } from "../../../lib/csv";
import { useSession } from "../../../lib/session-context";
import { RegisterMachineDialog } from "./RegisterMachineDialog";
import { MACHINE_STATUS_MAP, currentRentalFor, isAvailable } from "./shared";

const PAGE_SIZE = 10;

interface Loaded {
  machines: Machine[];
  rentals: Rental[];
  categories: ProductCategory[];
  productsById: Map<string, Product>;
  subcategoriesById: Map<string, ProductSubcategory>;
  renterNames: Map<string, string>;
}

export default function MachinesPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  async function load(orgId: string) {
    try {
      const [machines, rentals, categories, products, renterOrgs] = await Promise.all([
        apiClient.listMachines(orgId) as Promise<Machine[]>,
        apiClient.listRentals(orgId) as Promise<Rental[]>,
        apiClient.listProductCategories() as Promise<ProductCategory[]>,
        apiClient.listProducts() as Promise<Product[]>,
        apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
      ]);
      const subcategoryLists = await Promise.all(
        categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
      );
      setData({
        machines,
        rentals,
        categories,
        productsById: new Map(products.map((p) => [p.id, p])),
        subcategoriesById: new Map(subcategoryLists.flat().map((s) => [s.id, s])),
        renterNames: new Map(renterOrgs.map((o) => [o.id, o.name])),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load machines");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.machines.filter((m) => {
      const product = data.productsById.get(m.productId);
      if (q) {
        const haystack = [m.assetCode, m.registrationNumber, m.chassisNumber, product?.name, product?.manufacturer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryId && product?.productSubcategoryId) {
        const subcategory = data.subcategoriesById.get(product.productSubcategoryId);
        if (subcategory?.productCategoryId !== categoryId) return false;
      }
      if (status && m.status !== status) return false;
      if (availability) {
        const available = isAvailable(m, data.rentals);
        if (availability === "available" && !available) return false;
        if (availability === "on_rent" && !currentRentalFor(m.id, data.rentals)) return false;
      }
      return true;
    });
  }, [data, search, categoryId, status, availability]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId, status, availability]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading machines…" />;

  const { machines, rentals, categories, productsById, renterNames } = data;
  const available = machines.filter((m) => isAvailable(m, rentals)).length;
  const onRent = machines.filter((m) => currentRentalFor(m.id, rentals)).length;
  const underMaintenance = machines.filter((m) => m.status === "under_maintenance").length;
  const retired = machines.filter((m) => m.status === "retired").length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((m) => next.has(m.id));
      for (const m of pageItems) {
        if (allSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  }

  async function handleMarkUnderMaintenance() {
    if (!organizationId) return;
    await Promise.all(
      [...selected].map((id) => apiClient.updateMachineStatus(organizationId, id, "under_maintenance")),
    );
    setSelected(new Set());
    await load(organizationId);
  }

  function handleExportSelection() {
    const rows = machines
      .filter((m) => selected.has(m.id))
      .map((m) => {
        const product = productsById.get(m.productId);
        const rental = currentRentalFor(m.id, rentals);
        return [
          m.assetCode,
          product ? `${product.manufacturer} ${product.name}` : "",
          m.registrationNumber,
          m.status,
          rental ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) || rental.clientSnapshot?.name || "" : "",
        ];
      });
    downloadCsv("machines.csv", ["Asset code", "Product", "Registration", "Status", "Current renter"], rows);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Machines"
        description={`${machines.length} total · ${available} available · ${onRent} on rent · ${underMaintenance} under maintenance · ${retired} retired`}
        actions={<Button onClick={() => setRegisterOpen(true)}>Register machine</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Asset code, registration, chassis…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-44"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select
          className="w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "under_maintenance", label: "Under maintenance" },
            { value: "retired", label: "Retired" },
          ]}
        />
        <Select
          className="w-40"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          options={[
            { value: "", label: "Any availability" },
            { value: "available", label: "Available" },
            { value: "on_rent", label: "On rent" },
          ]}
        />
        {(search || categoryId || status || availability) && (
          <button
            type="button"
            className="text-xs font-medium text-accent-text"
            onClick={() => {
              setSearch("");
              setCategoryId("");
              setStatus("");
              setAvailability("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-panel border border-warning/30 bg-warning-bg px-4 py-2 text-sm">
          <span className="font-semibold text-warning">{selected.size} selected</span>
          <button type="button" className="text-accent-text" onClick={() => void handleMarkUnderMaintenance()}>
            Mark under maintenance
          </button>
          <button type="button" className="text-accent-text" onClick={handleExportSelection}>
            Export selection
          </button>
          <button type="button" className="ml-auto text-meta" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No machines match these filters"
          description="Try clearing filters, or register your first machine."
        />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every((m) => selected.has(m.id))}
                    onChange={toggleAllOnPage}
                  />
                </Th>
                <Th>Machine</Th>
                <Th>Category</Th>
                <Th>Capacity</Th>
                <Th>Registration</Th>
                <Th>Status</Th>
                <Th>Current rental</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {pageItems.map((machine) => {
                const product = productsById.get(machine.productId);
                const subcategory = product ? data.subcategoriesById.get(product.productSubcategoryId) : undefined;
                const rental = currentRentalFor(machine.id, rentals);
                const rentalName = rental
                  ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) ||
                    rental.clientSnapshot?.name ||
                    "Renter"
                  : null;
                return (
                  <Tr key={machine.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(machine.id)}
                        onChange={() => toggle(machine.id)}
                      />
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{machine.assetCode}</span>
                        <span className="text-xs text-meta">
                          {product ? `${product.manufacturer} ${product.name}` : machine.productId}
                        </span>
                      </div>
                    </Td>
                    <Td>{subcategory?.name ?? "—"}</Td>
                    <Td className="font-mono">
                      {product?.capacity ? `${product.capacity} ${product.capacityUnit}` : "—"}
                    </Td>
                    <Td className="font-mono">{machine.registrationNumber}</Td>
                    <Td>
                      <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
                    </Td>
                    <Td>
                      {rental ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-info">
                            RN-{rental.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="text-xs text-meta">{rentalName}</span>
                        </div>
                      ) : (
                        <span className="text-meta">—</span>
                      )}
                    </Td>
                    <Td>
                      <Link href={`/machines/${machine.id}`} className="text-xs font-medium text-accent-text">
                        Open
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      {organizationId && (
        <RegisterMachineDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          organizationId={organizationId}
          onRegistered={() => void load(organizationId)}
        />
      )}
    </div>
  );
}
