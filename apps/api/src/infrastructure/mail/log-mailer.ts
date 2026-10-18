import type { MailerPort, MailMessage } from "../../modules/identity/domain/ports.js";
import { logger } from "../logging/logger.js";

/**
 * Dev/default MailerPort: logs the message (recipient, subject, body with any
 * link) instead of sending it. Provider selection lives in create-mailer.ts.
 * Never use in production — reset and verification links in logs are live
 * credentials.
 */
export class LogMailer implements MailerPort {
  async send(message: MailMessage): Promise<void> {
    logger.info({ mail: message }, `[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
