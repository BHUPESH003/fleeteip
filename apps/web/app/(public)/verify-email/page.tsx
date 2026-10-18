"use client";

import { FormBanner, LoadingState } from "@fleetip/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { AUTH_LINK, AuthCard, LINK_PRIMARY } from "../AuthShell";

export default function VerifyEmailPage() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"checking" | "done" | "failed">(token ? "checking" : "failed");
  // The token is single-use: a second call (React strict-mode double effect) would report it as used.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiClient
      .confirmEmailVerification({ token })
      .then(() => setState("done"))
      .catch(() => setState("failed"));
  }, [token]);

  if (state === "checking") {
    return (
      <AuthCard title="Verifying your email">
        <LoadingState label="Verifying…" />
      </AuthCard>
    );
  }

  if (state === "done") {
    return (
      <AuthCard title="Email verified">
        <FormBanner tone="info" title="You can sign in now">
          Your email address is confirmed.
        </FormBanner>
        <Link href="/login" className={LINK_PRIMARY}>
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="This link can't be used"
      footer={
        <Link href="/login" className={AUTH_LINK}>
          Sign in to get a new link
        </Link>
      }
    >
      <FormBanner tone="error" title="The verification link is invalid or has expired">
        Sign in with your email and password and we'll offer to send a new one.
      </FormBanner>
    </AuthCard>
  );
}
