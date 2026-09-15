import type { Logsheet, SubmitLogsheetRequest } from "@fleetip/contracts/logsheet";
import { isFutureIsoDate } from "@fleetip/contracts/shared";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors.js";
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
    // "active" is this app's own signal that the machine is actually on
    // site (see the Rental detail page's own banner: "plan mobilization,
    // then mark Active once the machine is on site") — before that there's
    // nothing to log yet, and once off_rent/completed the engagement is
    // closed.
    if (rental.status !== "active") {
      throw new ConflictError(
        "Logsheets can only be submitted while the rental is active (the machine is on site)",
      );
    }
    if (input.logDate < rental.start_date) {
      throw new ValidationError("Log date cannot be before the rental's start date");
    }
    if (rental.end_date && input.logDate > rental.end_date) {
      throw new ValidationError("Log date cannot be after the rental's end date");
    }
    if (isFutureIsoDate(input.logDate)) {
      throw new ValidationError("Log date cannot be in the future");
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

  // A logsheet's own id, with no rentalId already in hand — the
  // notification/dashboard "deep link" case, same shape as
  // TransportService.getTransportById.
  async getLogsheetById(userId: string, organizationId: string, logsheetId: string): Promise<Logsheet> {
    const record = await this.logsheetRepository.findById(logsheetId);
    if (!record) {
      throw new NotFoundError("Logsheet not found");
    }
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === "renter") {
      await this.permissionService.requirePermission(userId, organizationId, "logsheet.respond");
      const rental = await this.rentalRepository.findById(record.rental_id);
      if (!rental || rental.renter_organization_id !== organizationId) {
        throw new NotFoundError("Logsheet not found for this organization");
      }
      return toLogsheet(record);
    }

    await this.permissionService.requirePermission(userId, organizationId, "logsheet.manage");
    const rental = await this.rentalRepository.findById(record.rental_id);
    if (!rental || rental.rental_company_organization_id !== organizationId) {
      throw new NotFoundError("Logsheet not found in this organization");
    }
    return toLogsheet(record);
  }

  // Standalone Logsheets screen — every logsheet across the Rental
  // Company's own fleet of rentals.
  async listByOrganization(
    userId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<Logsheet[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "logsheet.manage",
    );
    const records = await this.logsheetRepository.listByRentalCompanyOrganization(
      rentalCompanyOrganizationId,
    );
    return records.map(toLogsheet);
  }
}
