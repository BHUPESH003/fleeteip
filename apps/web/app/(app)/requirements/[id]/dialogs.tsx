"use client";

import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import { ConfirmDialog, FormBanner } from "@fleetip/ui";
import { useEffect } from "react";
import { apiClient } from "../../../../lib/api-client";
import { useAction } from "../../../../lib/form";
import { requirementRef } from "../shared";

/**
 * open → closed | cancelled (requirement-status.ts; both final). Nothing
 * cascades: RequirementService.updateRequirementStatus only writes the
 * status. Discovery lists open requirements only, and submitResponse /
 * createQuotation / createAuction all refuse a requirement that isn't open;
 * acceptQuotation and awardQuotation don't check it, and placeBid doesn't
 * either — so quotations and a running auction carry on.
 */
export function RequirementStatusDialog({
  open,
  organizationId,
  requirement,
  equipmentLabel,
  to,
  openQuotations,
  runningAuctions,
  onClose,
  onChanged,
}: {
  open: boolean;
  organizationId: string;
  requirement: Requirement;
  equipmentLabel: string;
  to: Exclude<RequirementStatus, typeof RequirementStatus.open>;
  /** Received quotations still sent/negotiating (null when the role can't list them). */
  openQuotations: number | null;
  /** Auctions still scheduled or live (null when the role can't list them). */
  runningAuctions: number | null;
  onClose: () => void;
  onChanged: (requirement: Requirement) => void;
}) {
  const action = useAction();
  const { clear } = action;
  const closing = to === RequirementStatus.closed;

  useEffect(() => {
    if (open) clear();
    // ponytail: `clear` isn't memoised in lib/form.ts, so it can't be a dep (it would wipe the banner on every render).
  }, [open]);
  const ref = requirementRef(requirement.id);

  async function confirm() {
    await action.run(() => apiClient.updateRequirementStatus(organizationId, requirement.id, to) as Promise<Requirement>, {
      failTitle: `${ref} wasn't ${closing ? "closed" : "cancelled"}`,
      success: () => ({
        title: `${ref} ${closing ? "closed" : "cancelled"}`,
        body: "It's no longer in the Open Market. Quotations already received are unchanged.",
      }),
      onDone: (updated) => {
        onChanged(updated);
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon={closing ? "check" : "close"}
      tone={closing ? "neutral" : "danger"}
      title={closing ? `Close requirement ${ref}?` : `Cancel requirement ${ref}?`}
      description={`${equipmentLabel}${requirement.projectName ? ` · ${requirement.projectName}` : ""}`}
      consequences={[
        closing
          ? "Use Close when you have what you need. Its status changes to Closed."
          : "Use Cancel when the work isn't going ahead. Its status changes to Cancelled.",
        "It leaves the Open Market. Rental companies can't respond to it or send new quotations against it.",
        openQuotations === null
          ? "Quotations you've already received aren't changed — you can still accept them."
          : openQuotations > 0
            ? `${openQuotations} ${openQuotations === 1 ? "quotation is" : "quotations are"} still open and aren't changed — you can still accept or reject ${openQuotations === 1 ? "it" : "them"}.`
            : "No quotation on it is waiting for an answer.",
        runningAuctions
          ? `${runningAuctions} running ${runningAuctions === 1 ? "auction isn't" : "auctions aren't"} stopped. Close or cancel ${runningAuctions === 1 ? "it" : "them"} on the Auctions page.`
          : "Auctions aren't affected.",
        "This is final — a requirement can't be reopened. Post a new one if you need it again.",
      ]}
      cancelLabel={closing ? "Keep it open" : "Keep requirement"}
      confirmLabel={closing ? "Close requirement" : "Cancel requirement"}
      busyLabel={closing ? "Closing…" : "Cancelling…"}
      confirmVariant={closing ? "primary" : "danger"}
      busy={action.busy}
    >
      {action.banner && (
        <FormBanner tone="error" title="Nothing was changed">
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}
