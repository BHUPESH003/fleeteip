import type { PermissionCode } from "@fleetip/contracts/organization";
import { ForbiddenError } from "../../../shared/errors.js";
import type { MembershipRepositoryPort } from "../../organizations/domain/ports.js";
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
  ) {}

  async hasPermission(
    userId: string,
    organizationId: string,
    permission: PermissionCode,
  ): Promise<boolean> {
    const membership = await this.membershipRepository.findActiveMembership(userId, organizationId);
    if (!membership) return false;
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
