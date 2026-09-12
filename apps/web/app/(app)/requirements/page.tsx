"use client";

import { LoadingState } from "@fleetip/ui";
import { useSearchParams } from "next/navigation";
import { useSession } from "../../../lib/session-context";
import { OpenMarket } from "./OpenMarket";
import { RenterRequirementsList } from "./RenterRequirementsList";

export default function RequirementsPage() {
  const { currentMembership } = useSession();
  const searchParams = useSearchParams();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const highlightedRequirementId = searchParams.get("requirementId");

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;

  return organizationType === "renter" ? (
    <RenterRequirementsList organizationId={organizationId} />
  ) : (
    <OpenMarket organizationId={organizationId} highlightedRequirementId={highlightedRequirementId} />
  );
}
