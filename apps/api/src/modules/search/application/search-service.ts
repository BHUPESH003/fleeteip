import type { SearchResult } from "@fleetip/contracts/search";
import type { MachineRepositoryPort } from "../../equipment/domain/ports.js";
import type { CommercialQuotationRepositoryPort } from "../../marketplace/commercial-quotation/domain/ports.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import type { RequirementRepositoryPort } from "../../marketplace/rfq/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../organizations/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";

/**
 * Cross-resource global search for the header search box — organization-
 * scoped, never another organization's data. Each resource is searched only
 * through the exact same permission/ownership rule its own domain already
 * enforces (equipment.manage for machines, rfq.manage for requirements,
 * quotation.manage/.respond for quotations, rental.manage/.respond for
 * rentals) — this service invents no new authorization shape, it only
 * fans a query out to existing repository methods and runs them in
 * parallel. Adding a fifth searchable resource later means one more
 * `hasPermission` branch + repository search() method, not a rewrite or a
 * dedicated search index — PostgreSQL ILIKE is sufficient at this app's
 * scale (see docs/frontend-backend-gap-report.md).
 */
export class SearchService {
  constructor(
    private readonly machineRepository: MachineRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly quotationRepository: CommercialQuotationRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async search(userId: string, organizationId: string, query: string): Promise<SearchResult[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) return [];

    const [canManageEquipment, canManageRfq, canManageQuotation, canRespondQuotation,
      canManageRental, canRespondRental] = await Promise.all([
      this.permissionService.hasPermission(userId, organizationId, "equipment.manage"),
      this.permissionService.hasPermission(userId, organizationId, "rfq.manage"),
      this.permissionService.hasPermission(userId, organizationId, "quotation.manage"),
      this.permissionService.hasPermission(userId, organizationId, "quotation.respond"),
      this.permissionService.hasPermission(userId, organizationId, "rental.manage"),
      this.permissionService.hasPermission(userId, organizationId, "rental.respond"),
    ]);

    const [machines, requirements, quotations, rentals] = await Promise.all([
      canManageEquipment ? this.machineRepository.search(organizationId, query) : [],
      canManageRfq ? this.requirementRepository.search(organizationId, query) : [],
      canManageQuotation
        ? this.quotationRepository.searchByRentalCompany(organizationId, query)
        : canRespondQuotation
          ? this.quotationRepository.searchByRenter(organizationId, query)
          : [],
      canManageRental
        ? this.rentalRepository.searchByOrganization(organizationId, query)
        : canRespondRental
          ? this.rentalRepository.searchByRenterOrganization(organizationId, query)
          : [],
    ]);

    return [
      ...machines.map(
        (m): SearchResult => ({
          type: "machine",
          id: m.id,
          title: m.asset_code,
          subtitle: m.registration_number,
        }),
      ),
      ...requirements.map(
        (r): SearchResult => ({
          type: "requirement",
          id: r.id,
          title: r.project_name ?? "Untitled requirement",
          subtitle: r.requested_start_date,
        }),
      ),
      ...quotations.map(
        (q): SearchResult => ({
          type: "quotation",
          id: q.id,
          title: q.reference_number,
          subtitle: q.client_snapshot?.name ?? null,
        }),
      ),
      ...rentals.map(
        (r): SearchResult => ({
          type: "rental",
          id: r.id,
          title: r.project_name ?? "Untitled rental",
          subtitle: r.client_snapshot?.name ?? null,
        }),
      ),
    ];
  }
}
