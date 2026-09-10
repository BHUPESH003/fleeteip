import { CatalogueService } from "../modules/catalogue/application/catalogue-service.js";
import { ProductCategoryRepository } from "../modules/catalogue/infrastructure/product-category-repository.js";
import { ProductRepository } from "../modules/catalogue/infrastructure/product-repository.js";
import { ProductSubcategoryRepository } from "../modules/catalogue/infrastructure/product-subcategory-repository.js";
import { EquipmentService } from "../modules/equipment/application/equipment-service.js";
import { MachineRepository } from "../modules/equipment/infrastructure/machine-repository.js";
import { AuthService } from "../modules/identity/application/auth-service.js";
import { SessionRepository } from "../modules/identity/infrastructure/session-repository.js";
import { UserRepository } from "../modules/identity/infrastructure/user-repository.js";
import { RentalService } from "../modules/marketplace/rental/application/rental-service.js";
import { RentalRepository } from "../modules/marketplace/rental/infrastructure/rental-repository.js";
import { MembershipRepository } from "../modules/organizations/infrastructure/membership-repository.js";
import { OrganizationRepository } from "../modules/organizations/infrastructure/organization-repository.js";
import { PermissionService } from "../modules/permissions/application/permission-service.js";
import { RoleRepository } from "../modules/permissions/infrastructure/role-repository.js";
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

const permissionService = new PermissionService(
  membershipRepository,
  roleRepository,
  organizationRepository,
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

  catalogueService: new CatalogueService(
    productCategoryRepository,
    productSubcategoryRepository,
    productRepository,
  ),

  equipmentService: new EquipmentService(machineRepository, productRepository, permissionService),

  rentalService: new RentalService(
    rentalRepository,
    machineRepository,
    organizationRepository,
    permissionService,
  ),
};
