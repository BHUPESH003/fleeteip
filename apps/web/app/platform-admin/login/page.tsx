"use client";

import { Button, Input } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminApiClient } from "../../../lib/admin-api-client";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await adminApiClient.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      router.push("/platform-admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-strong px-4">
      <div className="w-full max-w-sm rounded-panel bg-surface p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded-xs bg-warning" />
          <span className="text-sm font-bold tracking-wide text-ink">FleetIP · Platform Admin</span>
        </div>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        <form onSubmit={handleSubmit}>
          <Input label="Staff email" name="email" type="email" required />
          <Input label="Password" name="password" type="password" required />
          <Button type="submit" className="mt-1 w-full">
            Log in
          </Button>
        </form>
        <p className="mt-4 text-xs text-meta-light">
          Staff accounts are provisioned out of band — there is no signup here.
        </p>
      </div>
    </div>
  );
}
