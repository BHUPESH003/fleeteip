import { RentalStatus } from "@fleetip/contracts/rental";

const VALID_TRANSITIONS: Record<RentalStatus, RentalStatus[]> = {
  confirmed: [RentalStatus.active, RentalStatus.cancelled],
  active: [RentalStatus.off_rent, RentalStatus.cancelled],
  off_rent: [RentalStatus.completed, RentalStatus.cancelled],
  completed: [],
  cancelled: [],
};

export function canTransition(from: RentalStatus, to: RentalStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
