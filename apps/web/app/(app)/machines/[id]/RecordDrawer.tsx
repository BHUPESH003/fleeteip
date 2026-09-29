"use client";

import { TransportLeg } from "@fleetip/contracts/transport";
import { DescriptionList, Drawer, Icon, UILink } from "@fleetip/ui";
import {
  daysBetween,
  formatDate,
  formatMoney,
  formatRateUnit,
  plural,
  rentalRef,
} from "../../../../lib/format";
import { Status } from "../../../../lib/status";
import { MAINTENANCE_TYPE_LABEL } from "../shared";
import { customerName, type MachineData } from "./derive";

export type RecordSelection = { kind: "rental" | "maintenance" | "transport"; id: string };

/** Right drawer with a lane block's record; links to the record's own page. */
export function RecordDrawer({
  data,
  selection,
  onClose,
}: {
  data: MachineData;
  selection: RecordSelection | null;
  onClose: () => void;
}) {
  if (!selection) return null;
  const linkClass =
    "inline-flex items-center gap-1.5 text-sm font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

  if (selection.kind === "rental") {
    const r = data.rentals.find((x) => x.id === selection.id);
    if (!r) return null;
    const customer = customerName(r, data.customerNames);
    return (
      <Drawer open onClose={onClose} kicker="Rental" title={`${rentalRef(r.id)} · ${customer}`}>
        <div className="flex flex-col gap-3.5 px-[18px] py-4">
          <div className="flex flex-wrap gap-2">
            <Status domain="rental" value={r.status} />
            {r.actualDatesVerificationStatus && <Status domain="actual_dates" value={r.actualDatesVerificationStatus} />}
          </div>
          <DescriptionList
            layout="grid"
            minColumnWidth={320}
            items={[
              { label: "Customer", value: `${customer}${r.clientSnapshot ? " (not on FleetIP)" : ""}` },
              { label: "Project", value: r.projectName, emptyText: "Not recorded" },
              { label: "Site", value: r.projectLocation, emptyText: "Not recorded" },
              { label: "Start date", value: formatDate(r.startDate), mono: true },
              { label: "End date", value: r.endDate ? formatDate(r.endDate) : "Open-ended", mono: true },
              { label: "Actual start", value: r.actualStartDate ? formatDate(r.actualStartDate) : null, mono: true, emptyText: "Not recorded" },
              { label: "Actual end", value: r.actualEndDate ? formatDate(r.actualEndDate) : null, mono: true, emptyText: "Not recorded" },
              { label: "Rate", value: `${formatMoney(r.rate)} ${formatRateUnit(r.rateUnit)}`, mono: true },
            ]}
          />
          <UILink href={`/rentals/${r.id}`} className={linkClass}>
            Open {rentalRef(r.id)} <Icon name="external" size={13} />
          </UILink>
        </div>
      </Drawer>
    );
  }

  if (selection.kind === "maintenance") {
    const m = data.maintenance.find((x) => x.id === selection.id);
    if (!m) return null;
    return (
      <Drawer open onClose={onClose} kicker="Workshop record" title={`${MAINTENANCE_TYPE_LABEL[m.maintenanceType]} · ${formatDate(m.startDate)}`}>
        <div className="flex flex-col gap-3.5 px-[18px] py-4">
          <div>
            <Status domain="maintenance" value={m.status} />
          </div>
          <DescriptionList
            layout="grid"
            minColumnWidth={320}
            items={[
              { label: "From", value: formatDate(m.startDate), mono: true },
              { label: "Until", value: m.endDate ? formatDate(m.endDate) : null, emptyText: "No end date set", mono: true },
              { label: "Notes", value: m.notes, emptyText: "No notes" },
              { label: "Recorded", value: formatDate(m.createdAt), mono: true },
            ]}
          />
          <UILink href={`/maintenance/${m.id}?machineId=${data.machine.id}`} className={linkClass}>
            Open in Maintenance <Icon name="external" size={13} />
          </UILink>
        </div>
      </Drawer>
    );
  }

  const t = data.transport.find((x) => x.id === selection.id);
  if (!t) return null;
  const late = t.actualDate && t.plannedDate ? daysBetween(t.plannedDate, t.actualDate) : null;
  return (
    <Drawer
      open
      onClose={onClose}
      kicker={`Transport · ${t.leg === TransportLeg.mobilization ? "mobilization" : "demobilization"}`}
      title={`${t.leg === TransportLeg.mobilization ? "Mobilization" : "Demobilization"} · ${rentalRef(t.rentalId)}`}
    >
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <div>
          <Status domain="transport" value={t.status} />
        </div>
        <DescriptionList
          layout="grid"
          minColumnWidth={320}
          items={[
            { label: "Planned", value: t.plannedDate ? formatDate(t.plannedDate) : null, mono: true },
            { label: "Actual", value: t.actualDate ? formatDate(t.actualDate) : null, mono: true, emptyText: "Not done yet" },
            {
              label: "Late by",
              value: late === null ? null : late === 0 ? "On plan" : late > 0 ? plural(late, "day") : `${plural(-late, "day")} early`,
              mono: true,
              emptyText: "—",
            },
            { label: "From", value: t.pickupLocation },
            { label: "To", value: t.destination },
            { label: "Charges", value: t.charges != null ? formatMoney(t.charges) : null, mono: true },
            { label: "Vehicle / details", value: t.transportDetails },
          ]}
        />
        <UILink href={`/transport/${t.id}?rentalId=${t.rentalId}`} className={linkClass}>
          Open in Transport <Icon name="external" size={13} />
        </UILink>
      </div>
    </Drawer>
  );
}
