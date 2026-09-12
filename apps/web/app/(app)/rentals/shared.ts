import type { RentalStatus } from "@fleetip/contracts/rental";
import type { TransportStatus } from "@fleetip/contracts/transport";
import type { StatusMap } from "@fleetip/ui";

export const RENTAL_STATUS_MAP: StatusMap = {
  confirmed: { label: "Confirmed", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  off_rent: { label: "Off-rent", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const TRANSPORT_STATUS_MAP: StatusMap = {
  planned: { label: "Planned", tone: "warning" },
  dispatched: { label: "Dispatched", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Recommendation, not legacy evidence — see docs/rental-domain-design.md §4.
// Mirrors RentalService's canTransition purely so the UI doesn't offer a
// button guaranteed to 409; the server remains the real enforcement point.
export function legalNextRentalStatuses(current: RentalStatus): RentalStatus[] {
  if (current === "confirmed") return ["active", "cancelled"];
  if (current === "active") return ["off_rent", "cancelled"];
  if (current === "off_rent") return ["completed", "cancelled"];
  return [];
}

export function legalNextTransportStatuses(current: TransportStatus): TransportStatus[] {
  if (current === "planned") return ["dispatched", "cancelled"];
  if (current === "dispatched") return ["delivered", "cancelled"];
  return [];
}
