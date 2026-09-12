import { CatalogueService } from "../modules/catalogue/application/catalogue-service.js";
import { ProductCategoryRepository } from "../modules/catalogue/infrastructure/product-category-repository.js";
import { ProductRepository } from "../modules/catalogue/infrastructure/product-repository.js";
import { ProductSubcategoryRepository } from "../modules/catalogue/infrastructure/product-subcategory-repository.js";
import { EquipmentService } from "../modules/equipment/application/equipment-service.js";
import { MachineRepository } from "../modules/equipment/infrastructure/machine-repository.js";
import { AuthService } from "../modules/identity/application/auth-service.js";
import { SessionRepository } from "../modules/identity/infrastructure/session-repository.js";
import { UserRepository } from "../modules/identity/infrastructure/user-repository.js";
import { AuctionService } from "../modules/marketplace/auction/application/auction-service.js";
import { AuctionRepository } from "../modules/marketplace/auction/infrastructure/auction-repository.js";
import { CommercialQuotationService } from "../modules/marketplace/commercial-quotation/application/commercial-quotation-service.js";
import { CommercialQuotationRepository } from "../modules/marketplace/commercial-quotation/infrastructure/commercial-quotation-repository.js";
import { QuotationOfferRepository } from "../modules/marketplace/commercial-quotation/infrastructure/quotation-offer-repository.js";
import { QuotationResponseService } from "../modules/marketplace/quotation-response/application/quotation-response-service.js";
import { QuotationResponseRepository } from "../modules/marketplace/quotation-response/infrastructure/quotation-response-repository.js";
import { RentalService } from "../modules/marketplace/rental/application/rental-service.js";
import { RentalRepository } from "../modules/marketplace/rental/infrastructure/rental-repository.js";
import { RequirementService } from "../modules/marketplace/rfq/application/requirement-service.js";
import { RequirementRepository } from "../modules/marketplace/rfq/infrastructure/requirement-repository.js";
import { MaintenanceService } from "../modules/maintenance/application/maintenance-service.js";
import { MaintenanceRepository } from "../modules/maintenance/infrastructure/maintenance-repository.js";
import { OrganizationService } from "../modules/organizations/application/organization-service.js";
import { MembershipRepository } from "../modules/organizations/infrastructure/membership-repository.js";
import { OrganizationRepository } from "../modules/organizations/infrastructure/organization-repository.js";
import { PermissionService } from "../modules/permissions/application/permission-service.js";
import { RoleRepository } from "../modules/permissions/infrastructure/role-repository.js";
import { TransportService } from "../modules/transport/application/transport-service.js";
import { TransportRepository } from "../modules/transport/infrastructure/transport-repository.js";
import { LogsheetService } from "../modules/logsheet/application/logsheet-service.js";
import { UtilizationService } from "../modules/logsheet/application/utilization-service.js";
import { LogsheetRepository } from "../modules/logsheet/infrastructure/logsheet-repository.js";
import { BillingService } from "../modules/billing/application/billing-service.js";
import { InvoiceRepository } from "../modules/billing/infrastructure/invoice-repository.js";
import { NotificationService } from "../modules/notification/application/notification-service.js";
import { NotificationRepository } from "../modules/notification/infrastructure/notification-repository.js";
import { SearchService } from "../modules/search/application/search-service.js";
import { db } from "./database/client.js";

/**
 * Composition root: wires repositories (infrastructure) into application
 * services once, at startup. Routes depend only on the services below —
 * never construct a repository or touch `db` directly from a route.
 */
const userRepository = new UserRepository(db);
const sessionRepository = new SessionRepository(db);
const organizationRepository = new OrganizationRepository(db);
const membershipRepository = new MembershipRepository(db);
const roleRepository = new RoleRepository(db);

const productCategoryRepository = new ProductCategoryRepository(db);
const productSubcategoryRepository = new ProductSubcategoryRepository(db);
const productRepository = new ProductRepository(db);
const machineRepository = new MachineRepository(db);
const rentalRepository = new RentalRepository(db);
const requirementRepository = new RequirementRepository(db);
const auctionRepository = new AuctionRepository(db);
const quotationResponseRepository = new QuotationResponseRepository(db);
const commercialQuotationRepository = new CommercialQuotationRepository(db);
const quotationOfferRepository = new QuotationOfferRepository(db);
const maintenanceRepository = new MaintenanceRepository(db);
const transportRepository = new TransportRepository(db);
const logsheetRepository = new LogsheetRepository(db);
const invoiceRepository = new InvoiceRepository(db);
const notificationRepository = new NotificationRepository(db);

const permissionService = new PermissionService(
  membershipRepository,
  roleRepository,
  organizationRepository,
);

const notificationService = new NotificationService(notificationRepository, permissionService);

const rentalService = new RentalService(
  rentalRepository,
  machineRepository,
  organizationRepository,
  permissionService,
  maintenanceRepository,
);

export const container = {
  authService: new AuthService(
    userRepository,
    sessionRepository,
    organizationRepository,
    membershipRepository,
    roleRepository,
  ),
  permissionService,

  organizationService: new OrganizationService(
    organizationRepository,
    membershipRepository,
    roleRepository,
    userRepository,
    permissionService,
  ),

  catalogueService: new CatalogueService(
    productCategoryRepository,
    productSubcategoryRepository,
    productRepository,
    permissionService,
  ),

  equipmentService: new EquipmentService(machineRepository, productRepository, permissionService),

  rentalService,

  requirementService: new RequirementService(
    requirementRepository,
    productSubcategoryRepository,
    permissionService,
  ),

  auctionService: new AuctionService(
    auctionRepository,
    requirementRepository,
    permissionService,
    organizationRepository,
    notificationService,
  ),

  quotationResponseService: new QuotationResponseService(
    quotationResponseRepository,
    requirementRepository,
    permissionService,
    notificationService,
  ),

  commercialQuotationService: new CommercialQuotationService(
    commercialQuotationRepository,
    quotationOfferRepository,
    machineRepository,
    productRepository,
    organizationRepository,
    requirementRepository,
    quotationResponseRepository,
    auctionRepository,
    rentalService,
    permissionService,
    notificationService,
  ),

  maintenanceService: new MaintenanceService(
    maintenanceRepository,
    machineRepository,
    rentalRepository,
    permissionService,
  ),

  transportService: new TransportService(
    transportRepository,
    rentalRepository,
    organizationRepository,
    permissionService,
  ),

  logsheetService: new LogsheetService(
    logsheetRepository,
    rentalRepository,
    organizationRepository,
    permissionService,
  ),

  utilizationService: new UtilizationService(
    logsheetRepository,
    rentalRepository,
    machineRepository,
    organizationRepository,
    permissionService,
  ),

  billingService: new BillingService(invoiceRepository, rentalRepository, permissionService),

  notificationService,

  searchService: new SearchService(
    machineRepository,
    requirementRepository,
    commercialQuotationRepository,
    rentalRepository,
    organizationRepository,
    permissionService,
  ),
};
