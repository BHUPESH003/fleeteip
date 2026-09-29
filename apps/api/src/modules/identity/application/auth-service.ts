import type {
  AuthenticatedSession,
  ChangePasswordRequest,
  LoginRequest,
  SessionListResponse,
  SignupRequest,
  User,
} from "@fleetip/contracts/identity";
import {
  PERMISSION_ORGANIZATION_TYPES,
  type MembershipWithOrganization,
  type OrganizationTypeCode,
  type PermissionCode,
} from "@fleetip/contracts/organization";
import { MembershipStatus } from "@fleetip/contracts/organization";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/errors.js";
import { generateOrganizationCode } from "../../organizations/application/generate-organization-code.js";
import type {
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../../organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../../permissions/domain/ports.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../domain/password.js";
import type {
  PublicUserRecord,
  SessionRepositoryPort,
  UserRepositoryPort,
} from "../domain/ports.js";
import { generateSessionToken, hashSessionToken } from "../domain/session-token.js";

/** How often an in-use session's last_seen_at is written — a list hint, not an audit log. */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 500;

/** Where a session was started from; recorded for the Settings > Security list. */
export interface SessionMeta {
  userAgent?: string;
}

export interface CurrentSession {
  sessionId: string;
  userId: string;
}

export interface AuthResult {
  user: User;
  token: string;
  expiresAt: Date;
}

function toContractUser(row: PublicUserRecord): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly membershipRepository: MembershipRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
  ) {}

  async signup(request: SignupRequest, meta: SessionMeta = {}): Promise<AuthResult> {
    const organizationType = await this.organizationRepository.findTypeByCode(
      request.organizationTypeCode,
    );
    if (!organizationType) throw new ValidationError("Unknown organization type");

    const ownerRole = await this.roleRepository.findByName("owner");
    if (!ownerRole) throw new Error("Reference data missing: 'owner' role is not seeded");

    const user = await this.createAccount(request);

    const code = await generateOrganizationCode(
      this.organizationRepository,
      request.organizationName,
    );
    const organization = await this.organizationRepository.create({
      organizationTypeId: organizationType.id,
      name: request.organizationName,
      code,
    });

    await this.membershipRepository.create({
      userId: user.id,
      organizationId: organization.id,
      roleId: ownerRole.id,
      status: MembershipStatus.active,
    });

    // Every organization gets its own starting "member" role — empty
    // permissions, same as the old shared global one, but editable from day
    // one via Settings > Roles & access instead of being a global dead end.
    await this.roleRepository.create({
      organizationId: organization.id,
      name: "member",
      permissionCodes: [],
    });

    return this.issueSession(user, meta);
  }

  // Used by InviteService for a brand-new account redeeming an invite —
  // deliberately creates ONLY the user, no organization and no membership
  // (the invite itself is what puts them in an organization). Keeps every
  // FleetIP account created this way from ever owning a redundant org of
  // its own.
  async createAccountAndSession(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResult> {
    const user = await this.createAccount(input);
    return this.issueSession(user);
  }

  private async createAccount(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<PublicUserRecord> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) throw new ConflictError("An account with this email already exists", "email");

    const passwordHash = await hashPassword(input.password);
    return this.userRepository.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });
  }

  async login(request: LoginRequest, meta: SessionMeta = {}): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(request.email);
    // Always run the same slow KDF, even when the email doesn't exist —
    // otherwise a nonexistent-email login returns near-instantly while a
    // real one takes a full scrypt computation, letting an attacker
    // enumerate valid accounts by response time alone.
    const isValidPassword = await verifyPassword(
      request.password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !isValidPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }
    // Checked only after a real password match — never before, so a
    // suspended account's existence can't be inferred from a wrong password
    // getting a different error than a nonexistent email would.
    if (user.status === "suspended") {
      throw new ForbiddenError("This account has been suspended");
    }
    return this.issueSession(user, meta);
  }

  async logout(token: string): Promise<void> {
    await this.sessionRepository.deleteByTokenHash(hashSessionToken(token));
  }

  /**
   * The one place a session token is checked: unexpired, user not
   * suspended. Also bumps last_seen_at, at most every few minutes, so an
   * authenticated request isn't a write every time.
   */
  async resolveSession(token: string): Promise<(CurrentSession & { user: PublicUserRecord }) | null> {
    const session = await this.sessionRepository.findActiveByTokenHash(hashSessionToken(token));
    if (!session) return null;

    const user = await this.userRepository.findById(session.user_id);
    // Suspending deletes the sessions too; this also covers any row created in between.
    if (!user || user.status === "suspended") return null;

    if (Date.now() - new Date(session.last_seen_at).getTime() > LAST_SEEN_WRITE_INTERVAL_MS) {
      await this.sessionRepository.touch(session.id);
    }
    return { sessionId: session.id, userId: user.id, user };
  }

  async getAuthenticatedSession(token: string): Promise<AuthenticatedSession | null> {
    const resolved = await this.resolveSession(token);
    if (!resolved) return null;
    const { user } = resolved;

    const membershipRows = await this.membershipRepository.listWithOrganizationByUserId(user.id);

    // Roles are a small, fixed set today (owner/member) — cache the lookup
    // per role_id instead of re-querying it once per membership row.
    const permissionsByRoleId = new Map<string, PermissionCode[]>();
    for (const row of membershipRows) {
      if (!permissionsByRoleId.has(row.role_id)) {
        const codes = await this.roleRepository.listPermissionCodesByRoleId(row.role_id);
        permissionsByRoleId.set(row.role_id, codes as PermissionCode[]);
      }
    }

    const memberships: MembershipWithOrganization[] = membershipRows.map((row) => ({
      id: row.id,
      userId: user.id,
      organizationId: row.organization_id,
      roleName: row.role_name,
      status: row.status as "active" | "invited" | "suspended",
      createdAt: new Date(row.created_at).toISOString(),
      // The role grants a fixed set of codes, but a permission is only ever
      // real for the organization types it applies to (PERMISSION_ORGANIZATION_TYPES)
      // — the same check PermissionService.hasPermission enforces server-side.
      // Without this filter, a Renter's own membership would list
      // rental_company-only codes it can never actually exercise.
      permissions: (permissionsByRoleId.get(row.role_id) ?? []).filter((code) =>
        PERMISSION_ORGANIZATION_TYPES[code].includes(
          row.organization_type_code as OrganizationTypeCode,
        ),
      ),
      organization: {
        id: row.organization_id,
        organizationTypeCode: row.organization_type_code as "rental_company" | "renter",
        name: row.organization_name,
        code: row.organization_code,
        createdAt: new Date(row.organization_created_at).toISOString(),
      },
    }));

    return { user: toContractUser(user), memberships };
  }

  /** Same password rules and hash as signup; every other session is signed out, this one stays. */
  async changePassword(current: CurrentSession, request: ChangePasswordRequest): Promise<void> {
    const passwordHash = await this.userRepository.findPasswordHashById(current.userId);
    if (!passwordHash || !(await verifyPassword(request.currentPassword, passwordHash))) {
      // 400, not 401 — a 401 would read as "signed out" to the client.
      throw new ValidationError("Your current password is incorrect", [
        { path: "currentPassword", message: "That isn't your current password." },
      ]);
    }
    await this.userRepository.updatePasswordHash(current.userId, await hashPassword(request.newPassword));
    await this.sessionRepository.deleteOthersForUser(current.userId, current.sessionId);
  }

  async listSessions(current: CurrentSession): Promise<SessionListResponse> {
    const rows = await this.sessionRepository.listActiveByUserId(current.userId);
    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
        userAgent: row.user_agent,
        current: row.id === current.sessionId,
      })),
    };
  }

  async revokeSession(current: CurrentSession, sessionId: string): Promise<void> {
    const deleted = await this.sessionRepository.deleteByIdForUser(sessionId, current.userId);
    if (!deleted) throw new NotFoundError("Session not found");
  }

  async revokeOtherSessions(current: CurrentSession): Promise<void> {
    await this.sessionRepository.deleteOthersForUser(current.userId, current.sessionId);
  }

  private async issueSession(user: PublicUserRecord, meta: SessionMeta = {}): Promise<AuthResult> {
    const { token, tokenHash, expiresAt } = generateSessionToken();
    await this.sessionRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    });
    return { user: toContractUser(user), token, expiresAt };
  }
}
