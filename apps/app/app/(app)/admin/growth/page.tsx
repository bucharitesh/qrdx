import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { Panel, SubHeading } from "../_components/panel";
import { REAL_SCAN_AFTER } from "../_lib/growth";
import { requireAdmin } from "../_lib/guard";
import { adminMetadata } from "../_lib/metadata";
import { GSC_PROPERTY } from "../_lib/search-console";
import { GROWTH_WEEKS, growthWeeks } from "../_lib/weeks";
import {
  Activation,
  CodesAndScans,
  DeveloperAccounts,
  DeveloperUsage,
  NpmDownloads,
  SearchConsole,
  Signups,
} from "./sections";

export const generateMetadata = adminMetadata("Admin · Growth");

export default async function AdminGrowthPage() {
  await requireAdmin();
  const now = new Date();
  const weeks = growthWeeks(now);

  return (
    <div className="space-y-4">
      <SettingsHeader
        description={`Weekly counts for the last ${GROWTH_WEEKS} UTC weeks (Monday to Sunday; the newest is still running). Admin accounts, test addresses and everything they own are left out. The numbers are small, so counts come first.`}
        title="Growth"
      />

      <Panel
        description="Each sign-up's channel is worked out on the server from the visit the account was made in (not the first visit ever). Accounts from before that was recorded are “unknown”."
        id="signups"
        title="Sign-ups by channel"
      >
        <Signups weeks={weeks} />
      </Panel>

      <Panel
        description={`Each step is counted on its own, as a share of the cohort. *Real scan is a heuristic: a scan of one of their codes more than ${REAL_SCAN_AFTER} after it was made (the creator's own test scans come right away). *Week 2 is approximate: a sign-in, session refresh, or code made or edited 7 to 14 days after signing up; a session keeps only its latest refresh. Grey: the cohort's window hasn't closed yet. Paid: an active or trialing subscription now.`}
        id="activation"
        title="Activation by weekly cohort"
      >
        <Activation now={now} weeks={weeks} />
      </Panel>

      <Panel
        description={`Dynamic codes only (static codes aren't stored). *Real scans: more than ${REAL_SCAN_AFTER} after the code was made.`}
        id="codes"
        title="Codes and scans"
      >
        <CodesAndScans weeks={weeks} />
      </Panel>

      <Panel
        description="API keys and OAuth tokens of counted accounts. Usage counts have no accounts in them, so admins' own calls are included there."
        id="developers"
        title="Developers"
      >
        <div className="space-y-2">
          <DeveloperAccounts />
          <SubHeading>API, MCP and bot calls</SubHeading>
          <DeveloperUsage weeks={weeks} />
        </div>
      </Panel>

      <Panel
        description="Downloads per week without the days a version was published (mirrors and scanners fetch every new version); in brackets, with them. From npm, read every 6 hours."
        id="npm"
        title="npm downloads"
      >
        <NpmDownloads now={now} weeks={weeks} />
      </Panel>

      <Panel
        description={`Google Search Console for ${GSC_PROPERTY}.`}
        id="search"
        title="Search"
      >
        <SearchConsole now={now} weeks={weeks} />
      </Panel>
    </div>
  );
}
