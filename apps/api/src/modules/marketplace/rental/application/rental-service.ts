import type {
  CheckMachineAvailabilityQuery,
  CheckMachinesAvailabilityRequest,
  MachineAvailability,
  MachinesAvailabilityResponse,
  CorrectActualDatesRequest,
  CreateRentalRequest,
  ProposeRentalDateChangeRequest,
  Rental,
  RentalEvent,
  UpdateRentalTermsRequest,
} from "@fleetip/contracts/rental";
import { ActualDatesVerificationStatus, RentalEventType, RentalStatus } from "@fleetip/contracts/rental";
import { MachineStatus } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/errors.js";
import { todayInBusinessZone } from "../../../../shared/business-date.js";
import type { Page, RentalListParams } from "@fleetip/contracts/list";
import { mapPage, mapPageAsync, type ParsedListQuery } from "../../../../shared/list-query.js";
import type { MachineRepositoryPort } from "../../../equipment/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../../../maintenance/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../../organizations/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
import { canTransition } from "../domain/rental-status.js";
import {
  availabilityConflictError,
  maintenanceConflict,
  rentalConflict,
  sortConflicts,
} from "./availability.js";
import type {
  RecordRentalEventInput,
  RentalChangeRepositoryPort,
  RentalRecord,
  RentalRepositoryPort,
} from "../domain/ports.js";

function toRental(
  record: RentalRecord,
  extra?: { machineAssetCode?: string | null; rentalCompanyOrganizationName?: string | null },
): Rental {
  return {
    id: record.id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    renterOrganizationId: record.renter_organization_id,
    clientSnapshot: record.client_snapshot,
    machineId: record.machine_id,
    status: record.status,
    projectName: record.project_name,
    projectLocation: record.project_location,
    // start_date/end_date already come back as plain "YYYY-MM-DD" strings
    // (see the DATE type parser in infrastructure/database/client.ts) — no
    // Date conversion here, that would reintroduce the timezone bug it fixed.
    startDate: record.start_date,
    endDate: record.end_date,
    rate: record.rate,
    rateUnit: record.rate_unit,
    mobilizationCharge: record.mobilization_charge,
    demobilizationCharge: record.demobilization_charge,
    paymentTerms: record.payment_terms,
    shiftStructure: record.shift_structure,
    overtimeRate: record.overtime_rate,
    sundayCondition: record.sunday_condition,
    fuelNorms: record.fuel_norms,
    operatorScope: record.operator_scope,
    noticePeriodDays: record.notice_period_days,
    dehireTerms: record.dehire_terms,
    actualStartDate: record.actual_start_date,
    actualEndDate: record.actual_end_date,
    actualDatesVerificationStatus: record.actual_dates_verification_status,
    actualDatesDisputeReason: record.actual_dates_dispute_reason,
    pendingDateChange: record.date_change_proposed_at
      ? {
          startDate: record.proposed_start_date ?? record.start_date,
          endDate: record.proposed_end_date ?? null,
          reason: record.date_change_reason ?? null,
          proposedAt: new Date(record.date_change_proposed_at).toISOString(),
        }
      : null,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
    machineAssetCode: extra?.machineAssetCode ?? null,
    rentalCompanyOrganizationName: extra?.rentalCompanyOrganizationName ?? null,
  };
}

export class RentalService {
  constructor(
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly maintenanceRepository: MaintenanceRepositoryPort,
    private readonly notificationService: NotificationService,
    private readonly rentalChanges: RentalChangeRepositoryPort,
  ) {}

  // Activity log write — best-effort like notify(): a lost log line must
  // never undo the business action it describes.
  private async logEvent(input: RecordRentalEventInput): Promise<void> {
    try {
      await this.rentalChanges.recordEvent(input);
    } catch {
      // swallow
    }
  }

  // Best-effort side effect — never blocks the real business action. See
  // CommercialQuotationService's identical wrapper for why.
  private async notify(input: Parameters<NotificationService["notify"]>[0]): Promise<void> {
    try {
      await this.notificationService.notify(input);
    } catch {
      // swallow
    }
  }

