import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { updateRentalTermsRequestSchema } from "@fleetip/contracts/rental";
import { updateTransportRequestSchema } from "@fleetip/contracts/transport";
import type { MachineRepositoryPort } from "../src/modules/equipment/domain/ports.js";
import type { MaintenanceRecord, MaintenanceRepositoryPort } from "../src/modules/maintenance/domain/ports.js";
import type {
  RecordRentalEventInput,
  RentalChangeRepositoryPort,
  RentalEventRecord,
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import { RentalService } from "../src/modules/marketplace/rental/application/rental-service.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import type {
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

// ponytail: partial fakes cast to the port — only the methods these tests
// reach are implemented, so other agents' port additions don't break this file.
function stub<T>(impl: Partial<T>): T {
  return impl as T;
}

const RC = "org-rc";
const OTHER_RC = "org-rc-2";
const RENTER = "org-renter";
const OTHER_RENTER = "org-renter-2";
const ORG_TYPES: Record<string, OrganizationTypeCode> = {
  [RC]: "rental_company",
  [OTHER_RC]: "rental_company",
  [RENTER]: "renter",
  [OTHER_RENTER]: "renter",
};
const ORG_NAMES: Record<string, string> = {
  [RC]: "Apex Rentals",
  [OTHER_RC]: "Other Rentals",
  [RENTER]: "Metro Builders",
  [OTHER_RENTER]: "Other Builders",
};

function rental(overrides: Partial<RentalRecord> = {}): RentalRecord {
  return {
    id: "rental-1",
    rental_company_organization_id: RC,
    renter_organization_id: RENTER,
    client_snapshot: null,
    machine_id: "machine-1",
    status: "confirmed",
    project_name: "Tower",
    project_location: "Site A",
    start_date: "2099-03-01",
    end_date: "2099-03-10",
    rate: 5000,
    rate_unit: "day",
    mobilization_charge: 100,
    demobilization_charge: null,
    payment_terms: "30 days",
    shift_structure: null,
    overtime_rate: null,
    sunday_condition: null,
    fuel_norms: null,
    operator_scope: null,
    notice_period_days: null,
    dehire_terms: null,
    actual_start_date: null,
    actual_end_date: null,
    actual_dates_verification_status: null,
    actual_dates_dispute_reason: null,
    proposed_start_date: null,
    proposed_end_date: null,
    date_change_reason: null,
    date_change_proposed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function overlaps(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) {
  return aStart <= (bEnd ?? "9999-12-31") && bStart <= (aEnd ?? "9999-12-31");
}

function build(seed: RentalRecord[], jobs: Array<Pick<MaintenanceRecord, "id" | "machine_id" | "start_date" | "end_date" | "rental_id">> = []) {
  const rentals = new Map(seed.map((r) => [r.id, { ...r }]));
  const events: Array<RecordRentalEventInput & { at: number }> = [];
  const notifications: Array<{ recipientOrganizationId: string; type: string }> = [];
  let tick = 0;

  const update = (id: string, patch: Partial<RentalRecord>) => {
    const next = { ...rentals.get(id)!, ...patch, updated_at: new Date() };
    rentals.set(id, next);
    return next;
  };
  const cleared = { proposed_start_date: null, proposed_end_date: null, date_change_reason: null, date_change_proposed_at: null };

  const rentalRepository = stub<RentalRepositoryPort>({
    findById: async (id) => rentals.get(id),
    create: async (input) => {
      const record = rental({ id: `rental-${rentals.size + 1}`, machine_id: input.machineId, start_date: input.startDate, end_date: input.endDate ?? null });
      rentals.set(record.id, record);
      return record;
    },
    updateTerms: async (id, updates) =>
      update(id, {
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.paymentTerms !== undefined && { payment_terms: updates.paymentTerms }),
        ...(updates.mobilizationCharge !== undefined && { mobilization_charge: updates.mobilizationCharge }),
      }),
    updateStatus: async (id, status, actualDate) =>
      update(id, {
        status,
        ...(status === "active" && actualDate ? { actual_start_date: actualDate, actual_dates_verification_status: "pending" as const } : {}),
        ...(status === "off_rent" && actualDate ? { actual_end_date: actualDate, actual_dates_verification_status: "pending" as const } : {}),
      }),
    setActualDatesVerification: async (id, status, reason) =>
      update(id, { actual_dates_verification_status: status, actual_dates_dispute_reason: status === "disputed" ? (reason ?? null) : null }),
    findCommittedOverlapping: async (machineIds, start, end) =>
      [...rentals.values()].filter(
        (r) => machineIds.includes(r.machine_id) && ["confirmed", "active", "off_rent"].includes(r.status) && overlaps(start, end, r.start_date, r.end_date),
      ),
  });
  const maintenanceRepository = stub<MaintenanceRepositoryPort>({
    findOpenOverlapping: async (machineIds, start, end) =>
      jobs.filter((j) => machineIds.includes(j.machine_id) && overlaps(start, end, j.start_date, j.end_date)) as MaintenanceRecord[],
  });
  const changes: RentalChangeRepositoryPort = {
    proposeDateChange: async (id, p) =>
      update(id, { proposed_start_date: p.startDate, proposed_end_date: p.endDate, date_change_reason: p.reason, date_change_proposed_at: new Date() }),
    clearDateChange: async (id) => update(id, cleared),
    changeDates: async (id, start, end) => update(id, { start_date: start, end_date: end, ...cleared }),
    correctActualDates: async (id, start, end) =>
      update(id, { actual_start_date: start, actual_end_date: end, actual_dates_verification_status: "pending", actual_dates_dispute_reason: null }),
    recordEvent: async (input) => {
      events.push({ ...input, at: tick++ });
    },
    listEvents: async (rentalId) =>
      events
        .filter((e) => e.rentalId === rentalId)
        .reverse()
        .map(
          (e): RentalEventRecord => ({
            id: `event-${e.at}`,
            rental_id: e.rentalId,
            organization_id: e.organizationId,
            organization_name: ORG_NAMES[e.organizationId] ?? null,
            type: e.type,
            detail: e.detail ?? null,
            created_at: new Date(),
          }),
        ),
  };

  const organizationRepository = stub<OrganizationRepositoryPort>({
    findById: async (id) =>
      ORG_TYPES[id] ? { id, organization_type_id: "t", name: ORG_NAMES[id]!, code: "X", status: "active", created_at: new Date() } : undefined,
    findWithTypeById: async (id) =>
      ORG_TYPES[id]
        ? { id, organization_type_id: "t", organization_type_code: ORG_TYPES[id]!, name: ORG_NAMES[id]!, code: "X", status: "active", created_at: new Date() }
        : undefined,
  });
  const permissionService = new PermissionService(
    stub<MembershipRepositoryPort>({ findActiveMembership: async () => ({ id: "m", status: "active", role_id: "owner" }) }),
    stub<RoleRepositoryPort>({ hasPermission: async () => true }),
    organizationRepository,
  );
  const notificationService = new NotificationService(
    stub<NotificationRepositoryPort>({
      create: async (input) => {
        notifications.push({ recipientOrganizationId: input.recipientOrganizationId, type: input.type });
        throw new Error("fake: nothing to return, and notify() is best-effort");
      },
    }),
    permissionService,
  );
  const machineRepository = stub<MachineRepositoryPort>({
    findById: async (id) => ({
      id,
      organization_id: RC,
      product_id: "p",
      asset_code: "EXC-1",
      chassis_number: null,
      registration_number: "R1",
      year_of_manufacture: null,
      status: "active",
      created_at: new Date(),
    }),
  });

  const service = new RentalService(
    rentalRepository,
    machineRepository,
    organizationRepository,
    permissionService,
    maintenanceRepository,
    notificationService,
    changes,
  );
  return { service, rentals, events, notifications };
}

describe("rental date change proposal", () => {
  it("proposes new dates on a confirmed rental without changing them, and notifies the Renter", async () => {
    const { service, notifications, events } = build([rental()]);
    const result = await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-20", reason: "Site not ready" });
    expect(result.startDate).toBe("2099-03-01");
    expect(result.pendingDateChange).toMatchObject({ startDate: "2099-03-05", endDate: "2099-03-20", reason: "Site not ready" });
    expect(notifications).toEqual([{ recipientOrganizationId: RENTER, type: "rental.date_change_proposed" }]);
    expect(events.map((e) => e.type)).toEqual(["date_change_proposed"]);
  });

  it("allows only one pending proposal at a time", async () => {
    const { service } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    await expect(service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-06", endDate: null })).rejects.toThrow(ConflictError);
  });

  it("applies the Renter's acceptance and clears the proposal", async () => {
    const { service, notifications } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-20" });
    const accepted = await service.respondToDateChange("u2", RENTER, "rental-1", "accepted");
    expect(accepted.startDate).toBe("2099-03-05");
    expect(accepted.endDate).toBe("2099-03-20");
    expect(accepted.pendingDateChange).toBeNull();
    expect(notifications.at(-1)).toEqual({ recipientOrganizationId: RC, type: "rental.date_change_responded" });
  });

  it("keeps the dates when the Renter rejects", async () => {
    const { service } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    const rejected = await service.respondToDateChange("u2", RENTER, "rental-1", "rejected");
    expect(rejected.startDate).toBe("2099-03-01");
    expect(rejected.endDate).toBe("2099-03-10");
    expect(rejected.pendingDateChange).toBeNull();
  });

  it("lets the Rental Company withdraw, notifying the Renter", async () => {
    const { service, notifications } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    const withdrawn = await service.withdrawDateChange("u1", RC, "rental-1");
    expect(withdrawn.pendingDateChange).toBeNull();
    expect(notifications.at(-1)).toEqual({ recipientOrganizationId: RENTER, type: "rental.date_change_withdrawn" });
    await expect(service.respondToDateChange("u2", RENTER, "rental-1", "accepted")).rejects.toThrow(ConflictError);
  });

  it("applies the change directly when the customer isn't a FleetIP organization", async () => {
    const { service, notifications, events } = build([rental({ renter_organization_id: null, client_snapshot: { name: "Acme" } })]);
    const changed = await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-04-01", endDate: "2099-04-10" });
    expect(changed.startDate).toBe("2099-04-01");
    expect(changed.pendingDateChange).toBeNull();
    expect(notifications).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["dates_changed"]);
  });

  it("only moves the end date of an active rental (extension or early end)", async () => {
    const active = rental({ status: "active", start_date: "2099-03-01", actual_start_date: "2099-03-02" });
    const { service } = build([active]);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-20" })).rejects.toThrow(ValidationError);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { endDate: "2099-03-01" })).rejects.toThrow(ValidationError);
    const proposed = await service.proposeDateChange("u1", RC, "rental-1", { endDate: "2099-03-05" });
    expect(proposed.pendingDateChange).toMatchObject({ startDate: "2099-03-01", endDate: "2099-03-05" });
  });

  it("requires a start date for a confirmed rental and refuses closed rentals", async () => {
    const { service } = build([rental(), rental({ id: "rental-2", status: "off_rent" })]);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { endDate: "2099-03-20" })).rejects.toThrow(ValidationError);
    await expect(service.proposeDateChange("u1", RC, "rental-2", { endDate: "2099-03-20" })).rejects.toThrow(ConflictError);
  });

  it("rejects a proposal that overlaps another booking on the machine, but not the rental's own dates", async () => {
    const { service } = build([rental(), rental({ id: "rental-2", start_date: "2099-03-15", end_date: "2099-03-25" })]);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-16" })).rejects.toThrow(ConflictError);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-02", endDate: "2099-03-12" })).resolves.toBeTruthy();
  });

  it("re-validates availability on accept: a booking made since the proposal blocks it", async () => {
    const { service, rentals } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-20" });
    rentals.set("rental-2", rental({ id: "rental-2", start_date: "2099-03-18", end_date: "2099-03-30" }));
    const attempt = service.respondToDateChange("u2", RENTER, "rental-1", "accepted");
    await expect(attempt).rejects.toThrow(ConflictError);
    // The Renter isn't told the other booking's reference.
    await expect(attempt).rejects.not.toThrow(/RN-/);
    expect(rentals.get("rental-1")!.start_date).toBe("2099-03-01");
  });

  it("re-validates against workshop jobs on accept", async () => {
    const jobs: Parameters<typeof build>[1] = [];
    const { service } = build([rental()], jobs);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: "2099-03-20" });
    jobs.push({ id: "job-1", machine_id: "machine-1", start_date: "2099-03-19", end_date: "2099-03-19", rental_id: null });
    await expect(service.respondToDateChange("u2", RENTER, "rental-1", "accepted")).rejects.toThrow(ConflictError);
  });

  it("doesn't let a workshop job logged against this rental block its own extension", async () => {
    const jobs: Parameters<typeof build>[1] = [{ id: "job-1", machine_id: "machine-1", start_date: "2099-03-12", end_date: null, rental_id: "rental-1" }];
    const { service } = build([rental({ status: "active", actual_start_date: "2099-03-01" })], jobs);
    await expect(service.proposeDateChange("u1", RC, "rental-1", { endDate: "2099-03-20" })).resolves.toBeTruthy();
  });

  it("enforces the side: only the Rental Company proposes/withdraws, only the Renter responds", async () => {
    const { service } = build([rental()]);
    await expect(service.proposeDateChange("u2", RENTER, "rental-1", { startDate: "2099-03-05", endDate: null })).rejects.toThrow(ForbiddenError);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    await expect(service.respondToDateChange("u1", RC, "rental-1", "accepted")).rejects.toThrow(ForbiddenError);
    await expect(service.withdrawDateChange("u2", RENTER, "rental-1")).rejects.toThrow(ForbiddenError);
  });

  it("hides another organization's rental behind NotFoundError", async () => {
    const { service } = build([rental()]);
    await expect(service.proposeDateChange("u1", OTHER_RC, "rental-1", { startDate: "2099-03-05", endDate: null })).rejects.toThrow(NotFoundError);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    await expect(service.respondToDateChange("u2", OTHER_RENTER, "rental-1", "accepted")).rejects.toThrow(NotFoundError);
    await expect(service.withdrawDateChange("u1", OTHER_RC, "rental-1")).rejects.toThrow(NotFoundError);
  });

  it("lapses a pending proposal when the rental is cancelled", async () => {
    const { service } = build([rental()]);
    await service.proposeDateChange("u1", RC, "rental-1", { startDate: "2099-03-05", endDate: null });
    const cancelled = await service.updateRentalStatus("u1", RC, "rental-1", "cancelled");
    expect(cancelled.pendingDateChange).toBeNull();
  });
});

