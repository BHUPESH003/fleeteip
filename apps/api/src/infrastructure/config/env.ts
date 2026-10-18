import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_SECRET: z.string().min(32, "SESSION_COOKIE_SECRET must be at least 32 characters"),
  SESSION_COOKIE_NAME: z.string().default("fleetip_session"),
  // A separate cookie/principal from tenant sessions — see
  // docs/platform-admin-architecture-requirements.md and the staff module.
  // Signed with the same SESSION_COOKIE_SECRET (same trust boundary, one
  // fewer secret to provision) but never confused with a tenant session:
  // different cookie name, different table, different login endpoint.
  STAFF_SESSION_COOKIE_NAME: z.string().default("fleetip_staff_session"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  // Transactional email. "log" (default) only logs messages, so flows that need
  // the recipient to click a link (email verification) stay off. Provider
  // choice lives in infrastructure/mail/create-mailer.ts; each provider's own
  // keys are listed below and checked together with MAIL_PROVIDER.
  MAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  MAIL_FROM: z.string().min(3).default("FleetIP <no-reply@example.com>"),
  RESEND_API_KEY: z.string().min(1).optional(),
  // Daily reminders scheduler (modules/reminders), started by index.ts only.
  // "false" turns it off, e.g. for a second API instance you want quiet.
  REMINDERS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Business day for every date-only "today" (overdue, validity) — read by
  // shared/business-date.ts. Validated here so a typo fails at startup.
  BUSINESS_TIME_ZONE: z
    .string()
    .default("Asia/Kolkata")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "BUSINESS_TIME_ZONE must be an IANA time zone, e.g. Asia/Kolkata"),
}).refine((e) => e.MAIL_PROVIDER !== "resend" || e.RESEND_API_KEY, {
  message: "RESEND_API_KEY is required when MAIL_PROVIDER=resend",
  path: ["RESEND_API_KEY"],
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