  async createRental(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateRentalRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );

    const machine = await this.machineRepository.findById(input.machineId);
    if (!machine) {
      throw new NotFoundError("Machine not found");
    }
    if (machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    if (machine.status === MachineStatus.retired) {
      throw new ConflictError("Machine is retired and cannot be rented");
    }

    // Exactly-one-of-party is already enforced by createRentalRequestSchema's
    // refine — this is a different check: the referenced organization must
    // actually be a Renter, not the acting organization's own type (that's
    // already covered by requirePermission above via PERMISSION_ORGANIZATION_TYPES).
    if (input.renterOrganizationId) {
      const renterOrganization = await this.organizationRepository.findWithTypeById(
        input.renterOrganizationId,
      );
      if (!renterOrganization || renterOrganization.organization_type_code !== OrganizationTypeCode.renter) {
        throw new ValidationError("renterOrganizationId must reference a Renter organization");
      }
    }

    const [blocker] = (
      await this.availabilityFor([input.machineId], input.startDate, input.endDate ?? null)
    )[0]!.conflicts;
    if (blocker) throw availabilityConflictError(blocker);

    const record = await this.rentalRepository.create({
      rentalCompanyOrganizationId,
      renterOrganizationId: input.renterOrganizationId,
      clientSnapshot: input.clientSnapshot,
      machineId: input.machineId,
      status: RentalStatus.confirmed,
      projectName: input.projectName,
      projectLocation: input.projectLocation,
      startDate: input.startDate,
      endDate: input.endDate,
      rate: input.rate,
      rateUnit: input.rateUnit,
      mobilizationCharge: input.mobilizationCharge,
      demobilizationCharge: input.demobilizationCharge,
      paymentTerms: input.paymentTerms,
      shiftStructure: input.shiftStructure,
      overtimeRate: input.overtimeRate,
      sundayCondition: input.sundayCondition,
      fuelNorms: input.fuelNorms,
      operatorScope: input.operatorScope,
      noticePeriodDays: input.noticePeriodDays,
      dehireTerms: input.dehireTerms,
    });
    await this.logEvent({
      rentalId: record.id,
      organizationId: rentalCompanyOrganizationId,
      actorUserId: userId,
      type: RentalEventType.created,
    });
    return toRental(record);
  }

