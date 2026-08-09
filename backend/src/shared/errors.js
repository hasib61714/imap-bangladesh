/**
 * One error taxonomy — IMAP
 *
 * I-01. `docs/architecture/API-ARCHITECTURE.md` §4 requires one error
 * envelope everywhere; the audit found four in use. An error class carries
 * the machine-readable `code` clients switch on, both locale strings, and
 * whether a retry is meaningful. The transport layer maps a class to a
 * status; nothing else decides one.
 *
 * Nothing here touches HTTP. These are domain and application errors, so
 * the same object is correct whether it surfaces over HTTP, over a socket,
 * inside a job, or (at Gate 2) through an AI tool.
 */

/** Status is a property of the error class, not of the handler that catches it. */
const STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
};

class AppError extends Error {
  /**
   * @param {object} spec
   * @param {string} spec.code        stable, machine-readable — clients switch on this
   * @param {string} spec.message     developer-facing English; never shown to a user
   * @param {number} spec.status
   * @param {{bn: string, en: string}} [spec.userMessage] safe to display
   * @param {boolean} [spec.retryable]
   * @param {Array<{field: string, code: string}>} [spec.fields]
   * @param {object} [spec.details]   actionable extras — alternatives, refund consequence
   * @param {Error}  [spec.cause]     retained for logs; never serialised to a client
   */
  constructor({ code, message, status, userMessage, retryable = false, fields, details, cause }) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.userMessage = userMessage || null;
    this.retryable = retryable;
    this.fields = fields || null;
    this.details = details || null;
    if (cause) this.cause = cause;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * The client-facing envelope. Deliberately narrow: no stack, no cause, no
   * SQL, no internal ids. `correlation_id` is attached by the transport,
   * which is the only layer that knows the request.
   */
  toEnvelope(correlationId) {
    return {
      error: {
        code: this.code,
        message: this.message,
        user_message: this.userMessage,
        retryable: this.retryable,
        correlation_id: correlationId || null,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

class ValidationError extends AppError {
  constructor(message, { fields, userMessage, details } = {}) {
    super({ code: "VALIDATION_FAILED", message, status: STATUS.VALIDATION, userMessage, fields, details });
  }
}

class UnprocessableError extends AppError {
  constructor(code, message, { userMessage, fields, details } = {}) {
    super({ code, message, status: STATUS.UNPROCESSABLE, userMessage, fields, details });
  }
}

class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super({ code: "UNAUTHENTICATED", message, status: STATUS.UNAUTHENTICATED });
  }
}

/**
 * Forbidden and NotFound both exist, but a resource the actor may not see
 * must be reported with NotFound — `API-ARCHITECTURE.md` §4.1 makes 404 and
 * 403 deliberately indistinguishable so the API cannot be used to enumerate
 * ids. Use Forbidden only where the actor already knows the resource exists.
 */
class ForbiddenError extends AppError {
  constructor(action, reason) {
    super({
      code: "FORBIDDEN",
      message: `Not permitted: ${action}${reason ? ` (${reason})` : ""}`,
      status: STATUS.FORBIDDEN,
    });
    this.deniedAction = action;
    this.denyReason = reason || null;
  }
}

class NotFoundError extends AppError {
  constructor(resourceType) {
    super({ code: "NOT_FOUND", message: `${resourceType} not found`, status: STATUS.NOT_FOUND });
  }
}

class ConflictError extends AppError {
  constructor(code, message, { userMessage, details } = {}) {
    super({ code, message, status: STATUS.CONFLICT, userMessage, details });
  }
}

class GoneError extends AppError {
  constructor(code, message) {
    super({ code, message, status: STATUS.GONE });
  }
}

class RateLimitedError extends AppError {
  constructor(retryAfterSeconds) {
    super({ code: "RATE_LIMITED", message: "Too many requests", status: STATUS.RATE_LIMITED, retryable: true });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A capability the platform has but cannot currently provide. Distinct from
 * an internal error: the payment gateway being unconfigured in production is
 * a 503 and never a mock settlement (P0-12).
 */
class CapabilityUnavailableError extends AppError {
  constructor(code, message, { userMessage } = {}) {
    super({ code, message, status: STATUS.UNAVAILABLE, userMessage, retryable: true });
  }
}

/**
 * Something the process should have refused to start with. Thrown at
 * startup, never per request — a use case with no authorization policy, a
 * job with no idempotency declaration, a missing required config value.
 */
class StartupError extends Error {
  constructor(message) {
    super(message);
    this.name = "StartupError";
  }
}

const isAppError = (e) => e instanceof AppError;

module.exports = {
  STATUS,
  AppError,
  ValidationError,
  UnprocessableError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  RateLimitedError,
  CapabilityUnavailableError,
  StartupError,
  isAppError,
};
