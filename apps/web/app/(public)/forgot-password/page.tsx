"use client";

import { Button, FormBanner, Input } from "@fleetip/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { AUTH_LINK, AuthCard } from "../AuthShell";
import { emailField } from "../fields";
import { useStatusCopy } from "../../../components/status-copy";

const schema = z.object({ email: emailField() });

const STATUS_COPY = { 429: { title: "Too many attempts", body: "For security, wait a minute before trying again." } };

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm({ schema, initial: { email: "" }, failTitle: "The reset link wasn't sent" });
  const status = useStatusCopy(STATUS_COPY);
  const problem = status.banner ?? form.banner;

  const save = form.submit(async (body) => {
    await status.guard(() => apiClient.requestPasswordReset(body));
    setSent(true);
  });
  const handleSubmit = (event: FormEvent) => {
    status.clear();
    void save(event);
  };

  const footer = (
    <>
      Remembered it?{" "}
      <Link href="/login" className={AUTH_LINK}>
        Back to sign in
      </Link>
    </>
  );

  if (sent) {
    return (
      <AuthCard title="Check your email" footer={footer}>
        <FormBanner tone="info" title="If an account exists, we've sent a link">
          If {form.values.email.trim()} belongs to a FleetIP account, it will get an email with a link to reset the password. The link
          works for 1 hour. Check your spam folder if it doesn&apos;t arrive.
        </FormBanner>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email for your FleetIP account and we'll send you a link to choose a new password."
      footer={footer}
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {problem && (
          <FormBanner tone="error" title={problem.title}>
            {problem.body}
          </FormBanner>
        )}
        <Input label="Email" type="email" required autoComplete="email" inputMode="email" {...form.field("email")} />
        <Button type="submit" busy={form.busy} busyLabel="Sending…" className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
