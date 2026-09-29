export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** One problem with one request field; `path` is dotted ("terms.rate"), empty for the whole request. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues: ValidationIssue[] = [],
  ) {
    super(message, 400, "validation_error");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "forbidden");
  }
}

export class ConflictError extends AppError {
  /** `field` names the request field the conflict is about (e.g. "assetCode"), so a form can show it there. */
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, 409, "conflict");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "not_found");
  }
}
