"use client";

import { Button, FormBanner, Input } from "@fleetip/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent } from "react";
import { z } from "zod";
import { adminApiClient } from "../../../lib/admin-api-client";
import { useForm } from "../../../lib/form";
import { AuthCard } from "../../(public)/AuthShell";
import { PasswordInput, emailField } from "../../(public)/fields";
import { useStatusCopy } from "../../../components/status-copy";
import { staffCall } from "../staff-api";

const schema = z.object({
  email: emailField("Enter your staff email address."),
  password: z.string().min(1, "Enter your password."),
});

const STATUS_COPY = {
  401: { title: "Email or password is incorrect.", body: "Check both and try again. Passwords are case-sensitive." },
  429: { title: "Too many sign-in attempts", body: "For security, wait a minute before trying again." },
};

// useSearchParams (?ended=1) needs a Suspense boundary for static rendering.
export default function PlatformAdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <header className="flex h-12 flex-none items-center gap-2.5 bg-rail px-4 min-[760px]:px-6">
        <span aria-hidden="true" className="h-[22px] w-[22px] flex-none rounded-cell bg-accent" />
        <span className="text-sm font-bold text-white">FleetIP</span>
        <span className="truncate text-xs text-rail-tag">· Platform admin · staff only</span>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-10 min-[760px]:py-16">
        <div className="flex w-full max-w-[420px] flex-col gap-4">
          <Suspense fallback={null}>
            <StaffLoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function StaffLoginForm() {
  const router = useRouter();
  const sessionEnded = useSearchParams().get("ended") === "1";
  const form = useForm({ schema, initial: { email: "", password: "" }, failTitle: "You weren't signed in" });
  const status = useStatusCopy(STATUS_COPY);
  const problem = status.banner ?? form.banner;

  // staffCall turns AdminApiError into ApiError, so useForm and the status copy can read it.
  const save = form.submit(async (body) => {
    await status.guard(() => staffCall(() => adminApiClient.login(body)));
    router.push("/platform-admin");
  });
  const handleSubmit = (event: FormEvent) => {
    status.clear();
    void save(event);
  };

  return (
    <AuthCard
      title="Staff sign-in"
      description="For FleetIP staff only. Staff accounts are set up by FleetIP directly — there's no sign-up here."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {sessionEnded && !problem && (
          <FormBanner tone="info" title="Your staff session ended">
            Sign in again to carry on.
          </FormBanner>
        )}
        {problem && (
          <FormBanner tone="error" title={problem.title}>
            {problem.body}
          </FormBanner>
        )}
        <Input
          label="Staff email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          {...form.field("email")}
        />
        <PasswordInput
          label="Password"
          required
          autoComplete="current-password"
          {...form.field("password")}
        />
        <Button type="submit" busy={form.busy} busyLabel="Signing in…" className="w-full">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
