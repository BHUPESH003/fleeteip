"use client";

import type { InvitePreview } from "@fleetip/contracts/organization";
import { Button, Card, ErrorState, Input, LoadingState } from "@fleetip/ui";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

const ORG_TYPE_LABEL: Record<InvitePreview["organizationTypeCode"], string> = {
  rental_company: "Rental Company",
  renter: "Renter",
};

// Outside both (app) and (public) route groups on purpose — a visitor may
// or may not have a session, and neither group's layout fits: (app) forces
// a redirect to /login, (public) forces a redirect to / when logged in.
// This page has to work in both states at once. See docs/decisions.md.
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { status, session, refresh } = useSession();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setPreview((await apiClient.getInvitePreview(token)) as InvitePreview);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Failed to load invite");
      }
    })();
  }, [token]);

  async function finishAccept(newAccount?: { email: string; password: string; displayName: string }) {
    setAcceptError(null);
    setAccepting(true);
    try {
      await apiClient.acceptInvite(token, newAccount);
      await refresh();
      router.push("/");
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Failed to accept invite");
      setAccepting(false);
    }
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await finishAccept({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-surface-page px-6 py-12">
      <div className="flex items-center justify-center gap-2.5">
        <div className="h-6 w-6 rounded-xs bg-accent" />
        <h1 className="text-2xl font-bold tracking-wide text-ink">FleetIP</h1>
      </div>

      <Card>
        {previewError ? (
          <ErrorState message={previewError} />
        ) : !preview ? (
          <LoadingState label="Loading invite…" />
        ) : preview.status !== "pending" ? (
          <p className="text-sm text-ink">
            This invite has already been {preview.status}. Ask whoever sent it for a new link.
          </p>
        ) : preview.expired ? (
          <p className="text-sm text-ink">
            This invite link has expired. Ask whoever sent it for a new one.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Join {preview.organizationName}</h2>
              <p className="mt-1 text-sm text-meta">
                You&apos;ve been invited as a <span className="capitalize">{preview.roleName}</span> at
                this {ORG_TYPE_LABEL[preview.organizationTypeCode]}.
              </p>
            </div>

            {acceptError && <p className="text-sm text-danger">{acceptError}</p>}

            {status === "loading" ? (
              <LoadingState label="Checking your session…" />
            ) : status === "authenticated" && session ? (
              <>
                <p className="text-xs text-meta-light">
                  Signed in as {session.user.email}. This joins that account to this organization —
                  your existing organizations are unaffected.
                </p>
                <Button onClick={() => void finishAccept()} disabled={accepting}>
                  {accepting ? "Joining…" : `Accept as ${session.user.email}`}
                </Button>
              </>
            ) : (
              <form onSubmit={handleSignupSubmit} className="flex flex-col gap-1">
                <p className="mb-2 text-xs text-meta-light">
                  Create an account to accept — this keeps you scoped to this organization only, not
                  a new one of your own.
                </p>
                <Input label="Email" name="email" type="email" required />
                <Input label="Password" name="password" type="password" minLength={8} required />
                <Input label="Your name" name="displayName" required />
                <Button type="submit" className="mt-1 w-full" disabled={accepting}>
                  {accepting ? "Joining…" : "Create account and join"}
                </Button>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
