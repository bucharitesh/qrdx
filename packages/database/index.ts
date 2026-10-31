import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { keys } from "./keys";
import * as schema from "./schema";

const { DATABASE_URL, DATABASE_HTTP_ENDPOINT } = keys();

if (DATABASE_HTTP_ENDPOINT) {
  neonConfig.fetchEndpoint = DATABASE_HTTP_ENDPOINT;
}

const client = neon(DATABASE_URL);
export const database = drizzle({ client, schema });

export { eq } from "drizzle-orm";
export * from "./schema";
