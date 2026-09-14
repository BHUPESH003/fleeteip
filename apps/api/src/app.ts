import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController } from "fastify";
import type { FastifyError } from "fastify";
import { env } from "./infrastructure/config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import { billingRoutes } from "./modules/billing/presentation/routes.js";
import { catalogueRoutes } from "./modules/catalogue/presentation/routes.js";
import { equipmentRoutes } from "./modules/equipment/presentation/routes.js";
import { identityRoutes } from "./modules/identity/presentation/routes.js";
import { logsheetRoutes } from "./modules/logsheet/presentation/routes.js";
import { maintenanceRoutes } from "./modules/maintenance/presentation/routes.js";
import { auctionRoutes } from "./modules/marketplace/auction/presentation/routes.js";
import { commercialQuotationRoutes } from "./modules/marketplace/commercial-quotation/presentation/routes.js";
import { quotationResponseRoutes } from "./modules/marketplace/quotation-response/presentation/routes.js";
import { rentalRoutes } from "./modules/marketplace/rental/presentation/routes.js";
import { requirementRoutes } from "./modules/marketplace/rfq/presentation/routes.js";
import { projectRoutes } from "./modules/marketplace/project/presentation/routes.js";
import { workOrderRoutes } from "./modules/marketplace/work-order/presentation/routes.js";
import { staffRoutes } from "./modules/staff/presentation/routes.js";
import { platformAdminRoutes } from "./modules/platform-admin/presentation/routes.js";
import { notificationRoutes } from "./modules/notification/presentation/routes.js";
import { organizationRoutes } from "./modules/organizations/presentation/routes.js";
import { searchRoutes } from "./modules/search/presentation/routes.js";
import { transportRoutes } from "./modules/transport/presentation/routes.js";
import { AppError } from "./shared/errors.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    requestIdHeader: "x-request-id",
    logController: new LogController({ requestIdLogLabel: "reqId" }),
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });
  // global: false — registered here so routes can opt in via `config.rateLimit`,
  // not applied to the whole API. Only /auth/login and /auth/signup opt in
  // (brute-force/enumeration protection); everything else is unaffected.
  await app.register(rateLimit, { global: false });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    // Fastify's own errors (malformed JSON, validation, payload-too-large, ...)
    // already carry the correct client-error status — surface it as-is instead
    // of masking every non-AppError as an opaque 500.
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    request.log.error({ err: error }, "unhandled error");
    reply.code(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(identityRoutes);
  await app.register(organizationRoutes);
  await app.register(catalogueRoutes);
  await app.register(equipmentRoutes);
  await app.register(rentalRoutes);
  await app.register(projectRoutes);
  await app.register(requirementRoutes);
  await app.register(auctionRoutes);
  await app.register(quotationResponseRoutes);
  await app.register(commercialQuotationRoutes);
  await app.register(workOrderRoutes);
  await app.register(maintenanceRoutes);
  await app.register(transportRoutes);
  await app.register(logsheetRoutes);
  await app.register(billingRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(staffRoutes);
  await app.register(platformAdminRoutes);

  return app;
}
