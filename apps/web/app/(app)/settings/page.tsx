"use client";

import { Card, PageHeader } from "@fleetip/ui";
import { useSession } from "../../../lib/session-context";

export default function SettingsPage() {
  const { session, currentMembership } = useSession();

  return (
    <>
      <PageHeader title="Settings" description="Your account and organization details." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-medium text-meta">Account</h2>
          <p className="text-sm text-ink">{session?.user.displayName}</p>
          <p className="text-sm text-meta">{session?.user.email}</p>
        </Card>
        {currentMembership && (
          <Card>
            <h2 className="mb-2 text-sm font-medium text-meta">Organization</h2>
            <p className="text-sm text-ink">{currentMembership.organization.name}</p>
            <p className="text-sm text-meta">
              {currentMembership.organization.code} ·{" "}
              {currentMembership.organization.organizationTypeCode} · {currentMembership.roleName}
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
