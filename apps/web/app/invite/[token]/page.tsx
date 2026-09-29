"use client";

import { InviteStatus, type InvitePreview } from "@fleetip/contracts/organization";
import { Button, DescriptionList, FormBanner, Input, Skeleton, useToast } from "@fleetip/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { ApiError, apiClient } from "../../../lib/api-client";
import { errorStatus } from "../../../lib/errors";
import { useAction, useForm } from "../../../lib/form";
import { useSession } from "../../../lib/session-context";
import { Status } from "../../../lib/status";
import { useLoad } from "../../../lib/use-load";
import { ORGANIZATION_TYPE_LABEL } from "../../(app)/settings/permissions";
import { AUTH_LINK, AuthCard, AuthShell, LINK_PRIMARY } from "../../(public)/AuthShell";
import { PasswordInput, emailField, newPasswordField } from "../../(public)/fields";

// Mirrors acceptInviteRequestSchema (packages/contracts/src/organization):
// a new account needs email, password (8+) and name together.
const INVITE_PASSWORD_MIN = 8;

const newAccountSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name as your new team should see it."),
  email: emailField("Enter the email you'll sign in with."),
  password: newPasswordField(INVITE_PASSWORD_MIN),
});

const EMAIL_TAKEN = "An account with this email already exists.";

function useNewAccountForm(org: string) {
  return useForm({
    schema: newAccountSchema,
    initial: { displayName: "", email: "", password: "" },
    failTitle: `You didn't join ${org}`,
    conflicts: { email: EMAIL_TAKEN },
  });
}

interface Problem {
  title: string;
  body: ReactNode;
}

// Outside both (app) and (public) route groups on purpose — a visitor may
// or may not have a session, and neither group's layout fits: (app) forces
// a redirect to /login, (public) forces a redirect away when logged in.
// This page has to work in both states at once. See docs/decisions.md.
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const preview = useLoad(() => apiClient.getInvitePreview(token), [token]);

  return (
    <AuthShell>
      {preview.error ? (
        <PreviewError error={preview.error} onRetry={() => void preview.reload()} />
      ) : preview.loading || !preview.data ? (
        <PreviewSkeleton />
      ) : (
        <InviteBody token={token} preview={preview.data} onStale={() => void preview.reload()} />
      )}
    </AuthShell>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Checking the invite" className="flex flex-col gap-3 rounded-panel border border-border-strong bg-surface p-5">
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-3 w-4/5" />
      <div className="mt-2 flex flex-col gap-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <span role="status" className="text-xs text-meta">
        Checking the invite…
      </span>
    </div>
  );
}

function PreviewError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = errorStatus(error);
  if (status === 404) {
    return (
      <AuthCard
        title="This invite link doesn't work"
        description="Check that you copied the whole link — it's long. If it still doesn't open, ask whoever sent it for a new one."
        footer={
          <>
            Already on FleetIP?{" "}
            <Link href="/login" className={AUTH_LINK}>
              Sign in
            </Link>
          </>
        }
      >
        <p className="m-0 font-mono text-xs text-meta">404 · Invite not found</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={status === 0 ? "You're offline" : "The invite didn't load"}
      description={
        status === 0
          ? "FleetIP couldn't be reached, so the invite couldn't be checked. Check your connection."
          : "The problem is on our side, not with your link. Try again in a minute."
      }
    >
      <Button icon="refresh" onClick={onRetry} className="self-start">
        Try again
      </Button>
    </AuthCard>
  );
}

function InviteDetails({ preview }: { preview: InvitePreview }) {
  return (
    <DescriptionList
      layout="rows"
      items={[
        { label: "Organization", value: preview.organizationName },
        { label: "Type", value: ORGANIZATION_TYPE_LABEL[preview.organizationTypeCode] },
        { label: "You'd join as", value: preview.roleName },
        {
          label: "Invite",
          value: preview.expired ? (
            <span title="Worked out from the expiry date" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-meta">
              Expired
            </span>
          ) : (
            <Status domain="invite" value={preview.status} size="sm" />
          ),
        },
      ]}
    />
  );
}

