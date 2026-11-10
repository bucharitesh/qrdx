// What the program keeps, checked against its sources: the manual SQL has
// every column the Drizzle schema declares (and the constraints the owner's
// decisions need), the terms version stored with each application is the
// date on the published terms, and the data export includes the staff note
// the privacy policy says is collected.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import { exportAffiliateData } from "@/lib/affiliates/program";
import { AFFILIATE_TERMS_VERSION } from "@/lib/affiliates/terms";
import { fakeDb } from "../support/fake-db";
import { AFFILIATE_USER, resetAffiliateDb, seedAffiliate } from "./seed";

const repo = join(import.meta.dirname, "../../../..");
const schema = readFileSync(join(repo, "packages/database/schema.ts"), "utf8");
const migration = readFileSync(
  join(repo, "packages/database/manual-sql/2026-11-10-affiliates.sql"),
  "utf8",
);

/** The SQL table names and their column names, from the schema. */
function schemaTables(): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const match of schema.matchAll(
    /export const affiliate\w* = pgTable\(\s*"(\w+)",\s*\{([\s\S]*?)\n {0,2}\}/g,
  )) {
    const columns = [
      ...(match[2] as string).matchAll(
        /\b(?:text|integer|timestamp|jsonb|boolean)\("(\w+)"/g,
      ),
    ].map((column) => column[1] as string);
    tables.set(match[1] as string, columns);
  }
  return tables;
}

/** The columns of one CREATE TABLE in the SQL. */
function sqlColumns(table: string): string[] {
  const body = migration.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(([\\s\\S]*?)\\n\\);`),
  )?.[1];
  if (!body) return [];
  return [...body.matchAll(/^\s+"(\w+)" \w+/gm)].map((m) => m[1] as string);
}

describe("the manual SQL", () => {
  it("creates every affiliate table with exactly the schema's columns", () => {
    const tables = schemaTables();
    expect([...tables.keys()].sort()).toEqual([
      "affiliate",
      "affiliate_commission",
      "affiliate_payout",
      "affiliate_referral",
      "affiliate_refunded_order",
    ]);
    for (const [table, columns] of tables) {
      expect(sqlColumns(table).sort(), table).toEqual([...columns].sort());
    }
  });

  it("is additive and idempotent", () => {
    const statements = migration
      .replace(/--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(BEGIN|COMMIT|CREATE TABLE IF NOT EXISTS|CREATE (UNIQUE )?INDEX IF NOT EXISTS)\b/,
      );
    }
    expect(
      migration.replace(/--.*$/gm, "").replace(/ON (DELETE|UPDATE)/g, ""),
    ).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE|RENAME)\b/);
  });

  it("allows one payout per PayPal reference (B5)", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_payout_paypal_reference_unique"\s+ON "affiliate_payout" USING btree \("paypal_reference"\)/,
    );
    expect(schema).toContain(
      'uniqueIndex("affiliate_payout_paypal_reference_unique").on(',
    );
  });

  it("keeps payouts when the affiliate's account goes (D-C4: set null, not cascade)", () => {
    expect(migration).toMatch(
      /"affiliate_payout_affiliate_id_affiliate_id_fk" FOREIGN KEY \("affiliate_id"\)\s+REFERENCES "public"\."affiliate"\("id"\) ON DELETE set null/,
    );
    expect(migration).toMatch(
      /"affiliate_payout_user_id_user_id_fk" FOREIGN KEY \("user_id"\)\s+REFERENCES "public"\."user"\("id"\) ON DELETE set null/,
    );
    const payout = schema.slice(
      schema.indexOf("export const affiliatePayout"),
      schema.indexOf("export const affiliateCommission"),
    );
    expect(payout).not.toMatch(/onDelete: "cascade"/);
    expect(payout.match(/onDelete: "set null"/g)).toHaveLength(2);
    // Amount, currency, rate, date and PayPal reference stay; the address can go.
    expect(migration).toMatch(
      /"paypal_email" text,\n\s+"paypal_reference" text NOT NULL/,
    );
  });

  it("keeps an affiliate's earlier code unique too (D-C3)", () => {
    expect(migration).toContain(
      'CONSTRAINT "affiliate_previous_code_unique" UNIQUE ("previous_code")',
    );
  });
});

describe("the terms version (B11)", () => {
  it("is the date on the published affiliate terms", () => {
    const terms = readFileSync(
      join(repo, "apps/docs/content/legal/affiliate-terms.mdx"),
      "utf8",
    );
    expect(terms.match(/^lastUpdated: (.+)$/m)?.[1]).toBe(
      AFFILIATE_TERMS_VERSION,
    );
  });
});

describe("the data export (B8)", () => {
  beforeEach(() => resetAffiliateDb());

  it("includes the staff note and the terms version accepted", async () => {
    seedAffiliate({ status: "suspended" });
    const stored = fakeDb.find("affiliate", { id: "aff_1" }) as Record<
      string,
      unknown
    >;
    stored.statusNote = "Bought ads on our name";
    stored.application = {
      website: "",
      promotion: "A newsletter",
      agreedToTermsAt: "2026-11-10T00:00:00.000Z",
      termsVersion: AFFILIATE_TERMS_VERSION,
    };
    const exported = await exportAffiliateData(AFFILIATE_USER.id);
    expect(exported?.affiliate).toMatchObject({
      status: "suspended",
      statusNote: "Bought ads on our name",
      application: expect.objectContaining({
        termsVersion: AFFILIATE_TERMS_VERSION,
      }),
    });
  });
});
