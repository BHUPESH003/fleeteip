import type { TransportStatus } from "@fleetip/contracts/transport";

const VALID_TRANSITIONS: Record<TransportStatus, TransportStatus[]> = {
  planned: ["dispatched", "cancelled"],
  dispatched: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: TransportStatus, to: TransportStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
