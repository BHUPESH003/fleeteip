import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";

export interface FilterChipProps {
  label: ReactNode;
  /** Monospace label, for references and codes. */
  mono?: boolean;
  onRemove: () => void;
}

/** One applied list filter, removable. Sits in the row above a table. */
export function FilterChip({ label, mono, onRemove }: FilterChipProps) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-cell border border-accent-wash-border bg-accent-wash pl-2.5 pr-0.5 text-xs font-medium text-ink-strong",
        mono && "font-mono",
      )}
    >
      {label}
      <IconButton
        icon="close"
        label={`Remove filter: ${typeof label === "string" ? label : "this filter"}`}
        variant="ghost"
        size="sm"
        iconSize={12}
        noTooltip
        className="!h-6 !w-6"
        onClick={onRemove}
      />
    </span>
  );
}
