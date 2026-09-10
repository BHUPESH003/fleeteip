import type { RentalStatus } from "@fleetip/contracts/rental";

const VALID_TRANSITIONS: Record<RentalStatus, RentalStatus[]> = {
  confirmed: ["active", "cancelled"],
  active: ["off_rent", "cancelled"],
  off_rent: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: RentalStatus, to: RentalStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
