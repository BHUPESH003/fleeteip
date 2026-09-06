import { AuthService } from "../modules/identity/application/auth-service.js";
import { SessionRepository } from "../modules/identity/infrastructure/session-repository.js";
import { UserRepository } from "../modules/identity/infrastructure/user-repository.js";
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

export const container = {
  authService: new AuthService(
    userRepository,
    sessionRepository,
    organizationRepository,
    membershipRepository,
    roleRepository,
  ),
  permissionService: new PermissionService(membershipRepository, roleRepository),
};
