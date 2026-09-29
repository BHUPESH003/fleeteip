import { AuctionStatus, ParticipantStatus } from "@fleetip/contracts/auction";
import { InvoiceStatus } from "@fleetip/contracts/billing";
import { MachineStatus } from "@fleetip/contracts/equipment";
import { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import { InviteStatus, MembershipStatus } from "@fleetip/contracts/organization";
import { ProjectStatus } from "@fleetip/contracts/project";
import { AlternateDateStatus, CommercialQuotationStatus, QuotationOfferStatus, QuotationResponseStatus } from "@fleetip/contracts/quotation";
import { ActualDatesVerificationStatus, RentalStatus } from "@fleetip/contracts/rental";
import { RequirementStatus } from "@fleetip/contracts/rfq";
import { TransportStatus } from "@fleetip/contracts/transport";
import { WorkOrderStatus } from "@fleetip/contracts/work-order";
import { describe, expect, it } from "vitest";
import { STATUS_MAPS, type StatusDomain } from "../lib/status";

// Runtime twin of the `satisfies Record<Enum, Entry>` checks: every contract value has a chip, and nothing extra.
const CONTRACT_ENUMS: Partial<Record<StatusDomain, Record<string, string>>> = {
  machine: MachineStatus,
  rental: RentalStatus,
  maintenance: MaintenanceStatus,
  invoice: InvoiceStatus,
  transport: TransportStatus,
  work_order: WorkOrderStatus,
  actual_dates: ActualDatesVerificationStatus,
  requirement: RequirementStatus,
  quotation: CommercialQuotationStatus,
  quotation_response: QuotationResponseStatus,
  offer: QuotationOfferStatus,
  alternate_dates: AlternateDateStatus,
  auction: AuctionStatus,
  participant: ParticipantStatus,
  project: ProjectStatus,
  membership: MembershipStatus,
  invite: InviteStatus,
};

describe("STATUS_MAPS", () => {
  for (const [domain, values] of Object.entries(CONTRACT_ENUMS)) {
    it(`covers every ${domain} value with a label and tone`, () => {
      const map = STATUS_MAPS[domain as StatusDomain] as Record<string, { label: string; tone: string }>;
      expect(Object.keys(map).sort()).toEqual(Object.values(values).sort());
      for (const entry of Object.values(map)) {
        expect(entry.label.trim()).not.toBe("");
        expect(entry.tone).toBeTruthy();
      }
    });
  }
});
