"use client";

import { Button, Card, Input, Select } from "@fleetip/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

const ORGANIZATION_TYPE_OPTIONS = [
  { value: "rental_company", label: "Rental Company" },
  { value: "renter", label: "Renter" },
];

export default function SignupPage() {
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Sign up</h2>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit}>
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
        <Button type="submit" className="mt-1 w-full">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
