import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";
import { keys } from "./keys";

// drizzle-kit reads the app's env file, the one local env file the repo
// uses, unless DATABASE_URL is already set (a shell, CI or one-off command).
const appEnvFile = fileURLToPath(
  new URL("../../apps/app/.env.local", import.meta.url)
);
if (!process.env.DATABASE_URL && existsSync(appEnvFile)) {
  process.loadEnvFile(appEnvFile);
}

export default defineConfig({
  schema: "./schema.ts",
  out: "./",
  dialect: "postgresql",
  dbCredentials: {
    url: keys().DATABASE_URL,
  },
});
