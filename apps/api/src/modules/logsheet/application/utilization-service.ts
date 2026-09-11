import type { MachineUtilization, RentalUtilization } from "@fleetip/contracts/logsheet";
import { NotFoundError } from "../../../shared/errors.js";
import type { MachineRepositoryPort } from "../../equipment/domain/ports.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { LogsheetRepositoryPort } from "../domain/ports.js";

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

// A per-Rental report reads that one Rental's own date span (already
// available data — no new dependency), so totalRentalDays is meaningful
// here even though it's dropped from the machine-level rollup. See
// docs/execution-and-billing-design.md §5.
export class UtilizationService {
  constructor(
    private readonly logsheetRepository: LogsheetRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async getRentalUtilization(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
  ): Promise<RentalUtilization> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "logsheet.manage",
    );
    const rental = await this.rentalRepository.findById(rentalId);
    if (!rental || rental.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }

    const totals = await this.logsheetRepository.getRentalTotals(rentalId);
    const today = new Date().toISOString().slice(0, 10);
    const totalRentalDays = daysBetweenInclusive(rental.start_date, rental.end_date ?? today);

    return { rentalId, totalRentalDays, ...totals };
  }

  async getMachineUtilization(
    userId: string,
    rentalCompanyOrganizationId: string,
    machineId: string,
  ): Promise<MachineUtilization> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "logsheet.manage",
    );
    const machine = await this.machineRepository.findById(machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }

    const totals = await this.logsheetRepository.getMachineTotals(machineId);
    return { machineId, ...totals };
  }
}
