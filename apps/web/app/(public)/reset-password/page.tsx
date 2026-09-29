"use client";

import { Button, FormBanner } from "@fleetip/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { AUTH_LINK, AuthCard, LINK_PRIMARY } from "../AuthShell";
import { PasswordInput, newPasswordField } from "../fields";
import { useStatusCopy } from "../../../components/status-copy";

// Mirrors packages/contracts/src/identity (passwordSchema): 10–200, same as signup.
const schema = z
  .object({ password: newPasswordField(10, 200), confirm: z.string() })
  .refine((values) => values.confirm === values.password, { path: ["confirm"], message: "The two passwords don't match." });

// A 400 here is about the token (not a field on this form), so it gets its own copy.
const STATUS_COPY = {
  400: { title: "This reset link can't be used", body: "It may have expired or already been used." },
  429: { title: "Too many attempts", body: "For security, wait a minute before trying again." },
};

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const form = useForm({ schema, initial: { password: "", confirm: "" }, failTitle: "Your password wasn't changed" });
  const status = useStatusCopy(STATUS_COPY);
  const problem = status.banner ?? form.banner;

  const requestNewLink = (
    <Link href="/forgot-password" className={AUTH_LINK}>
      Request a new link
    </Link>
  );

  const save = form.submit(async ({ password }) => {
    await status.guard(() => apiClient.confirmPasswordReset({ token, password }));
    setDone(true);
  });
  const handleSubmit = (event: FormEvent) => {
    status.clear();
    void save(event);
  };

  if (!token) {
    return (
      <AuthCard title="Reset link missing" footer={requestNewLink}>
        <FormBanner tone="error" title="This page needs the link from your email">
          Open the reset link from the email exactly as it was sent, or request a new one.
        </FormBanner>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <FormBanner tone="info" title="You can sign in with your new password">
          For security, every device that was signed in to this account has been signed out.
        </FormBanner>
        <Link href="/login" className={LINK_PRIMARY}>
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="Pick a password you don't use anywhere else." footer={requestNewLink}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {problem && (
          <FormBanner tone="error" title={problem.title}>
            {problem.body}
          </FormBanner>
        )}
        <PasswordInput
          label="New password"
          required
          autoComplete="new-password"
          {...form.field("password")}
        />
        <PasswordInput
          label="Confirm new password"
          required
          autoComplete="new-password"
          {...form.field("confirm")}
        />
        <Button type="submit" busy={form.busy} busyLabel="Saving…" className="w-full">
          Set new password
        </Button>
      </form>
    </AuthCard>
  );
}
