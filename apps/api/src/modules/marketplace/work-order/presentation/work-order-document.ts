import type { WorkOrder, WorkOrderScopeItem } from "@fleetip/contracts/work-order";

/**
 * Renders a Work Order as a printable HTML document — the browser's own
 * print-to-PDF is the deliverable "printable document" (brief §10); no PDF
 * library dependency added for this. `@media print` keeps it clean when
 * actually printed; on screen it's a plain, readable document.
 */
function row(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderWorkOrderDocument(
  workOrder: WorkOrder,
  scopeItems: WorkOrderScopeItem[],
  rentalCompanyName: string,
  customerName: string,
): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Work Order ${escapeHtml(workOrder.referenceNumber)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 780px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .subtitle { color: #555; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  th { text-align: left; width: 40%; padding: 4px 8px 4px 0; color: #555; font-weight: normal; vertical-align: top; }
  td { padding: 4px 0; }
  .party-grid { display: flex; gap: 32px; margin-top: 8px; }
  .party { flex: 1; font-size: 13px; }
  .party-label { font-size: 11px; text-transform: uppercase; color: #888; }
  .signatures { display: flex; gap: 40px; margin-top: 56px; }
  .signature { flex: 1; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; color: #555; }
  .status { display: inline-block; font-size: 11px; text-transform: uppercase; padding: 2px 8px; border: 1px solid #999; border-radius: 3px; margin-left: 8px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Work Order ${escapeHtml(workOrder.referenceNumber)}<span class="status">${escapeHtml(workOrder.status)}</span></h1>
  <p class="subtitle">Finalized commercial order — generated from the awarded quotation, ${new Date(workOrder.createdAt).toLocaleDateString()}</p>

  <div class="party-grid">
    <div class="party">
      <div class="party-label">Rental Company</div>
      <div>${escapeHtml(rentalCompanyName)}</div>
    </div>
    <div class="party">
      <div class="party-label">Renter / Customer</div>
      <div>${escapeHtml(customerName)}</div>
    </div>
  </div>

  <h2>Equipment &amp; schedule</h2>
  <table>
    ${row("Machine", workOrder.machineAssetCode)}
    ${row("Product", workOrder.productName)}
    ${row("Project", workOrder.projectCode)}
    ${row("Start date", workOrder.startDate)}
    ${row("End date", workOrder.endDate ?? "Open-ended")}
  </table>

  <h2>Commercial terms</h2>
  <table>
    ${row("Rate", `${workOrder.rate} / ${workOrder.rateUnit}`)}
    ${row("Mobilization charge", workOrder.mobilizationCharge)}
    ${row("Demobilization charge", workOrder.demobilizationCharge)}
    ${row("Overtime rate", workOrder.overtimeRate)}
    ${row("Payment terms", workOrder.paymentTerms)}
    ${row(
      "Minimum rental period",
      workOrder.minimumRentalPeriodValue
        ? `${workOrder.minimumRentalPeriodValue} ${workOrder.minimumRentalPeriodUnit}(s)`
        : null,
    )}
    ${row("GST terms", workOrder.gstTerms)}
  </table>

  <h2>Working &amp; responsibility terms</h2>
  <table>
    ${row("Shift structure", workOrder.shiftStructure)}
    ${row("Working hours / shift", workOrder.workingHours)}
    ${row("Working days / week", workOrder.workingDaysPerWeek)}
    ${row("Sunday condition", workOrder.sundayCondition)}
    ${row("Operator scope", workOrder.operatorScope?.replace(/_/g, " "))}
    ${row("Fuel norms", workOrder.fuelNorms)}
    ${row("Fuel scope", workOrder.fuelScope)}
    ${row("Accommodation scope", workOrder.accommodationScope)}
    ${row("Notice / de-hire period", workOrder.noticePeriodDays ? `${workOrder.noticePeriodDays} days` : null)}
    ${row("De-hire terms", workOrder.dehireTerms)}
  </table>

  ${
    scopeItems.length > 0
      ? `<h2>Category-specific responsibilities</h2><table>${scopeItems
          .map((item) => row(item.item, `${item.responsibleParty}${item.notes ? ` — ${item.notes}` : ""}`))
          .join("")}</table>`
      : ""
  }

  <h2>Terms &amp; conditions</h2>
  <table>
    ${row("Special / site conditions", workOrder.commercialNotes)}
    ${row("Company-specific T&Cs", workOrder.companyTerms)}
  </table>

  <div class="signatures">
    <div class="signature">Rental Company signature</div>
    <div class="signature">Renter / Customer signature</div>
  </div>
</body>
</html>`;
}
