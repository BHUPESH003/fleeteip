import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { LogController } from "fastify";
import { env } from "./infrastructure/config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import { identityRoutes } from "./modules/identity/presentation/routes.js";
import { AppError } from "./shared/errors.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    requestIdHeader: "x-request-id",
    logController: new LogController({ requestIdLogLabel: "reqId" }),
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    request.log.error({ err: error }, "unhandled error");
    reply.code(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(identityRoutes);

  return app;
}
