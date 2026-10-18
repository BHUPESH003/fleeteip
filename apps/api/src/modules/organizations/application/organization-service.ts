import type {
  CreateRoleRequest,
  Organization,
  OrganizationMember,
  OrganizationProfile,
  OrganizationTypeCode,
  PermissionCode,
  RoleWithPermissions,
  UpdateOrganizationProfileRequest,
  UpdateOrganizationRequest,
  UpdateRoleRequest,
} from "@fleetip/contracts/organization";
import { PERMISSION_ORGANIZATION_TYPES, MembershipStatus } from "@fleetip/contracts/organization";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { RoleRecord, RoleRepositoryPort } from "../../permissions/domain/ports.js";
import type {
  MembershipRepositoryPort,
  OrganizationContactRecord,
  OrganizationMemberRow,
  OrganizationProfileRecord,
  OrganizationProfileRepositoryPort,
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
    roleId: row.role_id,
    roleName: row.role_name,
    status: row.status as "active" | "invited" | "suspended",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toProfile(
  organizationId: string,
  record: OrganizationProfileRecord | undefined,
  contacts: OrganizationContactRecord[],
): OrganizationProfile {
  return {
    organizationId,
    addressLine1: record?.address_line1 ?? null,
    addressLine2: record?.address_line2 ?? null,
    city: record?.city ?? null,
    state: record?.state ?? null,
    postalCode: record?.postal_code ?? null,
    country: record?.country ?? null,
    gstNumber: record?.gst_number ?? null,
    panNumber: record?.pan_number ?? null,
    bankName: record?.bank_name ?? null,
    bankAccountName: record?.bank_account_name ?? null,
    bankAccountNumber: record?.bank_account_number ?? null,
    bankIfsc: record?.bank_ifsc ?? null,
    bankBranch: record?.bank_branch ?? null,
    website: record?.website ?? null,
    logoUrl: record?.logo_url ?? null,
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      designation: contact.designation,
      phone: contact.phone,
      email: contact.email,
    })),
  };
}

