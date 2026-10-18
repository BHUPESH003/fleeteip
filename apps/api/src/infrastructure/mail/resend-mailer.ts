import type { MailerPort, MailMessage } from "../../modules/identity/domain/ports.js";

/** Resend adapter for MailerPort: Resend's REST API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements MailerPort {
  constructor(
    private readonly apiKey: string,
    /** e.g. "FleetIP <no-reply@yourdomain.com>" — the domain must be verified in Resend. */
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected the email (${response.status}): ${await response.text().catch(() => "")}`);
    }
  }
}
