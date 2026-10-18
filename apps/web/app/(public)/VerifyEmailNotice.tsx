"use client";

import { Button, FormBanner, useToast } from "@fleetip/ui";
import { useState } from "react";
import { apiClient } from "../../lib/api-client";
import { AuthCard } from "./AuthShell";

/** "Check your email" card, with a resend that never reveals whether the address has an account. */
export function VerifyEmailNotice({ email, onBack }: { email: string; onBack: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await apiClient.resendEmailVerification({ email });
      toast.success({ title: "Verification email sent", body: `If ${email} still needs verifying, a new link is on its way.` });
    } catch {
      toast.error({ title: "The email wasn't sent", body: "Wait a minute and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Check your email" description={`We sent a verification link to ${email}. It works for 24 hours.`}>
      <FormBanner tone="info" title="Verify your email to sign in">
        Open the link in that email, then sign in. Nothing there? Check spam, or send it again.
      </FormBanner>
      <Button variant="secondary" busy={busy} busyLabel="Sending…" onClick={() => void resend()} className="w-full">
        Resend verification email
      </Button>
      <Button variant="tertiary" onClick={onBack} className="w-full">
        Back
      </Button>
    </AuthCard>
  );
}
