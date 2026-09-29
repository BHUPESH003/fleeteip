import { RentalStatus } from "@fleetip/contracts/rental";
import { TransportStatus } from "@fleetip/contracts/transport";

// Recommendation, not legacy evidence — see docs/rental-domain-design.md §4.
// Mirrors RentalService's canTransition purely so the UI doesn't offer a
// button guaranteed to 409; the server remains the real enforcement point.
export function legalNextRentalStatuses(current: RentalStatus): RentalStatus[] {
  if (current === RentalStatus.confirmed) return [RentalStatus.active, RentalStatus.cancelled];
  if (current === RentalStatus.active) return [RentalStatus.off_rent, RentalStatus.cancelled];
  if (current === RentalStatus.off_rent) return [RentalStatus.completed, RentalStatus.cancelled];
  return [];
}

export function legalNextTransportStatuses(current: TransportStatus): TransportStatus[] {
  if (current === TransportStatus.planned) return [TransportStatus.dispatched, TransportStatus.cancelled];
  if (current === TransportStatus.dispatched) return [TransportStatus.delivered, TransportStatus.cancelled];
  return [];
}
