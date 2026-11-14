import "server-only";

// The main app decides which integrations it offers from its environment and
// database; the docs site reads the result (lib/feature-availability.ts).
export { isIntegrationVisible } from "@/lib/feature-availability";
