/**
 * Typed application errors. Everything thrown by services is either an
 * AppError (safe to surface) or an unexpected error (logged, generic message).
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "READ_ONLY"
  | "SUSPENDED"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export function toApiError(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    const statusByCode: Record<ErrorCode, number> = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION: 422,
      CONFLICT: 409,
      READ_ONLY: 403,
      SUSPENDED: 403,
      RATE_LIMITED: 429,
      BAD_REQUEST: 400,
      INTERNAL: 500,
    };
    return {
      status: statusByCode[error.code],
      body: {
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
      },
    };
  }
  console.error("[unexpected]", error);
  return {
    status: 500,
    body: {
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    },
  };
}
