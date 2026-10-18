"use client";

import type { WorkOrder } from "@fleetip/contracts/work-order";
import { Button, Dialog, FormBanner, Input } from "@fleetip/ui";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { useAction } from "../../../../lib/form";

/** Records the customer's own work order / PO number and date against this work order. Empty clears it. */
export function CustomerOrderDialog({
  open,
  onClose,
  organizationId,
  workOrder,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  workOrder: WorkOrder;
  onDone: () => void;
}) {
  const action = useAction();
  const { online } = useConnection();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setNumber(workOrder.customerWorkOrderNumber ?? "");
    setDate(workOrder.customerWorkOrderDate ?? "");
  }, [open, workOrder.customerWorkOrderNumber, workOrder.customerWorkOrderDate]);

  const save = () =>
    action.run(
      () => apiClient.updateCustomerWorkOrder(organizationId, workOrder.id, { customerWorkOrderNumber: number.trim(), customerWorkOrderDate: date }),
      {
        failTitle: "The customer's work order wasn't saved",
        success: () => ({ title: "Customer work order saved", body: "It now prints on the work order, timesheets and invoices." }),
        onDone: () => {
          onDone();
          onClose();
        },
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Customer's own work order"
      description="Customers usually issue their own work order or PO. Enter its number and date so they print on this work order, the timesheets and the invoices."
      icon="work_order"
      size="md"
      dismissible={!action.busy}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={action.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={action.busy} busyLabel="Saving…" disabled={!online}>
            Save
          </Button>
        </>
      }
    >
      {action.banner && (
        <FormBanner tone="error" title={action.banner.title}>
          {action.banner.body}
        </FormBanner>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Work order / PO number" maxLength={100} value={number} onChange={(event) => setNumber(event.target.value)} hint="Leave empty to clear." />
        <Input label="Dated" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
    </Dialog>
  );
}
