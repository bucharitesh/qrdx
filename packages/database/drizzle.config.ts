import { defineConfig } from "drizzle-kit";
import { keys } from "./keys";

export default defineConfig({
  schema: "./schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: keys().DATABASE_URL,
  },
});
