import type { MailerPort } from "../../modules/identity/domain/ports.js";
import type { Env } from "../config/env.js";
import { LogMailer } from "./log-mailer.js";
import { ResendMailer } from "./resend-mailer.js";

/**
 * THE one place that knows which email provider is in use. The rest of the app
 * only sees MailerPort. Switching provider = write an adapter (like
 * resend-mailer.ts), add a case here and its keys to env.ts, set MAIL_PROVIDER.
 * `delivers` is false for the dev log mailer: nobody can receive a link, so
 * flows that need the recipient to click one (email verification) stay off.
 */
export function createMailer(env: Env): { mailer: MailerPort; delivers: boolean } {
  switch (env.MAIL_PROVIDER) {
    case "resend":
      return { mailer: new ResendMailer(env.RESEND_API_KEY!, env.MAIL_FROM), delivers: true };
    case "log":
      return { mailer: new LogMailer(), delivers: false };
  }
}
