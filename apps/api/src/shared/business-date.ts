import { BUSINESS_TIME_ZONE as DEFAULT_BUSINESS_TIME_ZONE, isoDateInTimeZone } from "@fleetip/contracts/shared";

// One business timezone for every date-only "today" on the server (risk
// register §2.5). Read straight from process.env rather than importing
// config/env.ts so pure services and tests don't need DATABASE_URL; env.ts
// validates the same variable at startup.
export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE;

// "YYYY-MM-DD" for the business day `now` falls on.
export function todayInBusinessZone(now: Date = new Date()): string {
  return isoDateInTimeZone(BUSINESS_TIME_ZONE, now);
}
