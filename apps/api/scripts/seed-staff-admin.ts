/**
 * Provisions (or updates the password of) one real FleetIP staff account —
 * the only way a Platform Admin account is ever created. Deliberately no
 * signup route, no hardcoded bypass credential (see this phase's brief
 * §13/§27 and docs/platform-admin-architecture-requirements.md point 4):
 * an operator runs this once, out of band, with real credentials of their
 * choosing.
 *
 * Usage:
 *   STAFF_ADMIN_EMAIL=ops@fleetip.internal STAFF_ADMIN_PASSWORD=... STAFF_ADMIN_NAME="FleetIP Ops" \
 *     pnpm --filter @fleetip/api run seed:staff-admin
 */
import { db } from "../src/infrastructure/database/client.js";
import { StaffUserRepository } from "../src/modules/staff/infrastructure/staff-user-repository.js";
import { hashPassword } from "../src/modules/identity/domain/password.js";

async function main() {
  const email = process.env.STAFF_ADMIN_EMAIL;
  const password = process.env.STAFF_ADMIN_PASSWORD;
  const displayName = process.env.STAFF_ADMIN_NAME ?? "FleetIP Staff";

  if (!email || !password) {
    throw new Error("STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required.");
  }
  if (password.length < 12) {
    throw new Error("STAFF_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const staffUserRepository = new StaffUserRepository(db);
  const existing = await staffUserRepository.findByEmail(email);
  if (existing) {
    throw new Error(
      `A staff account with email ${email} already exists (id: ${existing.id}). ` +
        "Changing an existing staff password isn't wired up yet — delete the row and rerun if needed.",
    );
  }

  const passwordHash = await hashPassword(password);
  const staffUser = await staffUserRepository.create({ email, passwordHash, displayName });
  console.log(`Staff account created: ${staffUser.email} (id: ${staffUser.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to provision staff account:", error);
    process.exit(1);
  });
