import { Badge, type BadgeSize, type BadgeTone, type BadgeVariant } from "./Badge";

export interface StatusMapEntry {
  label: string;
  tone: BadgeTone;
}

export type StatusMap = Record<string, StatusMapEntry>;

export interface StatusBadgeProps {
  status: string;
  map: StatusMap;
  size?: BadgeSize;
  variant?: BadgeVariant;
  /** Hover text; defaults to "<status>" so a chip always explains itself. */
  title?: string;
  className?: string;
}

/**
 * Badge driven by a per-domain {status: {label, tone}} map defined by the
 * app (apps/web/lib/status.tsx) — keeps FleetIP's status vocabularies out
 * of @fleetip/ui. Unknown values fall back to the raw value in gray rather
 * than inventing a label.
 */
export function StatusBadge({ status, map, size, variant, title, className }: StatusBadgeProps) {
  const entry = map[status];
  return (
    <Badge
      tone={entry?.tone ?? "neutral"}
      size={size}
      variant={variant}
      title={title}
      className={className}
    >
      {entry?.label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
