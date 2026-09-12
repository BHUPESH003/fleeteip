"use client";

import { LoadingState } from "@fleetip/ui";
import { useSession } from "../../lib/session-context";
import { RentalCompanyDashboard } from "./dashboard/RentalCompanyDashboard";
import { RenterDashboard } from "./dashboard/RenterDashboard";

export default function DashboardPage() {
  const { currentMembership } = useSession();

  if (!currentMembership) return <LoadingState label="Loading dashboard…" />;

  return currentMembership.organization.organizationTypeCode === "renter" ? (
    <RenterDashboard />
  ) : (
    <RentalCompanyDashboard />
  );
}
