import { MachineStatus } from "@fleetip/contracts/equipment";

export const canTransition = (from: MachineStatus, to: MachineStatus): boolean => {
  if (from === MachineStatus.retired) {
    return false; // retired is terminal
  }
  if (from === MachineStatus.active && to === MachineStatus.under_maintenance) {
    return true;
  }
  if (from === MachineStatus.under_maintenance && to === MachineStatus.active) {
    return true;
  }
  if ((from === MachineStatus.active || from === MachineStatus.under_maintenance) && to === MachineStatus.retired) {
    return true;
  }
  return false; // all other transitions are invalid
};
