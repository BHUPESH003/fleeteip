import type { TransportLeg, TransportStatus } from "@fleetip/contracts/transport";
import type { TransportListParams } from "@fleetip/contracts/list";
import type { Page, ParsedListQuery } from "../../../shared/list-query.js";

export interface TransportRecord {
  id: string;
  rental_id: string;
  leg: TransportLeg;
  pickup_location: string | null;
  destination: string | null;
  planned_date: string | null;
  actual_date: string | null;
  status: TransportStatus;
  transport_details: string | null;
  charges: number | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateTransportInput {
  rentalId: string;
  leg: TransportLeg;
  pickupLocation?: string;
  destination?: string;
  plannedDate?: string;
  transportDetails?: string;
  charges?: number;
  notes?: string;
}

// undefined = unchanged, null = clear (see updateTransportRequestSchema).
export interface UpdateTransportInput {
  pickupLocation?: string | null;
  destination?: string | null;
  plannedDate?: string | null;
  actualDate?: string;
  status?: TransportStatus;
  transportDetails?: string | null;
  charges?: number | null;
  notes?: string | null;
}

export interface TransportRepositoryPort {
  create(input: CreateTransportInput): Promise<TransportRecord>;
  findById(id: string): Promise<TransportRecord | undefined>;
  findByRentalAndLeg(rentalId: string, leg: TransportLeg): Promise<TransportRecord | undefined>;
  listByRental(rentalId: string): Promise<TransportRecord[]>;
  // Standalone Transport screen — every transport record across the Rental
  // Company's own rentals, not one rental at a time. A single join, not a
  // loop over listByRental per rental.
  listByRentalCompanyOrganization(rentalCompanyOrganizationId: string): Promise<TransportRecord[]>;
  listTransportPage(
    rentalCompanyOrganizationId: string,
    query: ParsedListQuery<TransportListParams>,
  ): Promise<Page<TransportRecord>>;
  update(id: string, updates: UpdateTransportInput): Promise<TransportRecord>;
}
