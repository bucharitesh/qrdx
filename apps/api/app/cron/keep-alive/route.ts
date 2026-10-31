import { timingSafeEqual } from "node:crypto";
import { database as db, eq, page } from "@repo/database";
import { env } from "@/env";

function isAuthorizedCronRequest(request: Request): boolean {
  if (!env.CRON_SECRET) {
    // Fail closed in production so the DB write can't be triggered publicly.
    return process.env.NODE_ENV !== "production";
  }

  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export const GET = async (request: Request) => {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = crypto.randomUUID();
  const [newPage] = await db
    .insert(page)
    .values({ id, name: "cron-temp" })
    .returning();

  if (newPage) {
    await db.delete(page).where(eq(page.id, newPage.id));
  }

  return new Response("OK", { status: 200 });
};
