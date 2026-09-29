"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { KeyFiguresSkeleton, Skeleton } from "@fleetip/ui";
import { useParams } from "next/navigation";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { useSession } from "../../../../lib/session-context";
import { useLoad } from "../../../../lib/use-load";
import { loadQuotation, type QuotationAccess, type QuotationDetailData } from "./data";
import { QuotationView } from "./QuotationView";

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const viewer = organizationType === OrganizationTypeCode.rental_company ? "rental_company" : "renter";
  const canView = viewer === "rental_company" ? hasPermission("quotation.manage") : hasPermission("quotation.respond");

  // Every lookup beyond the quotation itself is enrichment, gated on its own
  // permission (docs/decisions.md: ancillary permissions must never block
  // the page) — the page's purpose is quotation.manage / quotation.respond.
  const access: QuotationAccess = {
    machines: hasPermission("equipment.manage"),
    workOrders: hasPermission("rental.manage") || hasPermission("rental.respond"),
    requirementAsRenter: hasPermission("rfq.manage"),
    requirementAsCompany: hasPermission("rfq.respond"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload, setData } = useLoad<QuotationDetailData>(
    () => loadQuotation(organizationId!, id, viewer, access),
    [organizationId, id, viewer, accessKey],
    Boolean(organizationId && organizationType) && canView,
  );

  if (currentMembership && !canView) {
    return <ForbiddenPage what="quotations" permissionHint="Viewing quotations needs the Quotations permission." />;
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this quotation",
          body:
            viewer === "renter"
              ? "It may not have been sent to you yet — drafts stay with the rental company until they send them — or the link is wrong."
              : "It may belong to a different organization, or the link is wrong. Quotations are never deleted.",
        }}
        forbidden={{ what: "quotations", permissionHint: "Viewing quotations needs the Quotations permission." }}
        serverTitle="This quotation didn't load"
        backHref="/quotations"
        backLabel="Back to quotations"
      />
    );
  }
  if (loading || !data || !organizationId) return <QuotationDetailSkeleton />;

  // Keyed by id: dialogs and scroll targets reset when another quotation opens.
  return (
    <QuotationView
      key={id}
      data={data}
      organizationId={organizationId}
      reload={reload}
      patch={(update) => setData((previous) => (previous ? update(previous) : previous))}
    />
  );
}

function QuotationDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading quotation" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-[18px] pt-4 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[180px]" />
        <div className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[200px] max-w-[80%]" />
            <Skeleton className="h-3 w-[420px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[150px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[18px] max-[760px]:px-4">
        <KeyFiguresSkeleton count={4} />
        <div className="flex flex-wrap gap-3.5">
          <div className="h-[420px] min-w-0 flex-[1_1_560px] rounded-panel border border-border-soft bg-surface" />
          <div className="h-[420px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[400px]" />
        </div>
        <span role="status" className="text-xs text-meta">
          Loading quotation…
        </span>
      </div>
    </div>
  );
}
