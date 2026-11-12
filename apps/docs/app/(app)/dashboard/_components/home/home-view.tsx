import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { use } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { PLAN_NAMES } from "@/lib/pricing";
import { workspaceHref } from "@/lib/workspace-paths";
import type { HomeData } from "./home-data";
import { NewCodeButton } from "./new-code-button";
import { SetupChecklist } from "./setup-checklist";

const number = (value: number) => value.toLocaleString("en-US");

function Stat({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring/50 min-w-0 rounded-xl border p-3 outline-none transition-colors focus-visible:ring-[3px] sm:p-4"
      href={href}
    >
      <div className="text-muted-foreground text-[11px] font-medium leading-tight sm:text-xs">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
        {value}
      </div>
    </Link>
  );
}

const STATUS_LABELS = {
  archived: "Archived",
  disabled: "Disabled",
} as const;

/** The app's front page: setup, the numbers that matter, the newest codes. */
export function HomeView({ data, slug }: { data: HomeData; slug: string }) {
  const t = use(getAppTranslations("app.dashboard.home.homeView"));
  const workspace = data.teamName ?? "Workspace";
  const href = (path: string) => workspaceHref(slug, path);

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("workspaceValuePlan", {
          workspace,
          value: PLAN_NAMES[data.plan],
        })}
        title={t("home")}
      >
        <NewCodeButton />
      </PageHeader>

      <SetupChecklist tasks={data.tasks} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          href={href("/codes")}
          label={t("dynamicQrCodes")}
          value={
            data.codes.limit === null
              ? number(data.codes.used)
              : t("usedOfLimit", {
                  used: number(data.codes.used),
                  limit: number(data.codes.limit),
                })
          }
        />
        <Stat
          href={href("/analytics")}
          label={t("scansAllTime")}
          value={number(data.totalScans)}
        />
        <Stat
          href={href("/pages")}
          label={t("landingPages")}
          value={number(data.pages)}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">{t("recentCodes")}</CardTitle>
          {data.recent.length > 0 && (
            <Link
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
              href={href("/codes")}
            >
              {t("viewAll")}
            </Link>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {data.recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("noDynamicCodesYetTheyre")}
            </p>
          ) : (
            <ul className="-mx-2 divide-y">
              {data.recent.map((code) => {
                const status =
                  code.status === "active"
                    ? code.paused
                      ? "Paused"
                      : null
                    : STATUS_LABELS[code.status];
                return (
                  <li key={code.id}>
                    <Link
                      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-4 rounded-md px-2 py-3 outline-none focus-visible:ring-[3px]"
                      href={href(`/codes/${encodeURIComponent(code.id)}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {code.title}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {code.shortLink}
                        </div>
                      </div>
                      {status && <Badge variant="outline">{status}</Badge>}
                      <div className="text-muted-foreground shrink-0 text-sm">
                        {number(code.scans)}{" "}
                        {code.scans === 1 ? t("scan") : t("scans")}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
