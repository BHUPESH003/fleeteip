"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { EmptyState, PageBody, PageHeader } from "@fleetip/ui";
import { useSession } from "../../lib/session-context";
import { DashboardSkeleton } from "./dashboard/shared";
import { RentalCompanyDashboard } from "./dashboard/RentalCompanyDashboard";
import { RenterDashboard } from "./dashboard/RenterDashboard";

export default function DashboardPage() {
  const { session, currentMembership } = useSession();

  // Signed in but in no organization (every membership removed): say so
  // instead of waiting on a membership that will never arrive.
  if (session && session.memberships.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Welcome to FleetIP" />
        <PageBody>
          <EmptyState
            variant="page"
            icon="organization"
            title="Your account isn't part of an organization yet"
            description="Open the invite link an organization admin sent you to join their organization. Each link works once and expires after 7 days."
          />
        </PageBody>
      </div>
    );
  }

  if (!currentMembership) return <DashboardSkeleton header={<PageHeader title="Overview" />} />;

  return currentMembership.organization.organizationTypeCode === OrganizationTypeCode.renter ? (
    <RenterDashboard />
  ) : (
    <RentalCompanyDashboard />
  );
}
