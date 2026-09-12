"use client";

import { Button, Card, Input } from "@fleetip/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

export default function LoginPage() {
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-ink">Log in</h2>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <form onSubmit={handleSubmit}>
        <Input label="Email" name="email" type="email" required />
        <Input label="Password" name="password" type="password" required />
        <Button type="submit" className="mt-1 w-full">
          Log in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-meta">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent-text hover:underline">
          Sign up
        </Link>
      </p>
    </Card>
  );
}