describe("disputed actual dates correction", () => {
  const disputed = rental({
    status: "off_rent",
    actual_start_date: "2026-03-02",
    actual_end_date: "2026-03-09",
    actual_dates_verification_status: "disputed",
    actual_dates_dispute_reason: "Arrived on the 4th",
  });

  it("sets corrected dates back to pending and notifies the Renter", async () => {
    const { service, notifications, events } = build([disputed]);
    const corrected = await service.correctActualDates("u1", RC, "rental-1", { actualStartDate: "2026-03-04", actualEndDate: "2026-03-09" });
    expect(corrected.actualStartDate).toBe("2026-03-04");
    expect(corrected.actualDatesVerificationStatus).toBe("pending");
    expect(corrected.actualDatesDisputeReason).toBeNull();
    expect(notifications).toEqual([{ recipientOrganizationId: RENTER, type: "rental.actual_dates_corrected" }]);
    expect(events.map((e) => e.type)).toEqual(["actual_dates_corrected"]);
    // ...and the Renter can verify again.
    await expect(service.verifyActualDates("u2", RENTER, "rental-1")).resolves.toMatchObject({ actualDatesVerificationStatus: "verified" });
  });

  it("only corrects disputed dates", async () => {
    const { service } = build([{ ...disputed, actual_dates_verification_status: "pending" }]);
    await expect(service.correctActualDates("u1", RC, "rental-1", { actualStartDate: "2026-03-04", actualEndDate: "2026-03-09" })).rejects.toThrow(ConflictError);
  });

  it("can't add an actual end date before the rental goes off rent, or drop one after", async () => {
    const { service } = build([{ ...disputed, status: "active", actual_end_date: null }, { ...disputed, id: "rental-2" }]);
    await expect(service.correctActualDates("u1", RC, "rental-1", { actualStartDate: "2026-03-04", actualEndDate: "2026-03-09" })).rejects.toThrow(ValidationError);
    await expect(service.correctActualDates("u1", RC, "rental-2", { actualStartDate: "2026-03-04" })).rejects.toThrow(ValidationError);
  });

  it("is the Rental Company's action only, on its own rental", async () => {
    const { service } = build([disputed]);
    await expect(service.correctActualDates("u2", RENTER, "rental-1", { actualStartDate: "2026-03-04", actualEndDate: "2026-03-09" })).rejects.toThrow(ForbiddenError);
    await expect(service.correctActualDates("u1", OTHER_RC, "rental-1", { actualStartDate: "2026-03-04", actualEndDate: "2026-03-09" })).rejects.toThrow(NotFoundError);
  });
});

