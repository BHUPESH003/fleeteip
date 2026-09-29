"use client";

import { Button, FormBanner, Input } from "@fleetip/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { useSession } from "../../../lib/session-context";
import { AUTH_LINK, AuthCard } from "../AuthShell";
import { PasswordInput, emailField } from "../fields";
import { nextQuery, safeNextPath } from "../next-param";

const schema = z.object({
  email: emailField(),
  password: z.string().min(1, "Enter your password."),
});

const STATUS_COPY = {
  401: { title: "Email or password is incorrect.", body: "Check both and try again. Passwords are case-sensitive." },
  403: {
    title: "This account is suspended",
    body: "It can't sign in until FleetIP reactivates it. Contact FleetIP support if you think this is a mistake.",
  },
  429: { title: "Too many sign-in attempts", body: "For security, wait a minute before trying again." },
};

export default function LoginPage() {
  const { refresh } = useSession();
  // Read on every render; the layout does the redirect to it once signed in.
  const next = safeNextPath(useSearchParams().get("next"));
  const form = useForm({ statusCopy: STATUS_COPY, schema, initial: { email: "", password: "" }, failTitle: "You weren't signed in" });
  const problem = form.banner;

  const save = form.submit(async (body) => {
    // The (public) layout sends a signed-in visitor on to ?next= (or the dashboard).
    await apiClient.login(body);
    await refresh();
  });
  const handleSubmit = (event: FormEvent) => {
    void save(event);
  };

  const toInvite = next.startsWith("/invite/");

  return (
    <AuthCard
      title="Sign in to FleetIP"
      description={toInvite ? "Sign in to accept your invite with the account you already have." : "Use the email and password for your FleetIP account."}
      footer={
        <>
          New to FleetIP?{" "}
          <Link href={`/signup${nextQuery(next)}`} className={AUTH_LINK}>
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {next !== "/" && !problem && (
          <FormBanner tone="info" title={toInvite ? "Your invite is waiting" : "Sign in to continue"}>
            {toInvite
              ? "After you sign in you'll go back to the invite to join with one click."
              : "You'll go straight back to the page you were opening."}
          </FormBanner>
        )}
        {problem && (
          <FormBanner tone="error" title={problem.title}>
            {problem.body}
          </FormBanner>
        )}
        <Input label="Email" type="email" required autoComplete="email" inputMode="email" {...form.field("email")} />
        <PasswordInput label="Password" required autoComplete="current-password" {...form.field("password")} />
        <Button type="submit" busy={form.busy} busyLabel="Signing in…" className="w-full">
          Sign in
        </Button>
        <p className="m-0 text-sm leading-[1.5]">
          <Link href="/forgot-password" className={AUTH_LINK}>
            Forgot password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
