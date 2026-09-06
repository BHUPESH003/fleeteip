import type {
  AuthenticatedSession,
  LoginRequest,
  SignupRequest,
  User,
} from "@fleetip/contracts/identity";
import type { MembershipWithOrganization } from "@fleetip/contracts/organization";
import { ConflictError, UnauthorizedError, ValidationError } from "../../../shared/errors.js";
import { generateOrganizationCode } from "../../organizations/application/generate-organization-code.js";
import type {
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../../organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../../permissions/domain/ports.js";
import { hashPassword, verifyPassword } from "../domain/password.js";
import type {
  PublicUserRecord,
  SessionRepositoryPort,
  UserRepositoryPort,
} from "../domain/ports.js";
import { generateSessionToken, hashSessionToken } from "../domain/session-token.js";

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

  async signup(request: SignupRequest): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(request.email);
    if (existing) throw new ConflictError("An account with this email already exists");

    const organizationType = await this.organizationRepository.findTypeByCode(
      request.organizationTypeCode,
    );
    if (!organizationType) throw new ValidationError("Unknown organization type");

    const ownerRole = await this.roleRepository.findByName("owner");
    if (!ownerRole) throw new Error("Reference data missing: 'owner' role is not seeded");

    const passwordHash = await hashPassword(request.password);
    const user = await this.userRepository.create({
      email: request.email,
      passwordHash,
      displayName: request.displayName,
    });

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
      status: "active",
    });

    return this.issueSession(user);
  }

  async login(request: LoginRequest): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(request.email);
    if (!user || !(await verifyPassword(request.password, user.password_hash))) {
      throw new UnauthorizedError("Invalid email or password");
    }
    return this.issueSession(user);
  }

  async logout(token: string): Promise<void> {
    await this.sessionRepository.deleteByTokenHash(hashSessionToken(token));
  }

  async getAuthenticatedSession(token: string): Promise<AuthenticatedSession | null> {
    const session = await this.sessionRepository.findActiveByTokenHash(hashSessionToken(token));
    if (!session) return null;

    const user = await this.userRepository.findById(session.user_id);
    if (!user) return null;

    const membershipRows = await this.membershipRepository.listWithOrganizationByUserId(user.id);
    const memberships: MembershipWithOrganization[] = membershipRows.map((row) => ({
      id: row.id,
      userId: user.id,
      organizationId: row.organization_id,
      roleName: row.role_name as "owner" | "member",
      status: row.status as "active" | "invited" | "suspended",
      createdAt: new Date(row.created_at).toISOString(),
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

  private async issueSession(user: PublicUserRecord): Promise<AuthResult> {
    const { token, tokenHash, expiresAt } = generateSessionToken();
    await this.sessionRepository.create({ userId: user.id, tokenHash, expiresAt });
    return { user: toContractUser(user), token, expiresAt };
  }
}