describe("rental activity log", () => {
  it("records the lifecycle and serves it to both parties, attributed to organizations", async () => {
    const { service } = build([]);
    const created = await service.createRental("u1", RC, {
      machineId: "machine-1",
      renterOrganizationId: RENTER,
      startDate: "2099-03-01",
      endDate: "2099-03-10",
      rate: 5000,
      rateUnit: "day",
    });
    await service.updateRentalTerms("u1", RC, created.id, { paymentTerms: null });
    await service.proposeDateChange("u1", RC, created.id, { startDate: "2099-03-02", endDate: null });
    await service.respondToDateChange("u2", RENTER, created.id, "rejected");
    await service.updateRentalStatus("u1", RC, created.id, "active", "2099-03-01");
    await service.disputeActualDates("u2", RENTER, created.id, "Wrong day");

    const asRenter = await service.listEvents("u2", RENTER, created.id);
    expect(asRenter.map((e) => e.type)).toEqual([
      "actual_dates_disputed",
      "status_changed",
      "date_change_rejected",
      "date_change_proposed",
      "terms_edited",
      "created",
    ]);
    expect(asRenter.find((e) => e.type === "status_changed")).toMatchObject({
      organizationName: "Apex Rentals",
      detail: { from: "confirmed", to: "active", actualDate: "2099-03-01" },
    });
    expect(asRenter.find((e) => e.type === "terms_edited")?.detail).toEqual({ fields: ["paymentTerms"] });
    // No user identity crosses the party line.
    expect(JSON.stringify(asRenter)).not.toMatch(/u1|u2|actor/);

    const asCompany = await service.listEvents("u1", RC, created.id);
    expect(asCompany).toHaveLength(6);
  });

  it("hides another organization's rental events behind NotFoundError", async () => {
    const { service } = build([rental()]);
    await expect(service.listEvents("u1", OTHER_RC, "rental-1")).rejects.toThrow(NotFoundError);
    await expect(service.listEvents("u2", OTHER_RENTER, "rental-1")).rejects.toThrow(NotFoundError);
  });
});

