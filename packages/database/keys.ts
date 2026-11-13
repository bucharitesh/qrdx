import { onValidationError } from "@repo/next-config/env-errors";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      // Postgres connection string (Neon works as is)
      DATABASE_URL: z.url(),
      // Neon-compatible HTTP proxy in front of plain Postgres (self-hosting).
      DATABASE_HTTP_ENDPOINT: z.url().optional(),
    },
    runtimeEnv: {
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_HTTP_ENDPOINT: process.env.DATABASE_HTTP_ENDPOINT,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });
