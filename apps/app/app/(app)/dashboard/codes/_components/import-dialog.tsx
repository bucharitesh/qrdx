"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Import } from "iconsax-reactjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Translator } from "@/lib/i18n/translator";
import { httpClient, type MigrateClient } from "@/lib/migrate/client";
import {
  type ApiProviderId,
  type FileProviderId,
  getProvider,
  isApiProviderId,
  isRetiredProvider,
  type ProviderId,
  parseProviderParam,
  providerName,
} from "@/lib/migrate/providers";
import type {
  JobSummary,
  ProvidersInfo,
  SourceLink,
} from "@/lib/migrate/types";
import { FileStep } from "./import-file-step";
import { LinksStep } from "./import-links-step";
import { PreviewStep } from "./import-preview-step";
import { ProviderStep } from "./import-provider-step";
import { RedirectsStep } from "./import-redirects-step";
import { RunStep } from "./import-run-step";

type Step =
  | { name: "pick" }
  | { name: "links"; provider: ApiProviderId }
  | { name: "file"; provider: FileProviderId }
  | { name: "preview"; provider: ProviderId; links: SourceLink[]; from: Step }
  | { name: "run"; provider: ProviderId; jobId: string }
  | { name: "redirects"; provider: ApiProviderId; jobId: string };

const IMPORT_PARAM = "import";
// Set by the integration OAuth callback when a sign-in came back unconnected.
const CONNECT_ERROR_PARAM = "connect_error";

function stepFor(provider: ProviderId | null): Step {
  if (!provider) return { name: "pick" };
  return isApiProviderId(provider)
    ? { name: "links", provider }
    : { name: "file", provider };
}

function heading(
  step: Step,
  t: Translator<"app.dashboard.codes.importDialog">,
): { title: string; description: string } {
  switch (step.name) {
    case "links":
      return {
        title: t("importFromValue", { value: providerName(step.provider) }),
        description: t("chooseTheLinksToBring"),
      };
    case "file": {
      const name = getProvider(step.provider).name;
      return {
        title:
          step.provider === "csv"
            ? t("importFromAFile")
            : t("importFromName", { name }),
        description: t("uploadTheExportCheckThe"),
      };
    }
    case "preview":
      return {
        title: t("previewTheImport"),
        description: t("nothingIsCreatedUntilYou"),
      };
    case "run":
      return {
        title: t("importFromValue", { value: providerName(step.provider) }),
        description: t("newDynamicCodesWithNotes"),
      };
    case "redirects":
      return isRetiredProvider(step.provider)
        ? {
            title: t("undoChangesInValue", {
              value: providerName(step.provider),
            }),
            description: t("putTheOriginalDestinationsBack", {
              value: providerName(step.provider),
            }),
          }
        : {
            title: t("keepMyPrintedCodesWorking"),
            description: t("pointOldValueLinksAt", {
              value: providerName(step.provider),
            }),
          };
    default:
      return {
        title: t("importCodes"),
        description: t("moveYourShortLinksAnd"),
      };
  }
}