function InviteBody({ token, preview, onStale }: { token: string; preview: InvitePreview; onStale: () => void }) {
  const { status, session, refresh, logout, setCurrentOrganizationId } = useSession();
  const router = useRouter();
  const toast = useToast();
  const org = preview.organizationName;
  const action = useAction();
  const form = useNewAccountForm(org);
  const [conflict, setConflict] = useState<Problem | null>(null);
  const problem = conflict ?? action.banner ?? form.banner;
  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;
  const signedIn = status === "authenticated" && session !== null;

  const home = signedIn ? (
    <Link href="/" className={LINK_PRIMARY}>
      Go to your dashboard
    </Link>
  ) : (
    <Link href={loginHref} className={LINK_PRIMARY}>
      Sign in
    </Link>
  );

  // ---- Invites that can't be used any more: say so plainly.
  if (preview.status === InviteStatus.accepted || preview.status === InviteStatus.revoked || preview.expired) {
    const copy =
      preview.status === InviteStatus.accepted
        ? {
            title: "This invite has already been used",
            body: `Each invite link works once. If you used it, sign in to reach ${org}. Otherwise ask whoever sent it for a new link.`,
          }
        : preview.status === InviteStatus.revoked
          ? { title: "This invite was withdrawn", body: `It can't be used to join ${org} any more. Ask whoever sent it for a new link.` }
          : { title: "This invite has expired", body: `Invite links work for 7 days. Ask whoever sent it for a new link to join ${org}.` };
    return (
      <AuthCard title={copy.title} description={copy.body}>
        <InviteDetails preview={preview} />
        <div className="flex flex-wrap gap-2">{home}</div>
      </AuthCard>
    );
  }

  /** Accept, then land in the organization just joined (not whichever was selected before). */
  async function join(newAccount?: { email: string; password: string; displayName: string }) {
    const result = await apiClient.acceptInvite(token, newAccount);
    await refresh();
    if (result?.organizationId) setCurrentOrganizationId(result.organizationId);
    toast.success({
      title: `You joined ${org}`,
      body: `As ${result?.roleName ?? preview.roleName}. You're now working in ${org}.`,
    });
    router.push("/");
  }

  /**
   * The accept endpoint's 409s carry no field, and what to show depends on
   * the message text (already a member → a way to the dashboard; used or
   * expired → reload the invite), so they're handled here; everything else
   * goes on to useForm/useAction.
   */
  async function acceptWith(call: () => Promise<void>): Promise<void> {
    setConflict(null);
    try {
      await call();
    } catch (error) {
      if (!handleConflict(error)) throw error;
    }
  }

  function handleConflict(error: unknown): boolean {
    if (!(error instanceof ApiError) || error.status !== 409) return false;
    if (/already a member/i.test(error.message)) {
      const matches = session?.memberships.filter((m) => m.organization.name === org) ?? [];
      setConflict({
        title: `You're already a member of ${org}`,
        body: (
          <>
            Your account is in this organization already, so there&apos;s nothing to accept.{" "}
            <button
              type="button"
              onClick={() => {
                if (matches.length === 1 && matches[0]) setCurrentOrganizationId(matches[0].organizationId);
                router.push("/");
              }}
              className="border-0 bg-transparent p-0 font-medium text-accent-text hover:underline"
            >
              Go to your dashboard
            </button>
          </>
        ),
      });
      return true;
    }
    if (/expired|already been/i.test(error.message)) {
      setConflict({ title: "This invite can't be used any more", body: "It was used or expired a moment ago. Checking it again…" });
      onStale();
      return true;
    }
    return false;
  }

  const joinSignedIn = () => action.run(() => acceptWith(() => join()), { failTitle: `You didn't join ${org}` });

  const createAndJoin = form.submit((account) => acceptWith(() => join(account)));
  const handleCreate = (event: FormEvent) => {
    setConflict(null);
    void createAndJoin(event);
  };

  return (
    <AuthCard
      title={`Join ${org}`}
      description={`You've been invited to join this ${ORGANIZATION_TYPE_LABEL[preview.organizationTypeCode].toLowerCase()} as ${preview.roleName}.`}
      footer={
        signedIn ? undefined : (
          <>
            Already have a FleetIP account?{" "}
            <Link href={loginHref} className={AUTH_LINK}>
              Sign in first
            </Link>{" "}
            and you&apos;ll come back here to join with one click.
          </>
        )
      }
    >
      <InviteDetails preview={preview} />
      {problem && (
        <FormBanner tone="error" title={problem.title}>
          {problem.body}
        </FormBanner>
      )}
      {status === "loading" ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-[34px] w-full rounded-control" />
          <span role="status" className="text-xs text-meta">
            Checking whether you&apos;re signed in…
          </span>
        </div>
      ) : signedIn && session ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3.5">
          <p className="m-0 text-sm leading-[1.5] text-ink-body">
            You&apos;re signed in as <span className="font-semibold text-ink">{session.user.email}</span>. Joining adds {org} to
            this account; your other organizations stay as they are.
          </p>
          <Button onClick={() => void joinSignedIn()} busy={action.busy} busyLabel="Joining…" className="w-full">
            Join {org}
          </Button>
          <p className="m-0 text-xs leading-[1.5] text-meta">
            Not you, or want a separate account?{" "}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={action.busy}
              className="border-0 bg-transparent p-0 font-medium text-accent-text hover:underline disabled:text-disabled-text"
            >
              Sign out
            </button>{" "}
            and stay on this page.
          </p>
        </div>
      ) : (
        <NewAccountForm org={org} loginHref={loginHref} form={form} onSubmit={handleCreate} />
      )}
    </AuthCard>
  );
}

function NewAccountForm({
  org,
  loginHref,
  form,
  onSubmit,
}: {
  org: string;
  loginHref: string;
  form: ReturnType<typeof useNewAccountForm>;
  onSubmit: (event: FormEvent) => void;
}) {
  const email = form.field("email");
  const emailError =
    email.error === EMAIL_TAKEN ? (
      <>
        {EMAIL_TAKEN}{" "}
        <Link href={loginHref} className={AUTH_LINK}>
          Sign in to join with it
        </Link>
      </>
    ) : (
      email.error
    );

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3.5 border-t border-border pt-3.5">
      <p className="m-0 text-sm leading-[1.5] text-ink-body">
        New to FleetIP? Create your account to join. It belongs to {org} only — no organization of your own is created.
      </p>
      <Input label="Your name" required autoComplete="name" {...form.field("displayName")} />
      <Input label="Email" type="email" required autoComplete="email" inputMode="email" {...email} error={emailError} hint="You'll sign in with this." />
      <PasswordInput
        label="Password"
        required
        autoComplete="new-password"
        {...form.field("password")}
        hint={`At least ${INVITE_PASSWORD_MIN} characters.`}
      />
      <Button type="submit" busy={form.busy} busyLabel="Creating your account…" className="w-full">
        Create account and join
      </Button>
    </form>
  );
}
