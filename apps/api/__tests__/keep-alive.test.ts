import { beforeEach, expect, test, vi } from "vitest";

const CRON_SECRET = "test-cron-secret-value";

const db = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: "page-id" }]);
  const where = vi.fn(async () => undefined);
  return {
    returning,
    where,
    database: {
      insert: vi.fn(() => ({ values: () => ({ returning }) })),
      delete: vi.fn(() => ({ where })),
    },
  };
});

vi.mock("@repo/database", () => ({
  database: db.database,
  eq: vi.fn(),
  page: { id: "id" },
}));

vi.mock("@/env", () => ({ env: { CRON_SECRET } }));

const { GET } = await import("../app/cron/keep-alive/route");

beforeEach(() => {
  vi.clearAllMocks();
});

test("rejects requests without the cron secret", async () => {
  const response = await GET(new Request("http://localhost/cron/keep-alive"));
  expect(response.status).toBe(401);
  expect(db.database.insert).not.toHaveBeenCalled();
});

test("rejects requests with a wrong cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/cron/keep-alive", {
      headers: { authorization: "Bearer wrong-secret" },
    })
  );
  expect(response.status).toBe(401);
  expect(db.database.insert).not.toHaveBeenCalled();
});

test("runs the keep-alive query with the cron secret", async () => {
  const response = await GET(
    new Request("http://localhost/cron/keep-alive", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
  );
  expect(response.status).toBe(200);
  expect(db.database.insert).toHaveBeenCalledOnce();
  expect(db.where).toHaveBeenCalledOnce();
});
