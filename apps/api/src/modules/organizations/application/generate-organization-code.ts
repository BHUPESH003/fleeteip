import { randomInt } from "node:crypto";
import type { OrganizationRepositoryPort } from "../domain/ports.js";

const MAX_ATTEMPTS = 5;

/** Human-readable display code only (e.g. "ACMECO4821") — never used for auth/ownership/tenancy. */
export async function generateOrganizationCode(
  organizationRepository: OrganizationRepositoryPort,
  name: string,
): Promise<string> {
  const base =
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "ORG";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = randomInt(1000, 10000).toString();
    const candidate = `${base}${suffix}`;
    if (!(await organizationRepository.codeExists(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique organization code");
}
