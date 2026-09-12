import type { Product } from "@fleetip/contracts/catalogue";

export function formatCapacity(product: Pick<Product, "capacity" | "capacityUnit">): string {
  if (product.capacity == null) return "—";
  return `${product.capacity} ${product.capacityUnit ?? ""}`.trim();
}

/**
 * The platform catalogue has no machine-count-per-product column and no
 * product→machine reverse lookup endpoint (see docs/frontend-backend-gap-report.md,
 * Phase 11 — Catalogue). Machine counts shown anywhere in this section are
 * scoped to the CALLING organization's own already-fetched fleet (a single
 * listMachines call, filtered client-side) — real data, not a platform-wide
 * count and not an N+1 loop.
 */
export function machinesUsingProduct<M extends { productId: string }>(
  productId: string,
  ownFleet: M[],
): M[] {
  return ownFleet.filter((m) => m.productId === productId);
}
