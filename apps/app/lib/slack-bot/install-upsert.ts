import { type SQL, sql } from "drizzle-orm";

// "Add the bot to Slack" saves the install with one statement, so two
// installs of the same Slack workspace at once can't both insert. The
// unique index is on (team_id, coalesce(enterprise_id, '')) (manual-sql/
// 2026-11-10-slack-bot.sql), an expression Drizzle's onConflictDoUpdate
// can't name as its target, so the statement is written here. Pure: the
// database call is lib/slack-bot/store.ts saveInstallation.

export interface InstallationValues {
  id: string;
  teamId: string;
  enterpriseId: string | null;
  teamName: string | null;
  botUserId: string;
  /** Already encrypted */
  botToken: string;
  scopes: string | null;
  installedByUserId: string;
  now: Date;
}

/**
 * Inserts the install, or on a reinstall of the same workspace updates its
 * name, bot user, token, scopes and who added it (the row keeps its id and
 * when it was first added).
 */
export function installationUpsert(values: InstallationValues): SQL {
  // As Drizzle writes timestamp columns: UTC, ISO 8601.
  const at = values.now.toISOString();
  return sql`insert into slack_bot_installation (id, team_id, enterprise_id, team_name, bot_user_id, bot_token, scopes, installed_by_user_id, created_at, updated_at)
    values (${values.id}, ${values.teamId}, ${values.enterpriseId}, ${values.teamName}, ${values.botUserId}, ${values.botToken}, ${values.scopes}, ${values.installedByUserId}, ${at}, ${at})
    on conflict (team_id, (coalesce(enterprise_id, '')))
    do update set team_name = excluded.team_name, bot_user_id = excluded.bot_user_id, bot_token = excluded.bot_token, scopes = excluded.scopes, installed_by_user_id = excluded.installed_by_user_id, updated_at = excluded.updated_at`;
}
