import { ApiError } from "./api-client";

/**
 * Error translation (UX pass §07): say what happened, whether it's the
 * user's to fix, and the one next step. Server text is mapped to plain
 * language where known; 500s never show server text.
 */
export interface FriendlyError {
  title: string;
  body: string;
  /** True when the failure is a lost connection (nothing was saved). */
  network?: boolean;
  status: number;
}

const CONFLICT_COPY: Array<[RegExp, string]> = [
  [/asset code already exists/i, "That asset code is already used by another machine in your organization."],
  [/committed to a rental for part of this period/i, "A rental is booked on this machine for part of those dates."],
  [/not available for the requested period|already committed for an overlapping period/i, "This machine is already booked for part of those dates."],
  [/scheduled for maintenance/i, "A workshop job is booked on this machine for part of those dates."],
  [/retired and cannot be/i, "Retired machines can't be rented or activated."],
  [/terms can only be edited while the rental is confirmed/i, "Terms can only be edited before the rental starts."],
  [/no actual dates are pending verification/i, "These dates were already verified or disputed."],
  [/cannot transition/i, "This record changed since the page loaded. Reload to see its current status, then try again."],
];

function translateConflict(message: string): string {
  for (const [pattern, copy] of CONFLICT_COPY) if (pattern.test(message)) return copy;
  return message;
}

export function describeError(error: unknown, fallbackTitle = "That didn't work"): FriendlyError {
  if (!(error instanceof ApiError)) {
    return {
      title: fallbackTitle,
      body: "Something unexpected happened in the browser. Reload the page and try again.",
      status: -1,
    };
  }
  switch (error.status) {
    case 0:
      return {
        title: "You're offline",
        body: "FleetIP couldn't be reached, so nothing was saved. Check your connection and try again.",
        network: true,
        status: 0,
      };
    case 400: {
      const { formError, fieldErrors } = parseValidationIssues(error);
      const first = formError ?? Object.values(fieldErrors)[0];
      return {
        title: fallbackTitle,
        body: first ?? "Something in this request wasn't understood. Reload and try again; your entries are kept.",
        status: 400,
      };
    }
    case 401:
      return {
        title: "You've been signed out",
        body: "For security, sessions end after inactivity. Sign in to pick up where you left off.",
        status: 401,
      };
    case 403:
      return {
        title: "You don't have access to this",
        body: "Your role doesn't include the permission this needs. Ask an organization admin to add it.",
        status: 403,
      };
    case 404:
      return {
        title: "We can't find that record",
        body: "It may belong to another organization, or it was changed since this page loaded. Reload and try again.",
        status: 404,
      };
    case 409:
      return { title: fallbackTitle, body: translateConflict(error.message), status: 409 };
    case 429:
      return {
        title: "Too many requests just now",
        body: "Wait a few seconds, then try again.",
        status: 429,
      };
    default:
      return {
        title: fallbackTitle,
        body: "The problem is on our side, not with your data. Try again in a minute; if it keeps happening, contact support.",
        status: error.status,
      };
  }
}

const ZOD_DEFAULTS: Array<[RegExp, string]> = [
  [/string must contain at least 1 character/i, "This can't be empty."],
  [/^required$/i, "This is required."],
  [/expected number, received nan/i, "Enter a number."],
  [/invalid date/i, "Enter a valid date."],
  [/number must be greater than 0/i, "Enter a value above 0."],
  [/number must be greater than or equal to 0/i, "Enter 0 or more."],
  [/invalid email/i, "Enter a valid email address."],
  [/string must contain at most (\d+) character/i, "This is too long."],
];

function humanizeIssue(message: string): string {
  for (const [pattern, copy] of ZOD_DEFAULTS) if (pattern.test(message)) return copy;
  return message.endsWith(".") ? message : `${message}.`;
}

/**
 * Splits a 400 into per-field messages (keyed by the request path, e.g.
 * "terms.rate") and one form-level message for issues with no path.
 */
export function parseValidationIssues(error: unknown): {
  fieldErrors: Record<string, string>;
  formError?: string;
} {
  if (!(error instanceof ApiError) || error.status !== 400) return { fieldErrors: {} };
  if (!error.issues.length) return { fieldErrors: {}, formError: humanizeIssue(error.message) };
  const fieldErrors: Record<string, string> = {};
  const unpathed: string[] = [];
  for (const issue of error.issues) {
    if (!issue.path) unpathed.push(humanizeIssue(issue.message));
    else fieldErrors[issue.path] ??= humanizeIssue(issue.message);
  }
  return { fieldErrors, formError: unpathed.length ? unpathed.join(" ") : undefined };
}

export const OFFLINE_HINT = "You're offline. Changes can't be saved until the connection is back.";

/** What a failed save shows: messages under fields, and/or one banner. */
export interface FormFailure {
  fieldErrors: Record<string, string>;
  banner: { title: string; body: string } | null;
}

/**
 * The one place a failed write becomes UI. A 400 goes under its fields, a
 * 409 about one field goes under that field, anything else is a banner
 * titled with what didn't happen ("RN-1234 wasn't started").
 * `conflicts` overrides the 409 copy for a form that knows better.
 */
export function toFormFailure(error: unknown, failTitle: string, conflicts?: Record<string, string>): FormFailure {
  if (error instanceof ApiError && error.status === 400) {
    const { fieldErrors, formError } = parseValidationIssues(error);
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      fieldErrors,
      banner: formError || !hasFields ? { title: hasFields ? "Some entries need attention" : failTitle, body: formError ?? describeError(error, failTitle).body } : null,
    };
  }
  if (error instanceof ApiError && error.status === 409 && error.field) {
    return { fieldErrors: { [error.field]: conflicts?.[error.field] ?? translateConflict(error.message) }, banner: null };
  }
  const friendly = describeError(error, failTitle);
  return { fieldErrors: {}, banner: { title: friendly.title, body: friendly.body } };
}

/** Error status helpers for page-level states. */
export function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : -1;
}
