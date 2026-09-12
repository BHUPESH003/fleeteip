import { Badge, type BadgeTone } from "./Badge";

export interface StatusMapEntry {
  label: string;
  tone: BadgeTone;
}

export type StatusMap = Record<string, StatusMapEntry>;

export interface StatusBadgeProps {
  status: string;
  map: StatusMap;
  className?: string;
}

/**
 * Thin wrapper over Badge driven by a per-domain {status: {label, tone}}
 * map defined at the call site — keeps FleetIP's status vocabularies out
 * of @fleetip/ui while retiring the copy-pasted STATUS_LABEL/STATUS_BADGE
 * objects duplicated per page.
 */
export function StatusBadge({ status, map, className }: StatusBadgeProps) {
  const entry = map[status];
  return (
    <Badge tone={entry?.tone ?? "neutral"} className={className}>
      {entry?.label ?? status}
    </Badge>
  );
}
