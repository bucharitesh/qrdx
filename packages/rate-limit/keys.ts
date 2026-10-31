import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      UPSTASH_REDIS_REST_URL: z.url().optional(),
      UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
      // Names set by the Vercel KV / Upstash marketplace integration
      KV_REST_API_URL: z.url().optional(),
      KV_REST_API_TOKEN: z.string().optional(),
    },
    runtimeEnv: {
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    },
    emptyStringAsUndefined: true,
  });
