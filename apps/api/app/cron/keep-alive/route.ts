import { database as db, eq, page } from "@repo/database";

export const GET = async () => {
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
