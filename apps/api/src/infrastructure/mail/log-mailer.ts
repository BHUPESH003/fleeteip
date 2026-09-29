import type { MailerPort, MailMessage } from "../../modules/identity/domain/ports.js";
import { logger } from "../logging/logger.js";

/**
 * ponytail: no email provider yet — this logs the message (recipient,
 * subject, body with any link) instead of sending it. This is THE swap
 * point: implement MailerPort against SES/SMTP/etc. and change the one
 * `new LogMailer()` in container.ts. Never ship this to production — reset
 * links in logs are live credentials.
 */
export class LogMailer implements MailerPort {
  async send(message: MailMessage): Promise<void> {
    logger.info({ mail: message }, `[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
