import type {
  AcceptInviteRequest,
  CreateInviteResponse,
  InvitePreview,
  OrganizationInvite,
  RoleName,
} from "@fleetip/contracts/organization";
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

function toInvite(record: OrganizationInviteRecord, roleName: RoleName): OrganizationInvite {
  return {
    id: record.id,
    organizationId: record.organization_id,
    roleName,
    status: record.status as "pending" | "accepted" | "revoked",
    expiresAt: new Date(record.expires_at).toISOString(),
    createdAt: new Date(record.created_at).toISOString(),
  };
}

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
    roleName: RoleName,
  ): Promise<CreateInviteResponse> {
    await this.permissionService.requirePermission(userId, organizationId, "membership.manage");

    const role = await this.roleRepository.findByName(roleName);
    if (!role) throw new NotFoundError("Role not found");

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
      invite: toInvite(record, roleName),
      token,
      link: `${this.webOrigin}/invite/${token}`,
    };
  }

  async getPreview(token: string): Promise<InvitePreview> {
    const row = await this.inviteRepository.findWithContextByTokenHash(hashSessionToken(token));
    if (!row) throw new NotFoundError("Invite not found");
    return {
      organizationName: row.organization_name,
      organizationTypeCode: row.organization_type_code as "rental_company" | "renter",
      roleName: row.role_name as RoleName,
      status: row.status as "pending" | "accepted" | "revoked",
      expired: row.status === "pending" && new Date(row.expires_at) < new Date(),
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
    if (context.status !== "pending") {
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
      status: "active",
    });
    await this.inviteRepository.markAccepted(context.id, userId);

    return {
      authResult,
      organizationId: context.organization_id,
      roleName: context.role_name as RoleName,
    };
  }
}
