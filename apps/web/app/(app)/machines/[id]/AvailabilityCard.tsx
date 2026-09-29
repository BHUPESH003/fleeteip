"use client";

import { AvailabilityLaneLegend, LaneChart, SegmentedControl, type LaneBlock } from "@fleetip/ui";
import { useId } from "react";
import { formatShortDate } from "../../../../lib/format";
import type { LaneModel, LaneView } from "./derive";

/**
 * Availability lanes: rentals, workshop, transport markers and (90-day,
 * active rental) logsheet ticks on one scale. Blocks open the record
 * drawer. Dragging to change dates isn't offered — there's no date-change
 * operation yet (backend ticket j).
 */
export function AvailabilityCard({
  model,
  view,
  onViewChange,
  today,
  selectedKey,
  onSelect,
}: {
  model: LaneModel;
  view: LaneView;
  onViewChange: (view: LaneView) => void;
  today: string;
  selectedKey: string | null;
  onSelect: (block: LaneBlock) => void;
}) {
  const headingId = useId();
  const hasLogs = model.lanes.some((lane) => lane.key === "logsheets");
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2.5 rounded-panel border border-border-strong bg-surface px-4 pb-3 pt-3.5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id={headingId} className="m-0 text-sm font-semibold leading-none text-ink">
          Availability
        </h2>
        <span className="text-xs leading-none text-meta">{model.label}</span>
        <SegmentedControl
          className="ml-auto"
          label="Time range"
          value={view}
          onChange={(v) => onViewChange(v as LaneView)}
          options={[
            { value: "90", label: "90 days" },
            { value: "12m", label: "12 months" },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <LaneChart
            windowStart={model.windowStart}
            windowDays={model.windowDays}
            today={today}
            months={model.months}
            lanes={model.lanes}
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        </div>
      </div>
      <AvailabilityLaneLegend
        className="pt-0.5"
        items={[
          { label: "On rent", kind: "rental_active" },
          { label: "Booked", kind: "rental_confirmed" },
          { label: "Past rental", kind: "rental_completed" },
          { label: "Workshop", kind: "workshop_in_progress" },
          ...(hasLogs
            ? [
                { label: "Logged · hollow = not confirmed", kind: "tick_confirmed" as const },
                { label: "No logsheet", kind: "tick_missing" as const },
              ]
            : []),
        ]}
        todayLabel={`Today, ${formatShortDate(today)}`}
        trailing="Select a block to see the record"
      />
    </section>
  );
}
