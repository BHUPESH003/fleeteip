import type { ZodType } from "zod";
import { ValidationError } from "./errors.js";

export function parseWithSchema<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    const message = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new ValidationError(message, issues);
  }
  return result.data;
}
