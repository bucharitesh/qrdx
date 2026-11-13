import { onValidationError } from "@repo/next-config/env-errors";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {
      // Origin for default short links (falls back to the site URL)
      NEXT_PUBLIC_SHORT_LINK_BASE_URL: z.url().optional(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_SHORT_LINK_BASE_URL:
        process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });
