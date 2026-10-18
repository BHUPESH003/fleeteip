import type { EmailVerificationConfirmRequest, EmailVerificationResendRequest } from "@fleetip/contracts/identity";
import { randomBytes } from "node:crypto";
import { ValidationError } from "../../../shared/errors.js";
import type {
  EmailVerificationTokenRepositoryPort,
  MailerPort,
  UserRepositoryPort,
} from "../domain/ports.js";
import { hashSessionToken } from "../domain/session-token.js";

const TOKEN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const INVALID_TOKEN_MESSAGE = "This verification link is invalid or has expired. Request a new one.";

export class EmailVerificationService {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenRepository: EmailVerificationTokenRepositoryPort,
    private readonly mailer: MailerPort,
    private readonly webOrigin: string,
    // Mail goes out fire-and-forget, so its failures only reach this.
    private readonly logMailError: (error: unknown) => void = (error) =>
      console.error("[email-verification] mail send failed", error),
  ) {}

  /** Issues a fresh link (older ones stop working) and mails it. Never throws on mail failure. */
  async sendVerification(user: { id: string; email: string; display_name: string }): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await this.tokenRepository.invalidateUnusedByUserId(user.id);
    await this.tokenRepository.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + TOKEN_DURATION_MS),
    });
    const link = `${this.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    void this.mailer
      .send({
        to: user.email,
        subject: "Verify your FleetIP email",
        text: [
          `Hi ${user.display_name},`,
          "",
          "Confirm this email address to start using your FleetIP account. The link works for 24 hours:",
          link,
          "",
          "If you didn't create a FleetIP account, ignore this email.",
        ].join("\n"),
      })
      .catch(this.logMailError);
  }

  /** Always resolves the same way — the route answers 204 so it can't be used to enumerate accounts. */
  async resend(request: EmailVerificationResendRequest): Promise<void> {
    const user = await this.userRepository.findByEmail(request.email);
    if (!user || user.status !== "active" || user.email_verified_at) return;
    await this.sendVerification(user);
  }

  async confirm(request: EmailVerificationConfirmRequest): Promise<void> {
    const record = await this.tokenRepository.findByTokenHash(hashSessionToken(request.token));
    if (!record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }
    const redeemed = await this.tokenRepository.redeem({ tokenId: record.id, userId: record.user_id });
    if (!redeemed) throw new ValidationError(INVALID_TOKEN_MESSAGE);
  }
}
