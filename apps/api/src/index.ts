import { buildApp } from "./app.js";
import { env } from "./infrastructure/config/env.js";
import { container } from "./infrastructure/container.js";
import { startReminderScheduler } from "./modules/reminders/application/reminder-service.js";

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  if (env.REMINDERS_ENABLED) startReminderScheduler(container.reminderService, app.log);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
