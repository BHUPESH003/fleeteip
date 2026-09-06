import { z } from "zod";
import {
  membershipWithOrganizationSchema,
  organizationTypeCodeSchema,
} from "../organization/index.js";

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(10).max(200);

export const userSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  displayName: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

/** Signup creates a user AND their first organization (as owner) in one step. */
export const signupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
  organizationTypeCode: organizationTypeCodeSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Response to "who am I" — the authenticated user plus every organization they belong to. */
export const authenticatedSessionSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipWithOrganizationSchema),
});
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
