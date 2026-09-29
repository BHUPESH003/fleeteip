"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { ForbiddenPage } from "../../../components/PageStates";
import { useSession } from "../../../lib/session-context";
import { ListPageSkeleton } from "./list-kit";
import { OpenMarket } from "./OpenMarket";
import { RenterRequirementsList } from "./RenterRequirementsList";

/**
 * One route, two screens: a Renter (rfq.manage) sees its own posted
 * requirements; a Rental Company (rfq.respond) sees the Open Market.
 * listRequirements is rfq.manage-only, so a Rental Company never calls it —
 * it browses via discoverRequirements instead.
 */
export default function RequirementsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;

  if (!organizationId || !organizationType) return <ListPageSkeleton label="Loading requirements" columns={7} />;

  if (organizationType === OrganizationTypeCode.renter) {
    if (!hasPermission("rfq.manage")) {
      return (
        <ForbiddenPage what="requirements" permissionHint="Posting and viewing your organization's requirements needs the Requirements permission." />
      );
    }
    return <RenterRequirementsList organizationId={organizationId} />;
  }

  if (!hasPermission("rfq.respond")) {
    return <ForbiddenPage what="the open market" permissionHint="Browsing and responding to requirements needs the Open market permission." />;
  }
  return <OpenMarket organizationId={organizationId} />;
}
