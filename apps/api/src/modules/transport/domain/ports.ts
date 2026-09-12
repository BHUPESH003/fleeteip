import type { TransportLeg, TransportStatus } from "@fleetip/contracts/transport";

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

export interface UpdateTransportInput {
  pickupLocation?: string;
  destination?: string;
  plannedDate?: string;
  actualDate?: string;
  status?: TransportStatus;
  transportDetails?: string;
  charges?: number;
  notes?: string;
}

export interface TransportRepositoryPort {
  create(input: CreateTransportInput): Promise<TransportRecord>;
  findByRentalAndLeg(rentalId: string, leg: TransportLeg): Promise<TransportRecord | undefined>;
  listByRental(rentalId: string): Promise<TransportRecord[]>;
  // Standalone Transport screen — every transport record across the Rental
  // Company's own rentals, not one rental at a time. A single join, not a
  // loop over listByRental per rental.
  listByRentalCompanyOrganization(rentalCompanyOrganizationId: string): Promise<TransportRecord[]>;
  update(id: string, updates: UpdateTransportInput): Promise<TransportRecord>;
}