describe("clearing optional fields", () => {
  it("accepts null for optional rental terms, but not for rate/rateUnit", () => {
    expect(updateRentalTermsRequestSchema.safeParse({ paymentTerms: null, mobilizationCharge: null, operatorScope: null }).success).toBe(true);
    expect(updateRentalTermsRequestSchema.safeParse({ rate: null }).success).toBe(false);
    expect(updateRentalTermsRequestSchema.safeParse({ rateUnit: null }).success).toBe(false);
  });

  it("clears a rental term to null through the service", async () => {
    const { service } = build([rental()]);
    const updated = await service.updateRentalTerms("u1", RC, "rental-1", { paymentTerms: null, mobilizationCharge: null });
    expect(updated.paymentTerms).toBeNull();
    expect(updated.mobilizationCharge).toBeNull();
  });

  it("accepts null for optional transport fields, but not for status/actualDate", () => {
    expect(
      updateTransportRequestSchema.safeParse({ pickupLocation: null, destination: null, plannedDate: null, transportDetails: null, charges: null, notes: null }).success,
    ).toBe(true);
    expect(updateTransportRequestSchema.safeParse({ status: null }).success).toBe(false);
    expect(updateTransportRequestSchema.safeParse({ actualDate: null }).success).toBe(false);
  });
});
