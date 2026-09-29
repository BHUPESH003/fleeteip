"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { useParams } from "next/navigation";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { useSession } from "../../../../lib/session-context";
import { useLoad } from "../../../../lib/use-load";
import { RentalCompanyRequirementView } from "./CompanyView";
import { loadRenterDetail, loadRentalCompanyDetail, type DetailAccess, type RequirementDetail } from "./data";
import { RequirementDetailSkeleton } from "./parts";
import { RenterRequirementView } from "./RenterView";

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  // Tenant isolation: a Rental Company reads the requirement through
  // discovery (rfq.respond) and sees only its own reply — never the
  // Renter's table of every company's response (names + rates). See
  // data.ts for both loaders.
  const isRentalCompany = organizationType === OrganizationTypeCode.rental_company;
  const canView = isRentalCompany ? hasPermission("rfq.respond") : hasPermission("rfq.manage");

  const access: DetailAccess = {
    quotationsRenter: hasPermission("quotation.respond"),
    auctionsRenter: hasPermission("auction.manage"),
    quotationsCompany: hasPermission("quotation.manage"),
    auctionsCompany: hasPermission("auction.participate"),
    machines: hasPermission("equipment.manage"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload, setData } = useLoad<RequirementDetail>(
    () => (isRentalCompany ? loadRentalCompanyDetail(organizationId!, id, access) : loadRenterDetail(organizationId!, id, access)),
    [organizationId, id, isRentalCompany, accessKey],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return isRentalCompany ? (
      <ForbiddenPage what="the open market" permissionHint="Viewing requirements posted by renters needs the Open market permission." />
    ) : (
      <ForbiddenPage what="requirements" permissionHint="Viewing your organization's requirements needs the Requirements permission." />
    );
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this requirement",
          body: isRentalCompany
            ? "It may have been removed from the Open Market, or the link is wrong."
            : "It may belong to a different organization, or the link is wrong. Requirements are never deleted — a closed one would still open.",
        }}
        forbidden={{ what: "requirements", permissionHint: "Viewing requirements needs the Requirements permission." }}
        serverTitle="This requirement didn't load"
        backHref="/requirements"
        backLabel={isRentalCompany ? "Back to the open market" : "Back to requirements"}
      />
    );
  }
  if (loading || !data || !organizationId) return <RequirementDetailSkeleton />;

  // Keyed by id: dialogs and per-row state reset when another requirement opens.
  return data.kind === "renter" ? (
    <RenterRequirementView
      key={id}
      data={data}
      organizationId={organizationId}
      reload={reload}
      onRequirementChanged={(requirement) => setData((previous) => (previous && previous.kind === "renter" ? { ...previous, requirement } : previous))}
    />
  ) : (
    <RentalCompanyRequirementView
      key={id}
      data={data}
      organizationId={organizationId}
      onResponseSaved={(myResponse) =>
        setData((previous) => (previous && previous.kind === "rental_company" ? { ...previous, myResponse } : previous))
      }
    />
  );
}
