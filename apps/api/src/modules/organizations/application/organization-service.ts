import type {
  InviteMemberRequest,
  Organization,
  OrganizationMember,
  PermissionCode,
  RoleWithPermissions,
} from "@fleetip/contracts/organization";
import { PERMISSION_ORGANIZATION_TYPES, roleNameSchema } from "@fleetip/contracts/organization";
import type { UserRepositoryPort } from "../../identity/domain/ports.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { RoleRepositoryPort } from "../../permissions/domain/ports.js";
import type {
  MembershipRepositoryPort,
  OrganizationMemberRow,
  OrganizationRepositoryPort,
  OrganizationWithTypeRecord,
} from "../domain/ports.js";

function toOrganization(record: OrganizationWithTypeRecord): Organization {
  return {
    id: record.id,
    organizationTypeCode: record.organization_type_code as "rental_company" | "renter",
    name: record.name,
    code: record.code,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toMember(row: OrganizationMemberRow): OrganizationMember {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleName: row.role_name as "owner" | "member",
    status: row.status as "active" | "invited" | "suspended",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Tenant organization administration — a member managing THEIR OWN
 * organization's profile/members/roles. Explicitly not platform
 * administration: there is no cross-tenant query here, every method is
 * scoped to the caller's own organizationId via requirePermission, same as
 * every other module. See docs/platform-admin-architecture-requirements.md
 * for why a real platform-admin tier is out of scope for this pass.
 */
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly membershipRepository: MembershipRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly userRepository: UserRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async getOrganization(userId: string, organizationId: string): Promise<Organization> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const record = await this.organizationRepository.findWithTypeById(organizationId);
    if (!record) throw new NotFoundError("Organization not found");
    return toOrganization(record);
  }

  async listMembers(userId: string, organizationId: string): Promise<OrganizationMember[]> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    const rows = await this.membershipRepository.listByOrganization(organizationId);
    return rows.map(toMember);
  }

  // The invited user must already hold a FleetIP account — there is no
  // email-sending infrastructure in this codebase to invite someone who
  // doesn't (see inviteMemberRequestSchema's comment). Creates the
  // membership with status "invited"; there is no separate accept-invite
  // step yet (also a documented limitation, not silently faked).
  async inviteMember(
    userId: string,
    organizationId: string,
    input: InviteMemberRequest,
  ): Promise<OrganizationMember> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");

    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new NotFoundError(
        "No FleetIP account exists for this email — they must sign up first",
      );
    }
    const existing = await this.membershipRepository.findActiveMembership(
      user.id,
      organizationId,
    );
    if (existing) {
      throw new ConflictError("This user is already a member of this organization");
    }
    const role = await this.roleRepository.findByName(input.roleName);
    if (!role) throw new NotFoundError("Role not found");

    const membership = await this.membershipRepository.create({
      userId: user.id,
      organizationId,
      roleId: role.id,
      status: "invited",
    });
    return toMember({
      id: membership.id,
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      role_name: input.roleName,
      status: membership.status,
      created_at: membership.created_at,
    });
  }

  // Roles are a small, fixed set (owner/member — see roleNameSchema); this
  // reports each role's real, currently-seeded permission set, filtered to
  // the ones that apply to the caller's own organization type, mirroring
  // AuthService.getAuthenticatedSession's PERMISSION_ORGANIZATION_TYPES filter.
  async listRolesAndPermissions(
    userId: string,
    organizationId: string,
  ): Promise<RoleWithPermissions[]> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");

    return Promise.all(
      roleNameSchema.options.map(async (roleName): Promise<RoleWithPermissions> => {
        const role = await this.roleRepository.findByName(roleName);
        const codes = role
          ? ((await this.roleRepository.listPermissionCodesByRoleId(role.id)) as PermissionCode[])
          : [];
        // Same filter as AuthService.getAuthenticatedSession — a role's
        // granted code is only ever real for the organization types it
        // applies to.
        const permissions = codes.filter((code) =>
          PERMISSION_ORGANIZATION_TYPES[code].includes(
            organization.organization_type_code as "rental_company" | "renter",
          ),
        );
        return { roleName, permissions };
      }),
    );
  }
}