// Trims an optional free-text field to a stored value: "" / undefined -> null.
const text = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function toRoleWithPermissions(role: RoleRecord, permissions: PermissionCode[]): RoleWithPermissions {
  return {
    id: role.id,
    roleName: role.name,
    isBuiltin: role.organization_id === null,
    permissions,
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
    private readonly organizationRepository: OrganizationRepositoryPort &
      OrganizationProfileRepositoryPort,
    private readonly membershipRepository: MembershipRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async getOrganization(userId: string, organizationId: string): Promise<Organization> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const record = await this.organizationRepository.findWithTypeById(organizationId);
    if (!record) throw new NotFoundError("Organization not found");
    return toOrganization(record);
  }

  // Only `name` — the request schema is .strict(), and the repository
  // method can't write anything else. Type/code/status stay platform-owned.
  async updateOrganization(
    userId: string,
    organizationId: string,
    request: UpdateOrganizationRequest,
  ): Promise<Organization> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const existing = await this.organizationRepository.findWithTypeById(organizationId);
    if (!existing) throw new NotFoundError("Organization not found");
    const updated = await this.organizationRepository.updateName(organizationId, request.name);
    return toOrganization({ ...existing, name: updated.name });
  }

  // --- Company details (0040): address, GST, bank, logo, website, contacts.
  // Readable by any member (organization.manage not required to view your own
  // company's details — same low bar as seeing the org name); editable with
  // organization.manage. ---

  async getOrganizationProfile(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationProfile> {
    // Reading company details is limited to members who can reach Settings
    // (membership.manage); editing needs organization.manage.
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    const existing = await this.organizationRepository.findWithTypeById(organizationId);
    if (!existing) throw new NotFoundError("Organization not found");
    const [profile, contacts] = await Promise.all([
      this.organizationRepository.findProfile(organizationId),
      this.organizationRepository.listContacts(organizationId),
    ]);
    return toProfile(organizationId, profile, contacts);
  }

  async updateOrganizationProfile(
    userId: string,
    organizationId: string,
    request: UpdateOrganizationProfileRequest,
  ): Promise<OrganizationProfile> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const existing = await this.organizationRepository.findWithTypeById(organizationId);
    if (!existing) throw new NotFoundError("Organization not found");

    await this.organizationRepository.saveProfile(
      organizationId,
      {
        address_line1: text(request.addressLine1),
        address_line2: text(request.addressLine2),
        city: text(request.city),
        state: text(request.state),
        postal_code: text(request.postalCode),
        country: text(request.country),
        gst_number: text(request.gstNumber),
        pan_number: text(request.panNumber),
        bank_name: text(request.bankName),
        bank_account_name: text(request.bankAccountName),
        bank_account_number: text(request.bankAccountNumber),
        bank_ifsc: text(request.bankIfsc),
        bank_branch: text(request.bankBranch),
        website: text(request.website),
        logo_url: text(request.logoUrl),
      },
      // Only replace the contacts list when the caller actually sent one.
      request.contacts
        ? request.contacts.map((contact) => ({
            name: contact.name.trim(),
            designation: text(contact.designation),
            phone: text(contact.phone),
            email: text(contact.email),
          }))
        : null,
    );

    const [profile, contacts] = await Promise.all([
      this.organizationRepository.findProfile(organizationId),
      this.organizationRepository.listContacts(organizationId),
    ]);
    return toProfile(organizationId, profile, contacts);
  }

  async listMembers(userId: string, organizationId: string): Promise<OrganizationMember[]> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    const rows = await this.membershipRepository.listByOrganization(organizationId);
    return rows.map(toMember);
  }

  // Moves an existing member to a different role of this same organization
  // (including its built-in "owner" role — this is how a member is promoted
  // to full access, or an owner demoted). Refuses to leave an organization
  // with zero active owners, since nothing could ever manage it again.
  async updateMemberRole(
    callerId: string,
    organizationId: string,
    membershipId: string,
    roleId: string,
  ): Promise<OrganizationMember> {
    await this.permissionService.requirePermission(callerId, organizationId, "membership.manage");

    const role = await this.validateRoleForOrganization(organizationId, roleId);
    const members = await this.membershipRepository.listByOrganization(organizationId);
    const target = members.find((member) => member.id === membershipId);
    if (!target) throw new NotFoundError("Member not found");

    if (target.role_id !== roleId) {
      const ownerRole = await this.roleRepository.findByName("owner");
      const isLeavingOwner = ownerRole?.id === target.role_id && roleId !== ownerRole.id;
      if (isLeavingOwner) {
        const remainingOwners = members.filter(
          (member) =>
            member.id !== membershipId && member.role_id === ownerRole!.id && member.status === MembershipStatus.active,
        );
        if (remainingOwners.length === 0) {
          throw new ConflictError("An organization must always have at least one owner");
        }
      }
    }

    const updated = await this.membershipRepository.updateRole(membershipId, roleId);
    return toMember({ ...target, role_id: updated.role_id, role_name: role.name });
  }

  // Roles are per-organization: the one built-in "owner" role, plus this
  // organization's own "member" role and any further custom roles it has
  // created — see roleWithPermissionsSchema.isBuiltin.
  async listRolesAndPermissions(
    userId: string,
    organizationId: string,
  ): Promise<RoleWithPermissions[]> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    return this.loadRolesWithPermissions(organizationId);
  }

  // Same role list, but gated by membership.manage instead of
  // organization.manage. Moving a member to a role (and inviting into one)
  // needs membership.manage, but *picking* the target role needs to see the
  // role list — previously only exposed under organization.manage, so a
  // membership.manage-only admin could never actually change a role or
  // invite. This closes that gap: anyone allowed to manage memberships can
  // read the roles they're allowed to assign. Returns full permissions so
  // the change-role UI can still show the access each role grants.
  async listAssignableRoles(
    userId: string,
    organizationId: string,
  ): Promise<RoleWithPermissions[]> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    return this.loadRolesWithPermissions(organizationId);
  }

  private async loadRolesWithPermissions(organizationId: string): Promise<RoleWithPermissions[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");

    const roles = await this.roleRepository.listForOrganization(organizationId);
    return Promise.all(
      roles.map(async (role) => {
        const codes = (await this.roleRepository.listPermissionCodesByRoleId(
          role.id,
        )) as PermissionCode[];
        const permissions = this.filterToOrganizationType(codes, organization.organization_type_code);
        return toRoleWithPermissions(role, permissions);
      }),
    );
  }

  async createRole(
    userId: string,
    organizationId: string,
    request: CreateRoleRequest,
  ): Promise<RoleWithPermissions> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");

    const permissions = this.validatePermissionCodes(
      request.permissions,
      organization.organization_type_code,
    );
    const role = await this.roleRepository.create({
      organizationId,
      name: request.name,
      permissionCodes: permissions,
    });
    return toRoleWithPermissions(role, permissions);
  }

  async updateRole(
    userId: string,
    organizationId: string,
    roleId: string,
    request: UpdateRoleRequest,
  ): Promise<RoleWithPermissions> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found");

    const existing = await this.validateRoleForOrganization(organizationId, roleId);
    if (existing.organization_id === null) {
      throw new ValidationError("The built-in owner role can't be edited");
    }

    const permissions = this.validatePermissionCodes(
      request.permissions,
      organization.organization_type_code,
    );
    const role = await this.roleRepository.update(roleId, {
      name: request.name,
      permissionCodes: permissions,
    });
    return toRoleWithPermissions(role, permissions);
  }

  async deleteRole(userId: string, organizationId: string, roleId: string): Promise<void> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const existing = await this.validateRoleForOrganization(organizationId, roleId);
    if (existing.organization_id === null) {
      throw new ValidationError("The built-in owner role can't be deleted");
    }
    await this.roleRepository.delete(roleId);
  }

  private async validateRoleForOrganization(organizationId: string, roleId: string): Promise<RoleRecord> {
    const role = await this.roleRepository.findById(roleId);
    if (!role || (role.organization_id !== null && role.organization_id !== organizationId)) {
      throw new NotFoundError("Role not found");
    }
    return role;
  }

  // A permission code is only ever real for the organization types it
  // applies to (PERMISSION_ORGANIZATION_TYPES) — same invariant
  // PermissionService.hasPermission enforces at request time. Rejecting an
  // inapplicable code at role-creation time (rather than silently granting
  // a permission that can never fire) keeps a role's shown permission list
  // honest.
  private validatePermissionCodes(
    codes: PermissionCode[],
    organizationTypeCode: string,
  ): PermissionCode[] {
    const orgType = organizationTypeCode as OrganizationTypeCode;
    const invalid = codes.filter((code) => !PERMISSION_ORGANIZATION_TYPES[code].includes(orgType));
    if (invalid.length > 0) {
      throw new ValidationError(
        `These permissions don't apply to this organization type: ${invalid.join(", ")}`,
      );
    }
    return codes;
  }

  private filterToOrganizationType(
    codes: PermissionCode[],
    organizationTypeCode: string,
  ): PermissionCode[] {
    const orgType = organizationTypeCode as OrganizationTypeCode;
    return codes.filter((code) => PERMISSION_ORGANIZATION_TYPES[code].includes(orgType));
  }
}
