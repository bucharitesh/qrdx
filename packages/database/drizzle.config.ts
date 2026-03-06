import { defineConfig } from "drizzle-kit";
import { keys } from "./keys";

export default defineConfig({
  schema: "./schema.ts",
  out: "./",
  dialect: "postgresql",
  dbCredentials: {
    url: keys().DATABASE_URL,
  },
});
