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
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { httpClient, type MigrateClient } from "@/lib/migrate/client";
import {
  type ApiProviderId,
  type FileProviderId,
  getProvider,
  isApiProviderId,
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

function stepFor(provider: ProviderId | null): Step {
  if (!provider) return { name: "pick" };
  return isApiProviderId(provider)
    ? { name: "links", provider }
    : { name: "file", provider };
}

function heading(step: Step): { title: string; description: string } {
  switch (step.name) {
    case "links":
      return {
        title: `Import from ${providerName(step.provider)}`,
        description:
          "Choose the links to bring over. Nothing changes in your old account.",
      };
    case "file": {
      const name = getProvider(step.provider).name;
      return {
        title:
          step.provider === "csv"
            ? "Import from a file"
            : `Import from ${name}`,
        description: "Upload the export, check the columns, then preview.",
      };
    }
    case "preview":
      return {
        title: "Preview the import",
        description: "Nothing is created until you confirm.",
      };
    case "run":
      return {
        title: `Import from ${providerName(step.provider)}`,
        description: "New dynamic codes, with notes on where each came from.",
      };
    case "redirects":
      return {
        title: "Keep my printed codes working",
        description: `Point old ${providerName(step.provider)} links at their new QRdx codes.`,
      };
    default:
      return {
        title: "Import codes",
        description:
          "Move your short links and dynamic QR codes to QRdx from another provider.",
      };
  }
}

function ImportDialogInner({
  mock: forceMock = false,
  defaultOpen = false,
}: {
  mock?: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = parseProviderParam(searchParams.get(IMPORT_PARAM));
  const mockWanted =
    process.env.NODE_ENV === "development" &&
    (forceMock || searchParams.get("mock") === "1");
  const mockPlan = searchParams.get("plan") === "free" ? "free" : "pro";

  const [open, setOpen] = useState(defaultOpen || param !== null);
  const [step, setStep] = useState<Step>(() => stepFor(param));
  const [client, setClient] = useState<MigrateClient | null>(
    mockWanted ? null : httpClient,
  );
  const [info, setInfo] = useState<ProvidersInfo | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const handled = useRef(param);

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
    if (searchParams.has(IMPORT_PARAM)) {
      const params = new URLSearchParams(searchParams);
      params.delete(IMPORT_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
      handled.current = null;
    }
    // New codes show up in the list behind the dialog.
    if (!client?.mock) router.refresh();
  };

  const { title, description } = heading(step);
  const status = (provider: ApiProviderId) =>
    info?.providers.find((entry) => entry.id === provider);

  return (
    <Dialog onOpenChange={close} open={open}>
      <Button onClick={() => setOpen(true)} variant="outline">
        <Import />
        Import
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
            Loading…
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
            key={step.provider}
            onBack={() => setStep({ name: "pick" })}
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
 * "Import" in the codes header: one-click migration from Dub, Bitly,
 * Rebrandly, Short.io (connected accounts) and export files of other
 * providers. `?import=<provider>` opens it on that provider.
 */
export function ImportDialog(props: { mock?: boolean; defaultOpen?: boolean }) {
  return (
    <Suspense
      fallback={
        <Button disabled variant="outline">
          <Import />
          Import
        </Button>
      }
    >
      <ImportDialogInner {...props} />
    </Suspense>
  );
}
