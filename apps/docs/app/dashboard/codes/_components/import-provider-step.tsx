"use client";

import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight2, Clock, DocumentUpload } from "iconsax-reactjs";
import Link from "next/link";
import {
  API_PROVIDER_IDS,
  API_PROVIDERS,
  type ApiProviderId,
  FILE_PROVIDER_IDS,
  FILE_PROVIDERS,
  type FileProviderId,
  type ProviderId,
  providerName,
} from "@/lib/migrate/providers";
import type { JobSummary, ProviderStatus } from "@/lib/migrate/types";
import { formatDay, ProviderLogo, plural, StepLayout } from "./import-shared";

function metaFor(
  id: ApiProviderId,
  entry: ProviderStatus | undefined,
  loaded: boolean,
): string {
  if (!loaded) return "Checking connection…";
  if (entry?.connection === "active") return "Connected";
  // Local dev only: production leaves these providers out.
  if (entry?.needsSetup?.length)
    return `Needs setup · ${entry.needsSetup.join(", ")}`;
  if (entry?.connection === "error") return "Reconnect needed";
  return API_PROVIDERS[id].connect === "oauth"
    ? "Connect by signing in"
    : "Connect with an API key";
}

function Tile({
  provider,
  meta,
  onClick,
}: {
  provider: ProviderId;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-foreground/15 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={onClick}
      type="button"
    >
      <ProviderLogo provider={provider} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {providerName(provider) === "CSV"
            ? FILE_PROVIDERS.csv.name
            : providerName(provider)}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {meta}
        </span>
      </span>
      <ArrowRight2
        aria-hidden
        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </button>
  );
}

export function ProviderStep({
  statuses,
  jobs,
  onPickApi,
  onPickFile,
  onOpenJob,
}: {
  statuses: ProviderStatus[] | null;
  jobs: JobSummary[];
  onPickApi: (provider: ApiProviderId) => void;
  onPickFile: (provider: FileProviderId) => void;
  onOpenJob: (job: JobSummary) => void;
}) {
  const status = (id: ApiProviderId) =>
    statuses?.find((entry) => entry.id === id);
  // Providers this deployment doesn't offer (they need setup in production).
  const apiIds = API_PROVIDER_IDS.filter(
    (id) => status(id)?.available !== false,
  );

  return (
    <StepLayout>
      <div className="space-y-6">
        {apiIds.length > 0 && (
          <section className="space-y-2.5">
            <div>
              <h3 className="text-sm font-semibold">
                From a connected account
              </h3>
              <p className="text-muted-foreground text-xs">
                Pick links from the account, preview, import. Where the API
                allows it, old links can then point to their new QRdx codes.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {apiIds.map((id) => (
                <Tile
                  key={id}
                  meta={metaFor(id, status(id), statuses !== null)}
                  onClick={() => onPickApi(id)}
                  provider={id}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2.5">
          <div>
            <h3 className="text-sm font-semibold">From an export file</h3>
            <p className="text-muted-foreground text-xs">
              For providers without API access. Upload a CSV, check the columns,
              then preview and import.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {FILE_PROVIDER_IDS.map((id) => (
              <Tile
                key={id}
                meta={
                  id === "csv"
                    ? "Any CSV with destination URLs"
                    : FILE_PROVIDERS[id].export === "documented"
                      ? "CSV export"
                      : FILE_PROVIDERS[id].export === "none"
                        ? "Spreadsheet you make"
                        : "CSV export (check columns)"
                }
                onClick={() => onPickFile(id)}
                provider={id}
              />
            ))}
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <DocumentUpload aria-hidden className="size-3.5" />
            Already using the QRdx CSV template?{" "}
            <Link
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              href="/dashboard/codes/import"
            >
              Import CSV
            </Link>
          </p>
        </section>

        {jobs.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold">Recent imports</h3>
            <ul className="divide-y rounded-xl border">
              {jobs.slice(0, 5).map((job) => (
                <li key={job.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/40"
                    onClick={() => onOpenJob(job)}
                    type="button"
                  >
                    <ProviderLogo provider={job.provider} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {providerName(job.provider)} ·{" "}
                        {plural(job.created, "code")} created
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatDay(job.createdAt)}
                        {job.redirected > 0 &&
                          ` · ${plural(job.redirected, "old link")} pointing to QRdx`}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        job.status === "running"
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {job.status === "running" ? (
                        <>
                          <Clock aria-hidden className="size-3.5" />
                          Resume {job.processed}/{job.total}
                        </>
                      ) : (
                        "Open"
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </StepLayout>
  );
}
