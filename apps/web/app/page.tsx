"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import { Button, Input, Select } from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../lib/api-client";

const ORGANIZATION_TYPE_OPTIONS = [
  { value: "rental_company", label: "Rental Company" },
  { value: "renter", label: "Renter" },
];

export default function HomePage() {
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshSession() {
    try {
      const result = (await apiClient.me()) as AuthenticatedSession;
      setSession(result);
    } catch {
      setSession(null);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.signup({
        email: String(form.get("email")),
        password: String(form.get("password")),
        displayName: String(form.get("displayName")),
        organizationName: String(form.get("organizationName")),
        organizationTypeCode: form.get("organizationTypeCode") as "rental_company" | "renter",
      });
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function handleLogout() {
    setError(null);
    try {
      await apiClient.logout();
    } finally {
      await refreshSession();
    }
  }

  if (session) {
    return (
      <div className="fleetip-card">
        <h1>Welcome, {session.user.displayName}</h1>
        <p>{session.user.email}</p>
        <h2>Organizations</h2>
        <ul>
          {session.memberships.map((membership) => (
            <li key={membership.id}>
              {membership.organization.name} ({membership.organization.code}) —{" "}
              {membership.organization.organizationTypeCode} — {membership.roleName}
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    );
  }

  return (
    <>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <form className="fleetip-card" onSubmit={handleSignup}>
        <h1>Sign up</h1>
        <Input label="Email" name="email" type="email" required />
        <Input label="Password" name="password" type="password" minLength={10} required />
        <Input label="Your name" name="displayName" required />
        <Input label="Organization name" name="organizationName" required />
        <Select
          label="Organization type"
          name="organizationTypeCode"
          options={ORGANIZATION_TYPE_OPTIONS}
          required
        />
        <Button type="submit">Create account</Button>
      </form>

      <form className="fleetip-card" onSubmit={handleLogin}>
        <h1>Log in</h1>
        <Input label="Email" name="email" type="email" required />
        <Input label="Password" name="password" type="password" required />
        <Button type="submit" variant="secondary">
          Log in
        </Button>
      </form>
    </>
  );
}
