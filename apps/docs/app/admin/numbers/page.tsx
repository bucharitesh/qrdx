import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { NumbersSection } from "@/components/sections/home/numbers/numbers-section";
import {
  HOME_NUMBERS_FLAG,
  homeNumbersOnHomePage,
} from "@/lib/home-numbers/flag";
import { HOME_NUMBERS_REVALIDATE } from "@/lib/home-numbers/load";
import {
  HOME_NUMBERS_STATEMENT_TIMEOUT,
  queryHomeNumberCounts,
} from "@/lib/home-numbers/query";
import {
  buildHomeNumbers,
  HOME_NUMBER_IDS,
  type HomeNumberCounts,
} from "@/lib/home-numbers/stats";
import { Empty, Row, Rows } from "../_components/panel";
import { Section } from "../_components/stat-card";
import { formatDateTime, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";

export const metadata: Metadata = {
  title: "Admin · Home page numbers",
  robots: { index: false, follow: false },
};

type Read =
  | { ok: true; counts: HomeNumberCounts; countedAt: string }
  | { ok: false; message: string };

/** Read live, with the home page's query and timeout; failures are shown. */
async function readCounts(): Promise<Read> {
  try {
    return {
      ok: true,
      counts: await queryHomeNumberCounts(),
      countedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "admin.home_numbers_failed",
        error: error instanceof Error ? error.message.slice(0, 300) : "error",
      }),
    );
    return {
      ok: false,
      message:
        error instanceof Error ? error.message.slice(0, 300) : String(error),
    };
  }
}

export default async function AdminNumbersPage() {
  await requireAdmin();
  const on = homeNumbersOnHomePage();
  const read = await readCounts();
  const numbers = read.ok
    ? buildHomeNumbers(read.counts, read.countedAt)
    : null;
  const shown = new Map(numbers?.items.map((item) => [item.id, item]));

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Home page numbers"
        description="A preview of the “QRdx in numbers” section with today's real counts. Only admins can open this page."
      />

      <Section
        title={on ? "Showing on the home page" : "Hidden on the home page"}
        description={
          on
            ? `${HOME_NUMBERS_FLAG}=1 is set. The home page reads the counts when it's built, then again every ${HOME_NUMBERS_REVALIDATE / 3600} hours in the background.`
            : `To show it, set ${HOME_NUMBERS_FLAG}=1 in the deployment's environment and redeploy. Until then the home page doesn't query, render or ship any of it.`
        }
      >
        <Badge variant={on ? "default" : "secondary"}>
          {HOME_NUMBERS_FLAG}={on ? "1" : "unset"}
        </Badge>
      </Section>

      <Section
        title="The counts"
        description={`Read live just now (statement timeout ${HOME_NUMBERS_STATEMENT_TIMEOUT}). The home page shows a copy at most ${HOME_NUMBERS_REVALIDATE / 3600} hours old, rounded down.`}
      >
        {read.ok ? (
          <Rows>
            {HOME_NUMBER_IDS.map((id) => {
              const item = shown.get(id);
              return (
                <Row
                  key={id}
                  title={
                    <>
                      <span>{item?.label ?? id}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatNumber(read.counts[id])}
                      </span>
                    </>
                  }
                  meta={
                    item
                      ? `Shown as ${item.count.text}${item.since ? ` · ${item.since}` : ""}`
                      : "Zero, so the section leaves it out"
                  }
                />
              );
            })}
          </Rows>
        ) : (
          <p className="text-destructive text-sm">
            The query failed, so the home page would show no numbers section:{" "}
            {read.message}
          </p>
        )}
        {read.ok && (
          <p className="text-muted-foreground mt-3 text-xs">
            Counted {formatDateTime(read.countedAt)}.
          </p>
        )}
      </Section>

      <Section
        title="Preview"
        description="Exactly what the home page renders with these counts."
      >
        {numbers ? (
          <div className="overflow-hidden rounded-xl border">
            <NumbersSection numbers={numbers} />
          </div>
        ) : (
          <Empty>
            {read.ok
              ? "Every count is zero, so the home page would leave the section out."
              : "Nothing to preview until the query works."}
          </Empty>
        )}
      </Section>
    </div>
  );
}
