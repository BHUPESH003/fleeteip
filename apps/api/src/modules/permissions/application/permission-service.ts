import {
  OrganizationTypeCode,
  PERMISSION_ORGANIZATION_TYPES,
  type PermissionCode,
} from "@fleetip/contracts/organization";
import { ForbiddenError } from "../../../shared/errors.js";
import type {
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../../organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../domain/ports.js";

/**
 * The single place that answers "may this user do X in this organization?".
 * Every route that touches organization-scoped data must go through this,
 * never re-derive authorization from a client-supplied organization id alone.
 */
export class PermissionService {
  constructor(
    private readonly membershipRepository: MembershipRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
  ) {}
  async hasPermission(
    userId: string,
    organizationId: string,
    permission: PermissionCode,
  ): Promise<boolean> {
    const membership = await this.membershipRepository.findActiveMembership(userId, organizationId);
    if (!membership) return false;

    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) return false;
    // A suspended organization (Platform Admin action) loses every
    // permission immediately — this is the single choke point every
    // organization-scoped request already passes through, so no other
    // enforcement point is needed.
    if (organization.status === "suspended") return false;
    if (
      !PERMISSION_ORGANIZATION_TYPES[permission].includes(
        organization.organization_type_code as OrganizationTypeCode,
      )
    ) {
      return false;
    }
    return this.roleRepository.hasPermission(membership.role_id, permission);
  }

  async requirePermission(
    userId: string,
    organizationId: string,
    permission: PermissionCode,
  ): Promise<void> {
    if (!(await this.hasPermission(userId, organizationId, permission))) {
      throw new ForbiddenError();
    }
  }
}
