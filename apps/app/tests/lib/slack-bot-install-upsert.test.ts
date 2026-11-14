// "Add the bot to Slack" saves its install with one upsert on the unique
// (team_id, coalesce(enterprise_id, '')) index (lib/slack-bot/install-upsert.ts).
// Rendered here by Drizzle's real Postgres dialect, exactly as it goes to the
// database; nothing connects to one. The route test runs the same statement
// against the in-memory fake (tests/api/slack-bot.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { installationUpsert } from "@/lib/slack-bot/install-upsert";

const ROOT = join(import.meta.dirname, "../../../..");

describe("installationUpsert", () => {
  const now = new Date(Date.UTC(2026, 10, 10, 12, 0, 0));
  const query = new PgDialect().sqlToQuery(
    installationUpsert({
      id: "inst_1",
      teamId: "T0ACME",
      enterpriseId: null,
      teamName: "Acme",
      botUserId: "U0BOT",
      botToken: "v1:ciphertext",
      scopes: "commands",
      installedByUserId: "u_ana",
      now,
    }),
  );
  const text = query.sql.replace(/\s+/g, " ").trim();

  it("conflicts on the workspace's unique index and updates the install", () => {
    expect(text).toBe(
      "insert into slack_bot_installation (id, team_id, enterprise_id, team_name, bot_user_id, bot_token, scopes, installed_by_user_id, created_at, updated_at) " +
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) " +
        "on conflict (team_id, (coalesce(enterprise_id, ''))) " +
        "do update set team_name = excluded.team_name, bot_user_id = excluded.bot_user_id, bot_token = excluded.bot_token, scopes = excluded.scopes, installed_by_user_id = excluded.installed_by_user_id, updated_at = excluded.updated_at",
    );
    // Every value is a parameter, never part of the text.
    expect(query.params).toEqual([
      "inst_1",
      "T0ACME",
      null,
      "Acme",
      "U0BOT",
      "v1:ciphertext",
      "commands",
      "u_ana",
      "2026-11-10T12:00:00.000Z",
      "2026-11-10T12:00:00.000Z",
    ]);
  });

  it("names the index the manual SQL created", () => {
    const sql = readFileSync(
      join(ROOT, "packages/database/manual-sql/2026-11-10-slack-bot.sql"),
      "utf8",
    );
    expect(sql).toContain(
      `CREATE UNIQUE INDEX IF NOT EXISTS "slack_bot_installation_team_unique"\n  ON "slack_bot_installation" USING btree ("team_id", coalesce("enterprise_id", ''));`,
    );
    const schema = readFileSync(
      join(ROOT, "packages/database/schema.ts"),
      "utf8",
    );
    expect(schema).toMatch(
      /uniqueIndex\("slack_bot_installation_team_unique"\)\.on\(\s*table\.teamId,\s*sql`coalesce\(\$\{table\.enterpriseId\}, ''\)`/,
    );
  });
});
