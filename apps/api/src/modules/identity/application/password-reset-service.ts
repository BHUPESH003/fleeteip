import type {
  PasswordResetConfirmRequest,
  PasswordResetRequest,
} from "@fleetip/contracts/identity";
import { randomBytes } from "node:crypto";
import { ValidationError } from "../../../shared/errors.js";
import { hashPassword } from "../domain/password.js";
import type {
  MailerPort,
  PasswordResetTokenRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from "../domain/ports.js";
import { hashSessionToken } from "../domain/session-token.js";

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000; // 1 hour
const INVALID_TOKEN_MESSAGE = "This reset link is invalid or has expired. Request a new one.";

export class PasswordResetService {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepositoryPort,
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly mailer: MailerPort,
    private readonly webOrigin: string,
    // Mail goes out fire-and-forget, so its failures only reach this.
    private readonly logMailError: (error: unknown) => void = (error) =>
      console.error("[password-reset] mail send failed", error),
  ) {}

  /**
   * Always resolves the same way whether or not the email exists or is
   * suspended — the route returns 204 either way so the endpoint can't be
   * used to enumerate accounts.
   * The mail is sent without awaiting so the provider's latency doesn't
   * reveal a known account; failures are logged, not surfaced.
   * ponytail: the known-account path still does a few extra writes, so
   * response time differs slightly; queue the work if that matters.
   */
  async requestReset(request: PasswordResetRequest): Promise<void> {
    const user = await this.userRepository.findByEmail(request.email);
    if (!user || user.status !== "active") return;

    // Same token discipline as sessions and invites: 32 random bytes,
    // only the sha256 hash is stored.
    const token = randomBytes(32).toString("base64url");
    await this.passwordResetTokenRepository.invalidateUnusedByUserId(user.id);
    await this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_DURATION_MS),
    });

    const link = `${this.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    void this.mailer
      .send({
        to: user.email,
        subject: "Reset your FleetIP password",
        text: [
          `Hi ${user.display_name},`,
          "",
          "Someone asked to reset the password for your FleetIP account. Use this link within 1 hour:",
          link,
          "",
          "If you didn't ask for this, ignore this email — your password stays the same.",
        ].join("\n"),
      })
      .catch(this.logMailError);
  }

  async confirmReset(request: PasswordResetConfirmRequest): Promise<void> {
    const record = await this.passwordResetTokenRepository.findByTokenHash(
      hashSessionToken(request.token),
    );
    if (!record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    const passwordHash = await hashPassword(request.password);
    const redeemed = await this.passwordResetTokenRepository.redeem({
      tokenId: record.id,
      userId: record.user_id,
      passwordHash,
    });
    if (!redeemed) throw new ValidationError(INVALID_TOKEN_MESSAGE);

    // Whoever knew the old password is signed out everywhere.
    await this.sessionRepository.deleteByUserId(record.user_id);
  }
}