  // Single-rental lookup — mirrors listRentals' organization-type branch,
  // which this was missing entirely (a Renter has no rental.manage on any
  // organization, rental_company-only per PERMISSION_ORGANIZATION_TYPES, so
  // this always 404'd for a Renter regardless of role/permissions — not a
  // custom-role edge case, every Renter viewing a Transport/Logsheet detail
  // page for their own rental hit this).
  async getRental(userId: string, organizationId: string, rentalId: string): Promise<Rental> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === OrganizationTypeCode.renter) {
      await this.permissionService.requirePermission(userId, organizationId, "rental.respond");
      const record = await this.rentalRepository.findById(rentalId);
      if (!record || record.renter_organization_id !== organizationId) {
        throw new NotFoundError("Rental not found in this organization");
      }
      const [machine, rentalCompany] = await Promise.all([
        this.machineRepository.findById(record.machine_id),
        this.organizationRepository.findById(record.rental_company_organization_id),
      ]);
      return toRental(record, {
        machineAssetCode: machine?.asset_code ?? null,
        rentalCompanyOrganizationName: rentalCompany?.name ?? null,
      });
    }

    await this.permissionService.requirePermission(userId, organizationId, "rental.manage");
    const record = await this.rentalRepository.findById(rentalId);
    if (!record || record.rental_company_organization_id !== organizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    return toRental(record);
  }

  async listRentals(userId: string, organizationId: string): Promise<Rental[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === OrganizationTypeCode.renter) {
      // A Renter has no equipment.manage/rental.manage permission on the
      // Rental Company's org, so it can never resolve the machine/company
      // itself the way the Rental Company's own list page does — resolve it
      // here instead (same "look up server-side, don't grant the underlying
      // permission" shape as auction bids' rentalCompanyOrganizationName).
      await this.permissionService.requirePermission(userId, organizationId, "rental.respond");
      const records = await this.rentalRepository.listByRenterOrganization(organizationId);
      return Promise.all(records.map((record) => this.toRenterRental(record)));
    }

    await this.permissionService.requirePermission(userId, organizationId, "rental.manage");
    const records = await this.rentalRepository.listByOrganization(organizationId);
    return records.map((record) => toRental(record));
  }

  // Paged/filtered variant of listRentals (ticket l); same party rules.
  async listRentalsPage(
    userId: string,
    organizationId: string,
    query: ParsedListQuery<RentalListParams>,
  ): Promise<Page<Rental>> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === OrganizationTypeCode.renter) {
      await this.permissionService.requirePermission(userId, organizationId, "rental.respond");
      const page = await this.rentalRepository.listRentalsPage("renter", organizationId, query);
      return mapPageAsync(page, (record) => this.toRenterRental(record));
    }
    await this.permissionService.requirePermission(userId, organizationId, "rental.manage");
    const page = await this.rentalRepository.listRentalsPage("rentalCompany", organizationId, query);
    return mapPage(page, (record) => toRental(record));
  }

  private async toRenterRental(record: RentalRecord): Promise<Rental> {
    const [machine, rentalCompany] = await Promise.all([
      this.machineRepository.findById(record.machine_id),
      this.organizationRepository.findById(record.rental_company_organization_id),
    ]);
    return toRental(record, {
      machineAssetCode: machine?.asset_code ?? null,
      rentalCompanyOrganizationName: rentalCompany?.name ?? null,
    });
  }

  async updateRentalTerms(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    updates: UpdateRentalTermsRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing) {
      throw new NotFoundError("Rental not found");
    }
    if (existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (existing.status !== RentalStatus.confirmed) {
      throw new ConflictError("Terms can only be edited while the rental is confirmed");
    }

    const record = await this.rentalRepository.updateTerms(rentalId, updates);
    await this.logEvent({
      rentalId,
      organizationId: rentalCompanyOrganizationId,
      actorUserId: userId,
      type: RentalEventType.terms_edited,
      detail: { fields: Object.keys(updates) },
    });
    return toRental(record);
  }

  async updateRentalStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    newStatus: RentalStatus,
    actualDate?: string,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing) {
      throw new NotFoundError("Rental not found");
    }
    if (existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(`Cannot transition rental from ${existing.status} to ${newStatus}`);
    }
    if (newStatus === RentalStatus.active) {
      const machine = await this.machineRepository.findById(existing.machine_id);
      if (!machine || machine.status === MachineStatus.retired) {
        throw new ConflictError("Machine is retired and cannot be activated");
      }
      // A job logged against this rental (a breakdown on site) doesn't block it.
      const [job] = (
        await this.maintenanceRepository.findOpenOverlapping(
          [existing.machine_id],
          existing.start_date,
          existing.end_date,
        )
      ).filter((record) => record.rental_id !== existing.id);
      if (job) throw availabilityConflictError(maintenanceConflict(job));
    }

    // "active"/"off_rent" also record the actual start/end date, for buffer
    // tracking against the planned start_date/end_date — defaults to today,
    // overridable, same auto-capture-on-transition precedent as Transport's
    // own "delivered" status.
    const resolvedActualDate =
      newStatus === RentalStatus.active || newStatus === RentalStatus.off_rent ? (actualDate ?? todayInBusinessZone()) : undefined;
    let record = await this.rentalRepository.updateStatus(rentalId, newStatus, resolvedActualDate);
    await this.logEvent({
      rentalId,
      organizationId: rentalCompanyOrganizationId,
      actorUserId: userId,
      type: RentalEventType.status_changed,
      detail: { from: existing.status, to: newStatus, ...(resolvedActualDate && { actualDate: resolvedActualDate }) },
    });
    // A pending date change only applies to a confirmed/active rental —
    // it lapses once the rental moves past that.
    if (record.date_change_proposed_at && newStatus !== RentalStatus.active) {
      record = await this.rentalChanges.clearDateChange(rentalId);
    }
    if (
      record.renter_organization_id &&
      (newStatus === RentalStatus.active || newStatus === RentalStatus.off_rent || newStatus === RentalStatus.completed)
    ) {
      const type =
        newStatus === RentalStatus.active
          ? "rental.active"
          : newStatus === RentalStatus.off_rent
            ? "rental.off_rent"
            : "rental.completed";
      const title =
        newStatus === RentalStatus.active
          ? "Rental is now active"
          : newStatus === RentalStatus.off_rent
            ? "Rental is off-rent — please verify the actual date"
            : "Rental completed";
      const rentalCompany = await this.organizationRepository.findById(
        record.rental_company_organization_id,
      );
      const rentalCompanyName = rentalCompany?.name ?? "The Rental Company";
      const message =
        newStatus === RentalStatus.active
          ? `${rentalCompanyName} marked your rental active${resolvedActualDate ? ` on ${resolvedActualDate}` : ""} — please verify the actual date.`
          : newStatus === RentalStatus.off_rent
            ? `${rentalCompanyName} marked your rental off-rent${resolvedActualDate ? ` on ${resolvedActualDate}` : ""} — please verify the actual date.`
            : `${rentalCompanyName} marked your rental completed.`;
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type,
        title,
        message,
        relatedResourceType: "rental",
        relatedResourceId: record.id,
      });
    }
    return toRental(record);
  }

  // The Renter's side of the actual-dates buffer mechanism — the Rental
  // Company records what happened (above), the Renter confirms it's
  // accurate. Modeled after QuotationOffer's pending/accepted/rejected
  // shape, not a silent self-attested boolean like Logsheet's
  // customerConfirmed (no counterparty action, no dispute path).
  async verifyActualDates(
    userId: string,
    renterOrganizationId: string,
    rentalId: string,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rental.respond");
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing || existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (existing.actual_dates_verification_status !== ActualDatesVerificationStatus.pending) {
      throw new ConflictError("No actual dates are pending verification on this rental");
    }
    const record = await this.rentalRepository.setActualDatesVerification(rentalId, ActualDatesVerificationStatus.verified);
    await this.logEvent({
      rentalId,
      organizationId: renterOrganizationId,
      actorUserId: userId,
      type: RentalEventType.actual_dates_verified,
    });
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "rental.actual_dates_verified",
      title: "Actual dates verified",
      message: "The Renter verified the actual dates you recorded.",
      relatedResourceType: "rental",
      relatedResourceId: record.id,
    });
    return toRental(record);
  }

  async disputeActualDates(
    userId: string,
    renterOrganizationId: string,
    rentalId: string,
    reason: string,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rental.respond");
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing || existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (existing.actual_dates_verification_status !== ActualDatesVerificationStatus.pending) {
      throw new ConflictError("No actual dates are pending verification on this rental");
    }
    const record = await this.rentalRepository.setActualDatesVerification(
      rentalId,
      ActualDatesVerificationStatus.disputed,
      reason,
    );
    await this.logEvent({
      rentalId,
      organizationId: renterOrganizationId,
      actorUserId: userId,
      type: RentalEventType.actual_dates_disputed,
      detail: { reason },
    });
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "rental.actual_dates_disputed",
      title: "Actual dates disputed",
      message: `The Renter disputed the actual dates you recorded: ${reason}`,
      relatedResourceType: "rental",
      relatedResourceId: record.id,
    });
    return toRental(record);
  }

  // ---- Planned-date changes: the Rental Company proposes, the Renter
  // accepts or rejects (same shape as a quotation's alternate dates). With
  // no Renter organization (external customer) the change applies directly.

  private async loadOwned(rentalCompanyOrganizationId: string, rentalId: string): Promise<RentalRecord> {
    const record = await this.rentalRepository.findById(rentalId);
    if (!record || record.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    return record;
  }

  private async loadAsRenter(renterOrganizationId: string, rentalId: string): Promise<RentalRecord> {
    const record = await this.rentalRepository.findById(rentalId);
    if (!record || record.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    return record;
  }

  // The availability check for new dates on an existing rental, minus what
  // belongs to the rental itself: its own booking (it always overlaps its
  // own dates) and a workshop job logged against it (same exemption as
  // activation). For the Renter the blocker isn't named: it's the Rental
  // Company's other booking or workshop job, not theirs to see.
  private async assertDatesFree(
    record: RentalRecord,
    startDate: string,
    endDate: string | null,
    side: "rental_company" | "renter",
  ): Promise<void> {
    const [rentals, jobs] = await Promise.all([
      this.rentalRepository.findCommittedOverlapping([record.machine_id], startDate, endDate),
      this.maintenanceRepository.findOpenOverlapping([record.machine_id], startDate, endDate),
    ]);
    const [blocker] = sortConflicts([
      ...rentals.filter((other) => other.id !== record.id).map(rentalConflict),
      ...jobs.filter((job) => job.rental_id !== record.id).map(maintenanceConflict),
    ]);
    if (!blocker) return;
    if (side === "rental_company") throw availabilityConflictError(blocker);
    throw new ConflictError(
      "The machine is no longer free for those dates, so the change can't be accepted. Reject it and ask the rental company for new dates.",
    );
  }

  private async organizationName(organizationId: string, fallback: string): Promise<string> {
    return (await this.organizationRepository.findById(organizationId))?.name ?? fallback;
  }

  async proposeDateChange(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    input: ProposeRentalDateChangeRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(userId, rentalCompanyOrganizationId, "rental.manage");
    const existing = await this.loadOwned(rentalCompanyOrganizationId, rentalId);
    if (existing.date_change_proposed_at) {
      throw new ConflictError("A date change is already waiting for the customer's answer. Withdraw it before proposing another.");
    }

    let startDate: string;
    if (existing.status === RentalStatus.confirmed) {
      if (!input.startDate) {
        throw new ValidationError("Enter the start date", [{ path: "startDate", message: "Enter the start date" }]);
      }
      startDate = input.startDate;
    } else if (existing.status === RentalStatus.active) {
      if (input.startDate && input.startDate !== existing.start_date) {
        throw new ValidationError("An active rental's start date can't change, only its end date", [
          { path: "startDate", message: "An active rental's start date can't change, only its end date" },
        ]);
      }
      startDate = existing.start_date;
      const started = existing.actual_start_date ?? existing.start_date;
      if (input.endDate && input.endDate < started) {
        throw new ValidationError("The end date can't be before the rental started", [
          { path: "endDate", message: `The end date can't be before the rental started (${started})` },
        ]);
      }
    } else {
      throw new ConflictError("Dates can only be changed while the rental is confirmed or active");
    }
    const endDate = input.endDate;
    if (endDate && endDate < startDate) {
      throw new ValidationError("End date cannot be before the start date", [
        { path: "endDate", message: "End date cannot be before the start date" },
      ]);
    }
    if (startDate === existing.start_date && endDate === existing.end_date) {
      throw new ValidationError("Those are already the rental's dates");
    }
    await this.assertDatesFree(existing, startDate, endDate, "rental_company");

    const reason = input.reason ?? null;
    const detail = {
      startDate,
      endDate,
      reason,
      previousStartDate: existing.start_date,
      previousEndDate: existing.end_date,
    };
    const actor = { rentalId, organizationId: rentalCompanyOrganizationId, actorUserId: userId };

    if (!existing.renter_organization_id) {
      const record = await this.rentalChanges.changeDates(rentalId, startDate, endDate);
      await this.logEvent({ ...actor, type: RentalEventType.dates_changed, detail });
      return toRental(record);
    }

    const record = await this.rentalChanges.proposeDateChange(rentalId, { startDate, endDate, reason });
    await this.logEvent({ ...actor, type: RentalEventType.date_change_proposed, detail });
    const company = await this.organizationName(rentalCompanyOrganizationId, "The Rental Company");
    await this.notify({
      recipientOrganizationId: existing.renter_organization_id,
      type: "rental.date_change_proposed",
      title: "New rental dates proposed",
      message: `${company} proposed new dates for your rental: ${startDate} to ${endDate ?? "open-ended"}${reason ? ` (${reason})` : ""}. Accept or reject them on the rental.`,
      relatedResourceType: "rental",
      relatedResourceId: rentalId,
    });
    return toRental(record);
  }

  async respondToDateChange(
    userId: string,
    renterOrganizationId: string,
    rentalId: string,
    decision: "accepted" | "rejected",
  ): Promise<Rental> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rental.respond");
    const existing = await this.loadAsRenter(renterOrganizationId, rentalId);
    if (!existing.date_change_proposed_at) {
      throw new ConflictError("No date change is waiting for an answer on this rental");
    }
    const startDate = existing.proposed_start_date ?? existing.start_date;
    const endDate = existing.proposed_end_date ?? null;

    let record: RentalRecord;
    if (decision === "accepted") {
      if (existing.status !== RentalStatus.confirmed && existing.status !== RentalStatus.active) {
        throw new ConflictError("Dates can only be changed while the rental is confirmed or active");
      }
      if (existing.status === RentalStatus.active && startDate !== existing.start_date) {
        throw new ConflictError(
          "The rental has started since this change was proposed, so its start date can't move. Reject it and ask for a new proposal.",
        );
      }
      // Re-validated now: the machine may have been booked or sent to the
      // workshop since the proposal was made.
      await this.assertDatesFree(existing, startDate, endDate, "renter");
      record = await this.rentalChanges.changeDates(rentalId, startDate, endDate);
    } else {
      record = await this.rentalChanges.clearDateChange(rentalId);
    }
    await this.logEvent({
      rentalId,
      organizationId: renterOrganizationId,
      actorUserId: userId,
      type: decision === "accepted" ? RentalEventType.date_change_accepted : RentalEventType.date_change_rejected,
      detail: { startDate, endDate },
    });
    const renter = await this.organizationName(renterOrganizationId, "The Renter");
    await this.notify({
      recipientOrganizationId: existing.rental_company_organization_id,
      type: "rental.date_change_responded",
      title: decision === "accepted" ? "New rental dates accepted" : "New rental dates rejected",
      message: `${renter} ${decision} the new dates (${startDate} to ${endDate ?? "open-ended"}).`,
      relatedResourceType: "rental",
      relatedResourceId: rentalId,
    });
    return toRental(record);
  }

  async withdrawDateChange(userId: string, rentalCompanyOrganizationId: string, rentalId: string): Promise<Rental> {
    await this.permissionService.requirePermission(userId, rentalCompanyOrganizationId, "rental.manage");
    const existing = await this.loadOwned(rentalCompanyOrganizationId, rentalId);
    if (!existing.date_change_proposed_at) {
      throw new ConflictError("No date change is waiting for an answer on this rental");
    }
    const record = await this.rentalChanges.clearDateChange(rentalId);
    await this.logEvent({
      rentalId,
      organizationId: rentalCompanyOrganizationId,
      actorUserId: userId,
      type: RentalEventType.date_change_withdrawn,
      detail: { startDate: existing.proposed_start_date ?? existing.start_date, endDate: existing.proposed_end_date ?? null },
    });
    if (existing.renter_organization_id) {
      const company = await this.organizationName(rentalCompanyOrganizationId, "The Rental Company");
      await this.notify({
        recipientOrganizationId: existing.renter_organization_id,
        type: "rental.date_change_withdrawn",
        title: "Proposed rental dates withdrawn",
        message: `${company} withdrew the date change it proposed. The rental keeps its current dates.`,
        relatedResourceType: "rental",
        relatedResourceId: rentalId,
      });
    }
    return toRental(record);
  }

  // The Rental Company's answer to a dispute: corrected actual dates go
  // back to "pending" for the Renter to verify or dispute again.
  async correctActualDates(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    input: CorrectActualDatesRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(userId, rentalCompanyOrganizationId, "rental.manage");
    const existing = await this.loadOwned(rentalCompanyOrganizationId, rentalId);
    if (existing.actual_dates_verification_status !== ActualDatesVerificationStatus.disputed) {
      throw new ConflictError("Actual dates can only be corrected after the customer disputes them");
    }
    // The end date is recorded by going off rent — a correction can change
    // it once it exists, but can't add or remove it.
    if (input.actualEndDate && !existing.actual_end_date) {
      throw new ValidationError("The actual end date is recorded when the rental goes off rent", [
        { path: "actualEndDate", message: "The actual end date is recorded when the rental goes off rent" },
      ]);
    }
    if (!input.actualEndDate && existing.actual_end_date) {
      throw new ValidationError("Enter the actual end date", [{ path: "actualEndDate", message: "Enter the actual end date" }]);
    }
    const actualEndDate = input.actualEndDate ?? null;
    const record = await this.rentalChanges.correctActualDates(rentalId, input.actualStartDate, actualEndDate);
    await this.logEvent({
      rentalId,
      organizationId: rentalCompanyOrganizationId,
      actorUserId: userId,
      type: RentalEventType.actual_dates_corrected,
      detail: { actualStartDate: input.actualStartDate, actualEndDate },
    });
    if (existing.renter_organization_id) {
      const company = await this.organizationName(rentalCompanyOrganizationId, "The Rental Company");
      await this.notify({
        recipientOrganizationId: existing.renter_organization_id,
        type: "rental.actual_dates_corrected",
        title: "Actual dates corrected — please verify",
        message: `${company} corrected the actual dates you disputed: start ${input.actualStartDate}${actualEndDate ? `, end ${actualEndDate}` : ""}. Verify or dispute them again.`,
        relatedResourceType: "rental",
        relatedResourceId: rentalId,
      });
    }
    return toRental(record);
  }

  // Either party's view of the rental's activity. getRental does the
  // party-side permission and ownership check (404 outside the rental).
  // Attributed to organizations only, never the other side's users.
  async listEvents(userId: string, organizationId: string, rentalId: string): Promise<RentalEvent[]> {
    await this.getRental(userId, organizationId, rentalId);
    const records = await this.rentalChanges.listEvents(rentalId);
    return records.map((record) => ({
      id: record.id,
      rentalId: record.rental_id,
      type: record.type,
      detail: record.detail,
      organizationId: record.organization_id,
      organizationName: record.organization_name,
      createdAt: new Date(record.created_at).toISOString(),
    }));
  }

  async checkAvailability(
    userId: string,
    rentalCompanyOrganizationId: string,
    query: CheckMachineAvailabilityQuery,
  ): Promise<MachineAvailability> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const machine = await this.machineRepository.findById(query.machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    const [result] = await this.availabilityFor([query.machineId], query.startDate, query.endDate ?? null);
    return { available: result!.available, conflicts: result!.conflicts };
  }

  /** Many machines, one window: two queries total, not one call per machine. */
  async checkMachinesAvailability(
    userId: string,
    rentalCompanyOrganizationId: string,
    request: CheckMachinesAvailabilityRequest,
  ): Promise<MachinesAvailabilityResponse> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const machineIds = [...new Set(request.machineIds)];
    const owned = new Set(
      (await this.machineRepository.listByOrganization(rentalCompanyOrganizationId)).map((m) => m.id),
    );
    if (machineIds.some((id) => !owned.has(id))) {
      throw new NotFoundError("Machine not found in this organization");
    }
    const results = await this.availabilityFor(machineIds, request.startDate, request.endDate ?? null);
    return { results };
  }

  // The one availability rule: committing rentals and open workshop jobs both block.
  private async availabilityFor(machineIds: string[], startDate: string, endDate: string | null) {
    const [rentals, jobs] = await Promise.all([
      this.rentalRepository.findCommittedOverlapping(machineIds, startDate, endDate),
      this.maintenanceRepository.findOpenOverlapping(machineIds, startDate, endDate),
    ]);
    return machineIds.map((machineId) => {
      const conflicts = sortConflicts([
        ...rentals.filter((r) => r.machine_id === machineId).map(rentalConflict),
        ...jobs.filter((j) => j.machine_id === machineId).map(maintenanceConflict),
      ]);
      return { machineId, available: conflicts.length === 0, conflicts };
    });
  }
}
