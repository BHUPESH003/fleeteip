import type { StatusMap } from "@fleetip/ui";

// customerConfirmed is a plain boolean on the contract, not an enum — mapped
// to string keys here so it renders through the same StatusBadge every other
// status in the app uses, rather than an ad-hoc <Badge> one-off.
export const LOGSHEET_CONFIRMED_MAP: StatusMap = {
  confirmed: { label: "Confirmed", tone: "success" },
  unconfirmed: { label: "Unconfirmed", tone: "neutral" },
};
