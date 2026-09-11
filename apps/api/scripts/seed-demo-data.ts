/**
 * Seeds a realistic, coherent demo dataset by driving the real application
 * services — never raw SQL — so every row is guaranteed to satisfy the same
 * business rules a real user would hit through the API. Purely additive:
 * safe to run against an existing dev database, never deletes anything.
 *
 * Demonstrates the full journey from docs/autonomus-building-instructions.md
 * §34: Catalogue -> Fleet -> Requirement -> Supply response -> Quotation ->
 * Auction/Award -> Rental -> Mobilization -> Execution -> Logsheet ->
 * Billing -> Payment -> Machine history.
 *
 * Run with: pnpm --filter @fleetip/api run seed:demo
 */
import { container } from "../src/infrastructure/container.js";

function daysFromNow(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function minutesFromNow(offset: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + offset);
  return date.toISOString();
}

async function signupAndGetOrganizationId(input: {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  organizationTypeCode: "rental_company" | "renter";
}): Promise<{ userId: string; organizationId: string }> {
  const { user, token } = await container.authService.signup(input);
  const session = await container.authService.getAuthenticatedSession(token);
  const organizationId = session!.memberships[0]!.organizationId;
  return { userId: user.id, organizationId };
}

async function main() {
  console.log("Seeding demo data...");

  // --- Organizations ---
  const apex = await signupAndGetOrganizationId({
    email: "owner@apex-demo.fleetip.local",
    password: "DemoPass123!",
    displayName: "Aditya Sharma",
    organizationName: "Apex Equipment Rentals",
    organizationTypeCode: "rental_company",
  });
  const rajasthanHeavy = await signupAndGetOrganizationId({
    email: "owner@rhm-demo.fleetip.local",
    password: "DemoPass123!",
    displayName: "Priya Rathore",
    organizationName: "Rajasthan Heavy Machinery",
    organizationTypeCode: "rental_company",
  });
  const metroInfra = await signupAndGetOrganizationId({
    email: "owner@metro-demo.fleetip.local",
    password: "DemoPass123!",
    displayName: "Vikram Mehta",
    organizationName: "Metro Infra Builders",
    organizationTypeCode: "renter",
  });
  const desertHighway = await signupAndGetOrganizationId({
    email: "owner@desert-demo.fleetip.local",
    password: "DemoPass123!",
    displayName: "Kavita Joshi",
    organizationName: "Desert Highway Constructors",
    organizationTypeCode: "renter",
  });
  console.log("Created 2 Rental Companies and 2 Renters.");

  // --- Catalogue lookups (seeded by migration 0005) ---
  const categories = await container.catalogueService.listCategories();
  const excavatorCategory = categories.find((c) => c.code === "EXCAVATOR")!;
  const craneCategory = categories.find((c) => c.code === "CRANE")!;
  const excavatorSubcategories = await container.catalogueService.listSubcategories(
    excavatorCategory.id,
  );
  const craneSubcategories = await container.catalogueService.listSubcategories(craneCategory.id);
  const trackedExcavatorSub = excavatorSubcategories.find((s) => s.code === "TRACKED")!;
  const mobileCraneSub = craneSubcategories.find((s) => s.code === "MOBILE")!;
  const excavatorProducts = await container.catalogueService.listProducts(trackedExcavatorSub.id);
  const craneProducts = await container.catalogueService.listProducts(mobileCraneSub.id);
  const excavatorProduct = excavatorProducts[0]!;
  const craneProduct = craneProducts[0]!;

  // --- Fleet ---
  const apexExcavator = await container.equipmentService.createMachine(
    apex.userId,
    apex.organizationId,
    {
      productId: excavatorProduct.id,
      assetCode: "APX-EXC-01",
      registrationNumber: "RJ14EX0001",
      yearOfManufacture: 2021,
    },
  );
  const apexExcavator2 = await container.equipmentService.createMachine(
    apex.userId,
    apex.organizationId,
    {
      productId: excavatorProduct.id,
      assetCode: "APX-EXC-02",
      registrationNumber: "RJ14EX0002",
      yearOfManufacture: 2022,
    },
  );
  const rhmCrane = await container.equipmentService.createMachine(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    {
      productId: craneProduct.id,
      assetCode: "RHM-CRN-01",
      registrationNumber: "RJ27CR0001",
      yearOfManufacture: 2020,
    },
  );
  console.log("Registered 3 machines across the two Rental Companies.");

  // --- Journey 1: RFQ -> response -> quotation -> negotiation -> award -> Rental ---
  const requirement1 = await container.requirementService.createRequirement(
    metroInfra.userId,
    metroInfra.organizationId,
    {
      productSubcategoryId: trackedExcavatorSub.id,
      quantity: 1,
      projectName: "Metro Bridge Foundation",
      projectLocation: "Jaipur",
      requestedStartDate: daysFromNow(10),
      validityDate: daysFromNow(7),
      notes: "20T class tracked excavator needed for bridge foundation excavation.",
    },
  );
  const response1 = await container.quotationResponseService.submitResponse(
    apex.userId,
    apex.organizationId,
    requirement1.id,
    { status: "interested", indicativeRate: 6500, indicativeRateUnit: "day" },
  );
  const quotation1 = await container.commercialQuotationService.createQuotation(
    apex.userId,
    apex.organizationId,
    {
      renterOrganizationId: metroInfra.organizationId,
      requirementId: requirement1.id,
      quotationResponseId: response1.id,
      machineId: apexExcavator.id,
      startDate: daysFromNow(10),
      rate: 6500,
      rateUnit: "day",
      validityDate: daysFromNow(9),
      commercialNotes: "Includes operator and standard mobilization within Jaipur city limits.",
    },
  );
  await container.commercialQuotationService.sendQuotation(
    apex.userId,
    apex.organizationId,
    quotation1.id,
  );
  const offer1 = await container.commercialQuotationService.makeOffer(
    metroInfra.userId,
    metroInfra.organizationId,
    quotation1.id,
    { rate: 6000, rateUnit: "day", startDate: daysFromNow(10), notes: "Can we agree on 6000/day?" },
  );
  await container.commercialQuotationService.acceptOffer(
    apex.userId,
    apex.organizationId,
    quotation1.id,
    offer1.id,
  );
  await container.commercialQuotationService.awardQuotation(
    apex.userId,
    apex.organizationId,
    quotation1.id,
  );
  const rentals1 = await container.rentalService.listRentals(apex.userId, apex.organizationId);
  const rental1 = rentals1[0]!;
  console.log("Journey 1 complete: RFQ -> negotiated quotation -> awarded Rental.");

  // --- Journey 2: RFQ -> Auction -> formalized quotation -> award -> Rental ---
  const requirement2 = await container.requirementService.createRequirement(
    desertHighway.userId,
    desertHighway.organizationId,
    {
      productSubcategoryId: mobileCraneSub.id,
      quantity: 1,
      projectName: "Highway Widening Phase 2",
      projectLocation: "Udaipur",
      requestedStartDate: daysFromNow(20),
      validityDate: daysFromNow(18),
    },
  );
  const auction = await container.auctionService.createAuction(
    desertHighway.userId,
    desertHighway.organizationId,
    {
      requirementId: requirement2.id,
      biddingDirection: "descending",
      basePrice: 9000,
      startsAt: minutesFromNow(-2),
      endsAt: minutesFromNow(60),
    },
  );
  const rhmParticipant = await container.auctionService.requestToJoin(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    auction.id,
  );
  await container.auctionService.reviewParticipant(
    desertHighway.userId,
    desertHighway.organizationId,
    auction.id,
    rhmParticipant.id,
    "approved",
  );
  await container.auctionService.placeBid(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    auction.id,
    8500,
  );
  await container.auctionService.closeAuctionEarly(
    desertHighway.userId,
    desertHighway.organizationId,
    auction.id,
  );
  const quotation2 = await container.commercialQuotationService.createQuotation(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    {
      renterOrganizationId: desertHighway.organizationId,
      requirementId: requirement2.id,
      sourceAuctionId: auction.id,
      machineId: rhmCrane.id,
      startDate: daysFromNow(20),
      rate: 8500,
      rateUnit: "day",
      validityDate: daysFromNow(19),
    },
  );
  await container.commercialQuotationService.sendQuotation(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    quotation2.id,
  );
  await container.commercialQuotationService.awardQuotation(
    rajasthanHeavy.userId,
    rajasthanHeavy.organizationId,
    quotation2.id,
  );
  console.log("Journey 2 complete: RFQ -> Auction -> formalized quotation -> awarded Rental.");

  // --- Execution: mobilization, activation, logsheets, and a full lifecycle for Rental 1 ---
  await container.transportService.createTransport(apex.userId, apex.organizationId, rental1.id, {
    leg: "mobilization",
    pickupLocation: "Apex Yard, Jaipur",
    destination: "Metro Bridge Site, Jaipur",
    plannedDate: daysFromNow(9),
  });
  await container.transportService.updateTransport(
    apex.userId,
    apex.organizationId,
    rental1.id,
    "mobilization",
    { status: "dispatched" },
  );
  await container.transportService.updateTransport(
    apex.userId,
    apex.organizationId,
    rental1.id,
    "mobilization",
    { status: "delivered", actualDate: daysFromNow(10) },
  );
  await container.rentalService.updateRentalStatus(
    apex.userId,
    apex.organizationId,
    rental1.id,
    "active",
  );
  await container.logsheetService.submitLogsheet(apex.userId, apex.organizationId, rental1.id, {
    logDate: daysFromNow(10),
    operatingHours: 8,
    idleHours: 1,
    overtimeHours: 0,
  });
  await container.logsheetService.submitLogsheet(apex.userId, apex.organizationId, rental1.id, {
    logDate: daysFromNow(11),
    operatingHours: 9,
    idleHours: 0.5,
    overtimeHours: 1,
  });

  const invoice1 = await container.billingService.createInvoice(apex.userId, apex.organizationId, {
    rentalId: rental1.id,
    billingPeriodStart: daysFromNow(10),
    billingPeriodEnd: daysFromNow(11),
    dueDate: daysFromNow(25),
    taxAmount: 720,
    lineItems: [{ description: "Excavator rental, 2 days @ 6000/day", quantity: 2, rate: 6000 }],
  });
  await container.billingService.updateInvoiceStatus(
    apex.userId,
    apex.organizationId,
    invoice1.id,
    "issued",
  );
  await container.billingService.recordPayment(apex.userId, apex.organizationId, invoice1.id, {
    amount: 6000,
    paidDate: daysFromNow(12),
    method: "bank_transfer",
    reference: "NEFT-DEMO-0001",
  });
  console.log(
    "Rental 1: mobilized, activated, logged, partially invoiced+paid (demonstrates an in-progress receivable).",
  );

  // Rental 2 stays "confirmed" with no execution yet — a realistic
  // "just awarded, not yet mobilized" state for demo variety.

  // --- Maintenance on the Rental Company's second (currently idle) machine ---
  await container.maintenanceService.createMaintenance(apex.userId, apex.organizationId, {
    machineId: apexExcavator2.id,
    maintenanceType: "scheduled",
    startDate: daysFromNow(-3),
    endDate: daysFromNow(-1),
    notes: "Routine 250-hour service.",
  });
  console.log("Logged a completed maintenance window on the idle second machine.");

  console.log("\nDemo data ready. Sign in with any of:");
  console.log("  owner@apex-demo.fleetip.local / DemoPass123!  (Rental Company)");
  console.log("  owner@rhm-demo.fleetip.local / DemoPass123!   (Rental Company)");
  console.log("  owner@metro-demo.fleetip.local / DemoPass123! (Renter)");
  console.log("  owner@desert-demo.fleetip.local / DemoPass123! (Renter)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
