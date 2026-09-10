"use client";

import { Card, PageHeader } from "@fleetip/ui";
import { useSession } from "../../lib/session-context";

export default function DashboardPage() {
  const { session, currentMembership } = useSession();

  return (
    <>
      <PageHeader title={`Welcome, ${session?.user.displayName ?? ""}`} />
      {currentMembership && (
        <Card>
          <h2 className="mb-2 text-sm font-medium text-gray-500">Current organization</h2>
          <p className="text-lg font-semibold text-gray-900">
            {currentMembership.organization.name}
          </p>
          <p className="text-sm text-gray-500">
            {currentMembership.organization.code} ·{" "}
            {currentMembership.organization.organizationTypeCode} · {currentMembership.roleName}
          </p>
        </Card>
      )}
    </>
  );
}
