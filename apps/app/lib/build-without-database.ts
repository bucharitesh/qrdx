import "server-only";

import { connection } from "next/server";

// The Docker image is built before any database exists, so the Dockerfile's
// build stage sets QRDX_BUILD_WITHOUT_DATABASE=1. The runtime image never has
// it. Vercel and manual builds have a database and leave it unset.

/** Whether this is a `next build` that has no database to read. */
export function buildingWithoutDatabase(): boolean {
  return process.env.QRDX_BUILD_WITHOUT_DATABASE === "1";
}

/**
 * For a page that reads the database while it renders. In a build without
 * a database, the page is rendered at request time instead of failing the
 * build. Everywhere else this does nothing and the page stays static.
 */
export async function readsDatabaseWhileRendering(): Promise<void> {
  if (buildingWithoutDatabase()) await connection();
}
