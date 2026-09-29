import { RequirementStatus } from "@fleetip/contracts/rfq";

const VALID_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  open: [RequirementStatus.closed, RequirementStatus.cancelled],
  closed: [],
  cancelled: [],
};

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