function ImportDialogInner({
  mock: forceMock = false,
  defaultOpen = false,
  openSignal = 0,
  hideTrigger = false,
}: {
  mock?: boolean;
  defaultOpen?: boolean;
  /** Bump it to open the dialog from elsewhere (the codes "…" menu) */
  openSignal?: number;
  /** The opener lives elsewhere: no Import button here */
  hideTrigger?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.importDialog");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = parseProviderParam(searchParams.get(IMPORT_PARAM));
  const mockWanted =
    process.env.NODE_ENV === "development" &&
    (forceMock || searchParams.get("mock") === "1");
  const mockPlan = searchParams.get("plan") === "free" ? "free" : "pro";

  const [open, setOpen] = useState(defaultOpen || param !== null);
  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);
  const [step, setStep] = useState<Step>(() => stepFor(param));
  const [client, setClient] = useState<MigrateClient | null>(
    mockWanted ? null : httpClient,
  );
  const [info, setInfo] = useState<ProvidersInfo | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const handled = useRef(param);
  // Shown once on the provider the sign-in was for, until left or closed.
  const [connectError, setConnectError] = useState(() =>
    param ? searchParams.get(CONNECT_ERROR_PARAM) : null,
  );

  // The OAuth sign-in comes back to this page with the dialog open on `provider`.
  const returnTo = (provider: ApiProviderId) => {
    const params = new URLSearchParams(searchParams);
    params.delete(CONNECT_ERROR_PARAM);
    params.set(IMPORT_PARAM, provider);
    return `${pathname}?${params}`;
  };

  // Dev-only mock: never bundled into production (the condition is static).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !mockWanted) return;
    let cancelled = false;
    import("@/lib/migrate/mock").then(({ createMockClient }) => {
      if (!cancelled) setClient(createMockClient(mockPlan));
    });
    return () => {
      cancelled = true;
    };
  }, [mockWanted, mockPlan]);

  // ?import=<provider> (compare pages, docs) opens straight on that provider.
  useEffect(() => {
    if (param && param !== handled.current) {
      handled.current = param;
      setStep(stepFor(param));
      setOpen(true);
    }
  }, [param]);

  const reload = useCallback(async () => {
    if (!client) return;
    const [nextInfo, nextJobs] = await Promise.all([
      client.providers().catch(() => null),
      client.jobs().catch(() => []),
    ]);
    if (nextInfo) setInfo(nextInfo);
    setJobs(nextJobs);
  }, [client]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setStep({ name: "pick" });
    setConnectError(null);
    if (
      searchParams.has(IMPORT_PARAM) ||
      searchParams.has(CONNECT_ERROR_PARAM)
    ) {
      const params = new URLSearchParams(searchParams);
      params.delete(IMPORT_PARAM);
      params.delete(CONNECT_ERROR_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
      handled.current = null;
    }
    // New codes show up in the list behind the dialog.
    if (!client?.mock) router.refresh();
  };

  const { title, description } = heading(step, t);
  const status = (provider: ApiProviderId) =>
    info?.providers.find((entry) => entry.id === provider);

  return (
    <Dialog onOpenChange={close} open={open}>
      <Button
        className={hideTrigger ? "hidden" : undefined}
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <Import />
        {t("import")}
      </Button>
      <DialogContent
        className="flex max-h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onInteractOutside={(event) => {
          // Don't lose a running import to a stray click.
          if (step.name === "run" || step.name === "redirects")
            event.preventDefault();
        }}
      >
        <DialogHeader className="border-b px-6 pt-5 pb-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!client ? (
          <div className="text-muted-foreground px-6 py-16 text-center text-sm">
            {t("loading")}
          </div>
        ) : step.name === "pick" ? (
          <ProviderStep
            jobs={jobs}
            onOpenJob={(job) =>
              setStep({ name: "run", provider: job.provider, jobId: job.id })
            }
            onPickApi={(provider) => setStep({ name: "links", provider })}
            onPickFile={(provider) => setStep({ name: "file", provider })}
            statuses={info?.providers ?? null}
          />
        ) : step.name === "links" ? (
          <LinksStep
            client={client}
            connectError={step.provider === param ? connectError : null}
            key={step.provider}
            onBack={() => {
              setConnectError(null);
              setStep({ name: "pick" });
            }}
            onConnected={reload}
            onContinue={(links) =>
              setStep({
                name: "preview",
                provider: step.provider,
                links,
                from: step,
              })
            }
            provider={step.provider}
            returnTo={returnTo(step.provider)}
            status={status(step.provider)}
          />
        ) : step.name === "file" ? (
          <FileStep
            onBack={() => setStep({ name: "pick" })}
            onContinue={(links) =>
              setStep({
                name: "preview",
                provider: step.provider,
                links,
                from: step,
              })
            }
            onProvider={(provider) => setStep({ name: "file", provider })}
            provider={step.provider}
          />
        ) : step.name === "preview" ? (
          <PreviewStep
            client={client}
            links={step.links}
            onBack={() => setStep(step.from)}
            onStarted={(job) => {
              setStep({ name: "run", provider: step.provider, jobId: job.id });
              void reload();
            }}
            provider={step.provider}
          />
        ) : step.name === "run" ? (
          <RunStep
            client={client}
            jobId={step.jobId}
            key={step.jobId}
            onBack={() => {
              setStep({ name: "pick" });
              void reload();
            }}
            onClose={() => close(false)}
            onRedirects={() => {
              if (isApiProviderId(step.provider)) {
                setStep({
                  name: "redirects",
                  provider: step.provider,
                  jobId: step.jobId,
                });
              }
            }}
          />
        ) : (
          <RedirectsStep
            client={client}
            jobId={step.jobId}
            onBack={() =>
              setStep({
                name: "run",
                provider: step.provider,
                jobId: step.jobId,
              })
            }
            provider={step.provider}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Import" in the codes header: one-click migration from Bitly, Rebrandly,
 * Short.io (connected accounts) and export files of other providers.
 * `?import=<provider>` opens it on that provider. Earlier Dub imports (Dub
 * is retired as a source) still open from Recent imports, for undo.
 */
export function ImportDialog(props: {
  mock?: boolean;
  defaultOpen?: boolean;
  openSignal?: number;
  hideTrigger?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.importDialog");
  return (
    <Suspense
      fallback={
        props.hideTrigger ? null : (
          <Button disabled variant="outline">
            <Import />
            {t("import")}
          </Button>
        )
      }
    >
      <ImportDialogInner {...props} />
    </Suspense>
  );
}
