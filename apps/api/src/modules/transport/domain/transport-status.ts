import { TransportStatus } from "@fleetip/contracts/transport";

const VALID_TRANSITIONS: Record<TransportStatus, TransportStatus[]> = {
  planned: [TransportStatus.dispatched, TransportStatus.cancelled],
  dispatched: [TransportStatus.delivered, TransportStatus.cancelled],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: TransportStatus, to: TransportStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
