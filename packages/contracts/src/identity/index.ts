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

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/** Same password rules as signup (passwordSchema). */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmSchema>;

/** Response to "who am I" — the authenticated user plus every organization they belong to. */
export const authenticatedSessionSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipWithOrganizationSchema),
});
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;

/** Signed-in password change. newPassword follows the signup rules; the other sessions are signed out. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** One signed-in device. Never carries token data. */
export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
