import type { Logsheet, SubmitLogsheetRequest } from "@fleetip/contracts/logsheet";
import { NotFoundError } from "../../../shared/errors.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../organizations/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { LogsheetRecord, LogsheetRepositoryPort } from "../domain/ports.js";

function toLogsheet(record: LogsheetRecord): Logsheet {
  return {
    id: record.id,
    rentalId: record.rental_id,
    machineId: record.machine_id,
    logDate: record.log_date,
    shift: record.shift,
    operatingHours: record.operating_hours,
    idleHours: record.idle_hours,
    overtimeHours: record.overtime_hours,
    operatorName: record.operator_name,
    fuelConsumed: record.fuel_consumed,
    fuelUnit: record.fuel_unit,
    remarks: record.remarks,
    customerConfirmed: record.customer_confirmed,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class LogsheetService {
  constructor(
    private readonly logsheetRepository: LogsheetRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async submitLogsheet(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    input: SubmitLogsheetRequest,
  ): Promise<Logsheet> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "logsheet.manage",
    );
    const rental = await this.rentalRepository.findById(rentalId);
    if (!rental || rental.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }

    const record = await this.logsheetRepository.submit({
      rentalId,
      machineId: rental.machine_id,
      logDate: input.logDate,
      shift: input.shift,
      operatingHours: input.operatingHours,
      idleHours: input.idleHours,
      overtimeHours: input.overtimeHours,
      operatorName: input.operatorName,
      fuelConsumed: input.fuelConsumed,
      fuelUnit: input.fuelUnit,
      remarks: input.remarks,
      customerConfirmed: input.customerConfirmed,
    });
    return toLogsheet(record);
  }

  // Serves both sides of a single rental's Logsheets tab — same
  // organization-type branch as TransportService.listByRental /
  // RentalService.listRentals.
  async listByRental(
    userId: string,
    organizationId: string,
    rentalId: string,
  ): Promise<Logsheet[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === "renter") {
      await this.permissionService.requirePermission(userId, organizationId, "logsheet.respond");
      const rental = await this.rentalRepository.findById(rentalId);
      if (!rental || rental.renter_organization_id !== organizationId) {
        throw new NotFoundError("Rental not found for this organization");
      }
      const records = await this.logsheetRepository.listByRental(rentalId);
      return records.map(toLogsheet);
    }

    await this.permissionService.requirePermission(userId, organizationId, "logsheet.manage");
    const rental = await this.rentalRepository.findById(rentalId);
    if (!rental || rental.rental_company_organization_id !== organizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    const records = await this.logsheetRepository.listByRental(rentalId);
    return records.map(toLogsheet);
  }
}
