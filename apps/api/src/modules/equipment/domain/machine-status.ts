import type { MachineStatus } from "@fleetip/contracts/equipment";

export const canTransition = (from: MachineStatus, to: MachineStatus): boolean => {
  if (from === "retired") {
    return false; // retired is terminal
  }
  if (from === "active" && to === "under_maintenance") {
    return true;
  }
  if (from === "under_maintenance" && to === "active") {
    return true;
  }
  if ((from === "active" || from === "under_maintenance") && to === "retired") {
    return true;
  }
  return false; // all other transitions are invalid
};
