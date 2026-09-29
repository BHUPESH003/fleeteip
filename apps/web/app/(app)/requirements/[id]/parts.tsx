"use client";

import type { Requirement } from "@fleetip/contracts/rfq";
import { DescriptionList, KeyFiguresSkeleton, Panel, Skeleton } from "@fleetip/ui";
import { formatDate, formatDateTime, formatNumber } from "../../../../lib/format";
import {
  CREW_LABEL,
  SHIFT_PATTERN_LABEL,
  capacityText,
  durationLabel,
  type SubcategoryEntry,
} from "../shared";

export interface ActivityItem {
  id: string;
  text: string;
  when: string;
}

/** Every field of the requirement, in the order a rental company reads them. Nulls read "Not specified". */
export function RequirementFacts({ requirement, entry }: { requirement: Requirement; entry: SubcategoryEntry | null }) {
  return (
    <Panel title="Requirement details" padding="md">
      <DescriptionList
        layout="rows"
        items={[
          { label: "Equipment type", value: entry?.subcategory.name, emptyText: "Not found in the catalogue" },
          { label: "Category", value: entry?.category?.name },
          { label: "Capacity", value: capacityText(requirement), mono: true },
          { label: "Boom length", value: requirement.boomLength ? `${formatNumber(requirement.boomLength, 2)} m` : null, mono: true },
          { label: "Quantity", value: `${formatNumber(requirement.quantity, 0)} ${requirement.quantity === 1 ? "machine" : "machines"}`, mono: true },
          { label: "Project", value: requirement.projectName },
          { label: "Site", value: requirement.projectLocation },
          { label: "Needed from", value: formatDate(requirement.requestedStartDate), mono: true },
          { label: "Expected duration", value: durationLabel(requirement.expectedDurationValue, requirement.expectedDurationUnit) },
          { label: "Shift pattern", value: requirement.shiftPattern ? SHIFT_PATTERN_LABEL[requirement.shiftPattern] : null },
          { label: "Crew", value: requirement.crewRequirement ? CREW_LABEL[requirement.crewRequirement] : null },
          { label: "Shift notes", value: requirement.shiftRequirement },
          { label: "Responses until", value: formatDate(requirement.validityDate), mono: true },
          { label: "Posted", value: formatDateTime(requirement.createdAt), mono: true },
        ]}
      />
      <div className="mt-3 border-t border-border pt-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">Notes</span>
        <p className="m-0 whitespace-pre-line text-sm leading-[1.5] text-ink-strong">
          {requirement.notes ?? <span className="italic text-disabled-text">Not specified</span>}
        </p>
      </div>
    </Panel>
  );
}

/** Notifications about this requirement — FleetIP keeps no separate activity log. */
export function ActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <Panel title="Activity" subtitle="from your notifications" padding="md">
      {items.length === 0 ? (
        <p className="m-0 text-xs leading-[1.5] text-ink-soft">Nothing yet. Replies and requests about this requirement show up here.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <span className="text-xs leading-[1.45] text-ink-strong">{item.text}</span>
              <span className="text-[11px] text-meta-light">{item.when}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Matches the final layout (header, figures, two columns) so nothing jumps on load. */
export function RequirementDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading requirement" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-[18px] pt-4 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[180px]" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-[52px] w-[52px] rounded-control" />
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[220px] max-w-[80%]" />
            <Skeleton className="h-3 w-[420px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[150px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[18px] max-[760px]:px-4">
        <KeyFiguresSkeleton count={5} />
        <div className="flex flex-wrap gap-3.5">
          <div className="h-[320px] min-w-0 flex-[1_1_560px] rounded-panel border border-border-soft bg-surface" />
          <div className="h-[320px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[380px]" />
        </div>
        <span role="status" className="text-xs text-meta">
          Loading requirement…
        </span>
      </div>
    </div>
  );
}
