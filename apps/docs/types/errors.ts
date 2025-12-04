import z from "zod";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class SubscriptionRequiredError extends Error {
  constructor(
    message = "Subscription required",
    public data?: unknown,
  ) {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

export class QRCodeThemeNotFoundError extends Error {
  constructor(message = "QR code theme not found") {
    super(message);
    this.name = "QRCodeThemeNotFoundError";
  }
}

export class QRCodeThemeLimitError extends Error {
  constructor(message = "QR code theme limit reached") {
    super(message);
    this.name = "QRCodeThemeLimitError";
  }
}

export type ApiErrorCode =
  | "SUBSCRIPTION_REQUIRED"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "UNKNOWN_ERROR";

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public data?: unknown,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const MyErrorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
  status: z.number().optional(),
});

export type MyErrorResponseType = z.infer<typeof MyErrorResponseSchema>;
