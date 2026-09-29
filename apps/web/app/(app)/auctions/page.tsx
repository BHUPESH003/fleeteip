"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { useSearchParams } from "next/navigation";
import { ForbiddenPage } from "../../../components/PageStates";
import { useSession } from "../../../lib/session-context";
import { ListPageSkeleton } from "../requirements/list-kit";
import { AuctionList } from "./AuctionList";
import { BidderAuctionView } from "./BidderAuctionView";
import { RenterAuctionView } from "./RenterAuctionView";

/**
 * /auctions is the list; /auctions?auctionId= and/or ?requirementId= open
 * one auction (there's no /auctions/[id] route — notifications and the
 * dashboards link with these params). The params are read from the URL on
 * every render, and the auction view is keyed by them, so a notification
 * for another auction resets it instead of showing stale state.
 *
 * Renter (auction.manage) runs auctions on its own requirements; Rental
 * Company (auction.participate) asks to join and bids. A participant's
 * view never includes the competitor roster — the server enforces it
 * (getAuctionDetail 404s for a non-participant and withholds names).
 */
export default function AuctionsPage() {
  const { currentMembership, hasPermission } = useSession();
  const searchParams = useSearchParams();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const requirementId = searchParams.get("requirementId");
  const auctionId = searchParams.get("auctionId");

  if (!organizationId || !organizationType) return <ListPageSkeleton label="Loading auctions" columns={7} />;
  const isRenter = organizationType === OrganizationTypeCode.renter;
  const canView = isRenter ? hasPermission("auction.manage") : hasPermission("auction.participate");
  if (!canView) {
    return (
      <ForbiddenPage
        what="auctions"
        permissionHint={isRenter ? "Running auctions needs the Auctions permission." : "Joining and bidding in auctions needs the Auctions permission."}
      />
    );
  }

  if (requirementId || auctionId) {
    const key = `${requirementId ?? ""}|${auctionId ?? ""}`;
    return isRenter ? (
      <RenterAuctionView key={key} organizationId={organizationId} requirementId={requirementId} auctionId={auctionId} />
    ) : (
      <BidderAuctionView key={key} organizationId={organizationId} requirementId={requirementId} auctionId={auctionId} />
    );
  }
  return <AuctionList organizationId={organizationId} viewer={isRenter ? "renter" : "rental_company"} />;
}
