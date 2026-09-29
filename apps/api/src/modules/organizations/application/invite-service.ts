import type {
  AcceptInviteRequest,
  CreateInviteResponse,
  InvitePreview,
  OrganizationInvite,
  RoleName,
} from "@fleetip/contracts/organization";
import { InviteStatus, MembershipStatus } from "@fleetip/contracts/organization";
import { randomBytes } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors.js";
import type { AuthResult } from "../../identity/application/auth-service.js";
import { AuthService } from "../../identity/application/auth-service.js";
import { hashSessionToken } from "../../identity/domain/session-token.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { RoleRepositoryPort } from "../../permissions/domain/ports.js";
import type {
  InviteRepositoryPort,
  MembershipRepositoryPort,
  OrganizationInviteRecord,
} from "../domain/ports.js";

const INVITE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toInvite(
  record: Pick<OrganizationInviteRecord, "id" | "organization_id" | "status" | "expires_at" | "created_at">,
  roleName: RoleName,
): OrganizationInvite {
  const status = record.status as "pending" | "accepted" | "revoked";
  return {
    id: record.id,
    organizationId: record.organization_id,
    roleName,
    status,
    expired: status === InviteStatus.pending && new Date(record.expires_at) < new Date(),
    expiresAt: new Date(record.expires_at).toISOString(),
    createdAt: new Date(record.created_at).toISOString(),
  };
}

// ponytail: newest 100 only — pending ones are what matter and they're
// always the recent ones; add paging if an org ever mints more.
const INVITE_LIST_LIMIT = 100;

export interface AcceptInviteResult {
  authResult: AuthResult | null;
  organizationId: string;
  roleName: RoleName;
}

/**
 * A link-based route into an organization — replaces the old email-lookup
 * "invite" (OrganizationService.inviteMember), which created a membership
 * with status "invited" that nothing ever activated. No email is required
 * to create an invite; the owner shares the link however they like today
 * (copy/paste), with automated delivery a future addition on the same
 * token, not a different mechanism. See docs/decisions.md.
 */
export class InviteService {
  constructor(
    private readonly inviteRepository: InviteRepositoryPort,
    private readonly membershipRepository: MembershipRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly authService: AuthService,
    private readonly webOrigin: string,
  ) {}

  async createInvite(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<CreateInviteResponse> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");

    // A role is either this organization's own, or the built-in "owner" —
    // never another organization's role (same check OrganizationService
    // .updateMemberRole makes before moving a member onto a role).
    const role = await this.roleRepository.findById(roleId);
    if (!role || (role.organization_id !== null && role.organization_id !== organizationId)) {
      throw new NotFoundError("Role not found");
    }

    // Same shape as a session token (32 random bytes, sha256-hashed for
    // storage — hashSessionToken is generic, not session-specific) but its
    // own 7-day expiry, distinct from a login session's 30 days.
    const token = randomBytes(32).toString("base64url");
    const record = await this.inviteRepository.create({
      organizationId,
      roleId: role.id,
      tokenHash: hashSessionToken(token),
      invitedByUserId: userId,
      expiresAt: new Date(Date.now() + INVITE_DURATION_MS),
    });

    return {
      invite: toInvite(record, role.name),
      token,
      link: `${this.webOrigin}/invite/${token}`,
    };
  }

  async listInvites(userId: string, organizationId: string): Promise<OrganizationInvite[]> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    const rows = await this.inviteRepository.listByOrganization(organizationId, INVITE_LIST_LIMIT);
    return rows.map((row) => toInvite(row, row.role_name));
  }

  // Only a pending invite can be revoked. An invite of another organization
  // is a 404 (never a 403) so its existence isn't leaked. accept() already
  // refuses any non-pending invite, so a revoked link stops working at once.
  async revokeInvite(
    userId: string,
    organizationId: string,
    inviteId: string,
  ): Promise<OrganizationInvite> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");
    const invite = await this.inviteRepository.findByIdInOrganization(inviteId, organizationId);
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.status !== InviteStatus.pending) {
      throw new ConflictError(`This invite has already been ${invite.status}`);
    }
    const revoked = await this.inviteRepository.markRevoked(invite.id);
    // Lost a race with accept() between the read and the guarded update.
    if (!revoked) throw new ConflictError("This invite is no longer pending");
    return toInvite(revoked, invite.role_name);
  }

  async getPreview(token: string): Promise<InvitePreview> {
    const row = await this.inviteRepository.findWithContextByTokenHash(hashSessionToken(token));
    if (!row) throw new NotFoundError("Invite not found");
    return {
      organizationName: row.organization_name,
      organizationTypeCode: row.organization_type_code as "rental_company" | "renter",
      roleName: row.role_name as RoleName,
      status: row.status as "pending" | "accepted" | "revoked",
      expired: row.status === InviteStatus.pending && new Date(row.expires_at) < new Date(),
    };
  }

  // The one real "accept" step the old flow never had. Called either with
  // an existing (already logged-in) user id, or a newAccount payload to
  // create one on the spot — never both, never neither (enforced by the
  // route, which decides based on the caller's own session cookie).
  async accept(
    token: string,
    params: { existingUserId?: string; newAccount?: AcceptInviteRequest },
  ): Promise<AcceptInviteResult> {
    const tokenHash = hashSessionToken(token);
    const context = await this.inviteRepository.findWithContextByTokenHash(tokenHash);
    if (!context) throw new NotFoundError("Invite not found");
    if (context.status !== InviteStatus.pending) {
      throw new ConflictError(`This invite has already been ${context.status}`);
    }
    if (new Date(context.expires_at) < new Date()) {
      throw new ConflictError("This invite has expired");
    }

    let userId: string;
    let authResult: AuthResult | null = null;
    if (params.existingUserId) {
      userId = params.existingUserId;
    } else {
      if (
        !params.newAccount?.email ||
        !params.newAccount.password ||
        !params.newAccount.displayName
      ) {
        throw new ValidationError("email, password, and displayName are required to accept this invite");
      }
      authResult = await this.authService.createAccountAndSession({
        email: params.newAccount.email,
        password: params.newAccount.password,
        displayName: params.newAccount.displayName,
      });
      userId = authResult.user.id;
    }

    const existingMembership = await this.membershipRepository.findActiveMembership(
      userId,
      context.organization_id,
    );
    if (existingMembership) {
      throw new ConflictError("You are already a member of this organization");
    }

    await this.membershipRepository.create({
      userId,
      organizationId: context.organization_id,
      roleId: context.role_id,
      status: MembershipStatus.active,
    });
    await this.inviteRepository.markAccepted(context.id, userId);

    return {
      authResult,
      organizationId: context.organization_id,
      roleName: context.role_name as RoleName,
    };
  }
}
