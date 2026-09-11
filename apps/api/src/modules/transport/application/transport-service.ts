import type {
  CreateTransportRequest,
  TransportLeg,
  TransportRecord as TransportContract,
  UpdateTransportRequest,
} from "@fleetip/contracts/transport";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import { canTransition } from "../domain/transport-status.js";
import type { TransportRecord, TransportRepositoryPort } from "../domain/ports.js";

function toTransport(record: TransportRecord): TransportContract {
  return {
    id: record.id,
    rentalId: record.rental_id,
    leg: record.leg,
    pickupLocation: record.pickup_location,
    destination: record.destination,
    plannedDate: record.planned_date,
    actualDate: record.actual_date,
    status: record.status,
    transportDetails: record.transport_details,
    charges: record.charges,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class TransportService {
  constructor(
    private readonly transportRepository: TransportRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  private async requireOwnedRental(rentalCompanyOrganizationId: string, rentalId: string) {
    const rental = await this.rentalRepository.findById(rentalId);
    if (!rental || rental.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    return rental;
  }

  async createTransport(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    input: CreateTransportRequest,
  ): Promise<TransportContract> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "transport.manage",
    );
    await this.requireOwnedRental(rentalCompanyOrganizationId, rentalId);

    const record = await this.transportRepository.create({
      rentalId,
      leg: input.leg,
      pickupLocation: input.pickupLocation,
      destination: input.destination,
      plannedDate: input.plannedDate,
      transportDetails: input.transportDetails,
      charges: input.charges,
      notes: input.notes,
    });
    return toTransport(record);
  }

  async listByRental(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
  ): Promise<TransportContract[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "transport.manage",
    );
    await this.requireOwnedRental(rentalCompanyOrganizationId, rentalId);
    const records = await this.transportRepository.listByRental(rentalId);
    return records.map(toTransport);
  }

  async updateTransport(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    leg: TransportLeg,
    updates: UpdateTransportRequest,
  ): Promise<TransportContract> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "transport.manage",
    );
    await this.requireOwnedRental(rentalCompanyOrganizationId, rentalId);

    const existing = await this.transportRepository.findByRentalAndLeg(rentalId, leg);
    if (!existing) {
      throw new NotFoundError(`No ${leg} transport record exists for this rental yet`);
    }
    if (updates.status && !canTransition(existing.status, updates.status)) {
      throw new ConflictError(
        `Cannot transition ${leg} transport from ${existing.status} to ${updates.status}`,
      );
    }

    const record = await this.transportRepository.update(existing.id, updates);
    return toTransport(record);
  }
}
