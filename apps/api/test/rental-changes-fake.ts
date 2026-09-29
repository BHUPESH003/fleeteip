import type { RentalChangeRepositoryPort } from "../src/modules/marketplace/rental/domain/ports.js";

/**
 * RentalService's 7th dependency for tests that don't exercise date
 * changes or the activity log: events are dropped (logging is best-effort),
 * anything else throws. rental-date-change.test.ts has the real fake.
 */
export function fakeRentalChanges(): RentalChangeRepositoryPort {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  return {
    proposeDateChange: unused,
    clearDateChange: unused,
    changeDates: unused,
    correctActualDates: unused,
    recordEvent: async () => {},
    listEvents: async () => [],
  };
}
