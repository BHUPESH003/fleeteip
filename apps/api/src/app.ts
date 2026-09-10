import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { LogController } from "fastify";
import type { FastifyError } from "fastify";
import { env } from "./infrastructure/config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import { catalogueRoutes } from "./modules/catalogue/presentation/routes.js";
import { equipmentRoutes } from "./modules/equipment/presentation/routes.js";
import { identityRoutes } from "./modules/identity/presentation/routes.js";
import { rentalRoutes } from "./modules/marketplace/rental/presentation/routes.js";
import { AppError } from "./shared/errors.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    requestIdHeader: "x-request-id",
    logController: new LogController({ requestIdLogLabel: "reqId" }),
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });

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
  await app.register(catalogueRoutes);
  await app.register(equipmentRoutes);
  await app.register(rentalRoutes);

  return app;
}
