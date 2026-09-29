"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { Button, FormBanner, FormSection, Input, RadioGroup, useToast } from "@fleetip/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { useSession } from "../../../lib/session-context";
import { AUTH_LINK, AuthCard } from "../AuthShell";
import { PasswordInput, emailField, newPasswordField } from "../fields";
import { nextQuery, safeNextPath } from "../next-param";

// Mirrors packages/contracts/src/identity (signupRequestSchema): password 10–200, names 1–200.
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

const nameField = (empty: string) =>
  z
    .string()
    .trim()
    .min(1, empty)
    .superRefine((value, ctx) => {
      if (value.length > 200) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Names are up to 200 characters. This one has ${value.length}.` });
    });

const schema = z.object({
  displayName: nameField("Enter your name as your team should see it."),
  email: emailField("Enter the email you'll sign in with."),
  password: newPasswordField(PASSWORD_MIN, PASSWORD_MAX),
  organizationName: nameField("Enter your organization's name."),
  organizationTypeCode: z.string().refine((value): value is OrganizationTypeCode => value in OrganizationTypeCode, {
    message: "Choose whether you rent machines out or hire them.",
  }),
});

const EMAIL_TAKEN = "An account with this email already exists.";

const STATUS_COPY = {
  429: { title: "Too many attempts just now", body: "For security, wait a minute before trying again. Your entries are kept." },
};

const ORGANIZATION_TYPE_OPTIONS = [
  { value: OrganizationTypeCode.rental_company, label: "Rental company", description: "You own machines and rent them out." },
  { value: OrganizationTypeCode.renter, label: "Renter", description: "You hire machines for your projects." },
];

export default function SignupPage() {
  const { refresh } = useSession();
  const toast = useToast();
  const next = safeNextPath(useSearchParams().get("next"));
  const form = useForm({
    statusCopy: STATUS_COPY,
    schema,
    initial: { displayName: "", email: "", password: "", organizationName: "", organizationTypeCode: "" },
    failTitle: "Your account wasn't created",
    conflicts: { email: EMAIL_TAKEN },
  });
  const problem = form.banner;
  const password = form.values.password;

  const passwordHint =
    password.length === 0
      ? `At least ${PASSWORD_MIN} characters.`
      : password.length < PASSWORD_MIN
        ? `${password.length} of at least ${PASSWORD_MIN} characters — ${PASSWORD_MIN - password.length} to go.`
        : "Long enough.";

  const save = form.submit(async (body) => {
    await apiClient.signup(body);
    toast.success({
      title: `${body.organizationName} is set up`,
      body: "You're its owner. Invite your team from Organization & team.",
    });
    // The (public) layout moves a signed-in visitor on to ?next= (or the dashboard).
    await refresh();
  });
  const handleSubmit = (event: FormEvent) => {
    void save(event);
  };

  const email = form.field("email");
  const emailError =
    email.error === EMAIL_TAKEN ? (
      <>
        {EMAIL_TAKEN}{" "}
        <Link href={`/login${nextQuery(next)}`} className={AUTH_LINK}>
          Sign in instead
        </Link>
      </>
    ) : (
      email.error
    );

  return (
    <AuthCard
      title="Create your FleetIP account"
      description="This sets up your organization with you as its owner. Joining someone else's organization? Open the invite link they sent you instead."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login${nextQuery(next)}`} className={AUTH_LINK}>
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {problem && (
          <FormBanner tone="error" title={problem.title}>
            {problem.body}
          </FormBanner>
        )}
        <FormSection title="You">
          <Input label="Your name" required autoComplete="name" maxLength={220} {...form.field("displayName")} />
          <Input label="Email" type="email" required autoComplete="email" inputMode="email" {...email} error={emailError} hint="You'll sign in with this." />
          <PasswordInput label="Password" required autoComplete="new-password" {...form.field("password")} hint={passwordHint} />
        </FormSection>
        <FormSection title="Your organization" className="border-t border-border pt-4">
          <Input label="Organization name" required autoComplete="organization" maxLength={220} {...form.field("organizationName")} />
          <div data-field="organizationTypeCode">
            <RadioGroup
              label="What does your organization do?"
              required
              name="organizationTypeCode"
              direction="column"
              value={form.values.organizationTypeCode}
              onChange={(value) => {
                form.set("organizationTypeCode", value);
                form.field("organizationTypeCode").onBlur();
              }}
              options={ORGANIZATION_TYPE_OPTIONS}
              error={form.errors.organizationTypeCode}
              hint="This can't be changed later."
            />
          </div>
        </FormSection>
        <Button type="submit" busy={form.busy} busyLabel="Creating your account…" className="w-full">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
