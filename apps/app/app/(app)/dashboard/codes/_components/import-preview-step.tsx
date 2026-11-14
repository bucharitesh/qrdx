"use client";

import { track } from "@repo/analytics";
import { Info } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  Diamonds,
  Folder2,
  Global,
  Tag,
  Warning2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { MigrateApiError, type MigrateClient } from "@/lib/migrate/client";
import { FILE_PRESETS } from "@/lib/migrate/files";
import { displayLink } from "@/lib/migrate/normalize";
import {
  defaultFolderName,
  isApiProviderId,
  type ProviderId,
} from "@/lib/migrate/providers";
import type {
  ImportOptions,
  ImportPreview,
  JobSummary,
  PlannedItem,
  SourceLink,
} from "@/lib/migrate/types";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { formatPlanList } from "../_lib/code-options";
import { useKnownCodeOptionPlans } from "./code-options";
import { Note, Stat, StepLayout } from "./import-shared";
import { useMigrateReasonText } from "./migrate-reason-text";

const STATUS_TEXT: Record<PlannedItem["status"], string> = {
  create: "New code",
  "already-imported": "Already imported",
  duplicate: "Duplicate",
  invalid: "Can't import",
  "over-limit": "Over limit",
};

/** Select value for "keep back-halves on qrdx.dev only". */
const SHARED_ONLY = "__qrdx";

/** Domains a customer could own (not a provider's shared or code domains). */
function ownDomains(provider: ProviderId, domains: string[]) {
  if (isApiProviderId(provider)) return domains;
  return domains.filter(
    (domain) =>
      !Object.values(FILE_PRESETS).some((preset) => preset.hosts?.test(domain)),
  );
}

export function PreviewStep({
  client,
  provider,
  links,
  onBack,
  onStarted,
}: {
  client: MigrateClient;
  provider: ProviderId;
  links: SourceLink[];
  onBack: () => void;
  onStarted: (job: JobSummary) => void;
}) {
  const t = useTranslations("app.dashboard.codes.importPreviewStep");
  const reasonText = useMigrateReasonText();
  const inWorkspace = useWorkspaceHref();
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  // No Domains link where custom domains can't be added.
  const { showsPath } = useAvailability();
  const [folderName, setFolderName] = useState(defaultFolderName(provider));
  // Plan options (the folder name doesn't change the plan).
  const [options, setOptions] = useState<ImportOptions>({
    folderName: null,
    carryTags: true,
    includeDuplicates: false,
    backHalfDomain: null,
    keepBackHalves: false,
    useSuggestions: true,
    limit: null,
  });
  const [useFolder, setUseFolder] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .preview({ provider, links, options })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(
            failure instanceof MigrateApiError
              ? failure.message
              : "Couldn't build the preview.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, provider, links, options]);

  const branded = useMemo(
    () => ownDomains(provider, preview?.brandedDomains ?? []),
    [provider, preview?.brandedDomains],
  );
  const notable = useMemo(
    () =>
      (preview?.items ?? [])
        .map((item, index) => ({ item, link: links[index] as SourceLink }))
        .filter(
          ({ item }) =>
            item.status !== "create" ||
            (item.backHalf && item.backHalf.status !== "kept"),
        ),
    [preview, links],
  );

  const set = (patch: Partial<ImportOptions>) =>
    setOptions((current) => ({ ...current, ...patch }));

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { job } = await client.start({
        provider,
        links,
        options: {
          ...options,
          folderName: useFolder ? folderName.trim() || null : null,
        },
      });
      track("import_started", { provider, count: links.length });
      onStarted(job);
    } catch (failure) {
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : "Couldn't start the import. Try again.",
      );
      setStarting(false);
    }
  };

  const creates = preview?.creates ?? 0;
  const limited = (preview?.overLimit ?? 0) > 0;
  const keeping = options.keepBackHalves || options.backHalfDomain !== null;
  // Unknown until the first preview: assume allowed, the preview corrects it.
  const canKeep = preview?.canKeepBackHalves ?? true;
  const withBackHalves = links.some((link) => link.backHalf);
  // Plans that keep back-halves (lib/plans.ts customSlugs), when known.
  const slugPlans = useKnownCodeOptionPlans()?.upgrades.customSlugs ?? [];

  return (
    <StepLayout
      footer={
        <>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            {t("back")}
          </Button>
          <div className="flex items-center gap-2">
            {limited && (
              <Button onClick={openGetProDialog} variant="outline">
                <Diamonds />
                {t("upgrade")}
              </Button>
            )}
            <Button
              disabled={loading || starting || creates === 0}
              onClick={start}
            >
              {starting && <ModuleOrbit aria-hidden />}
              {creates === 0
                ? t("nothingToImport")
                : limited
                  ? t("importTheFirstValue", { count: creates })
                  : t("importValue", { count: creates })}
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-5">
        <div
          className={cn(
            "grid grid-cols-2 gap-2 sm:grid-cols-4 transition-opacity",
            loading && "opacity-60",
          )}
        >
          <Stat label={t("newCodes")} value={preview ? creates : "…"} />
          <Stat
            label={t("alreadyImported")}
            muted
            value={preview ? preview.alreadyImported : "…"}
          />
          <Stat
            label={t("sameDestinationExists")}
            muted
            value={preview ? preview.duplicates : "…"}
          />
          <Stat
            label={limited ? t("overPlanLimit") : t("cantImport")}
            muted
            value={
              preview ? (limited ? preview.overLimit : preview.invalid) : "…"
            }
          />
        </div>

        {limited && preview && (
          <Note icon={<Warning2 />} tone="warning">
            <p>
              {t("planRoomNote", {
                remaining: preview.remaining ?? 0,
                wanted: preview.wanted,
                creates,
              })}
            </p>
          </Note>
        )}
        {error && (
          <Note icon={<Warning2 />} tone="warning">
            <p>{error}</p>
          </Note>
        )}

        <div className="divide-y rounded-xl border">
          <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <label
              className="flex flex-1 items-center gap-2.5 text-sm font-medium"
              htmlFor="migrate-use-folder"
            >
              <Checkbox
                checked={useFolder}
                id="migrate-use-folder"
                onCheckedChange={(value) => setUseFolder(value === true)}
              />
              <Folder2 aria-hidden className="size-4 text-foreground/70" />
              {t("putTheNewCodesIn")}
            </label>
            <Input
              aria-label={t("folderName")}
              className="h-8 sm:w-60"
              disabled={!useFolder}
              maxLength={60}
              onChange={(event) => setFolderName(event.target.value)}
              value={folderName}
            />
          </div>

          <div className="space-y-2 p-4">
            <label
              className="flex items-center gap-2.5 text-sm font-medium"
              htmlFor="migrate-tags"
            >
              <Checkbox
                checked={options.carryTags}
                id="migrate-tags"
                onCheckedChange={(value) => set({ carryTags: value === true })}
              />
              <Tag aria-hidden className="size-4 text-foreground/70" />
              {t("carryOverTags")}
            </label>
            {options.carryTags &&
              preview &&
              (preview.newTags.length > 0 ||
                preview.existingTags.length > 0) && (
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {preview.existingTags.map((name) => (
                    <span
                      className="rounded-full border px-2 py-0.5 text-xs"
                      key={name}
                    >
                      {name}
                    </span>
                  ))}
                  {preview.newTags.map((name) => (
                    <span
                      className="text-muted-foreground rounded-full border border-dashed px-2 py-0.5 text-xs"
                      key={name}
                    >
                      {t("nameNew", { name })}
                    </span>
                  ))}
                </div>
              )}
          </div>

          <label
            className="flex items-start gap-2.5 p-4 text-sm"
            htmlFor="migrate-duplicates"
          >
            <Checkbox
              checked={options.includeDuplicates}
              id="migrate-duplicates"
              className="mt-0.5"
              onCheckedChange={(value) =>
                set({ includeDuplicates: value === true })
              }
            />
            <span>
              <span className="font-medium">
                {t("alsoImportLinksWhoseDestination")}
              </span>
              <span className="text-muted-foreground block text-xs">
                {t("offTheyreSkippedAndTheir")}
              </span>
            </span>
          </label>

          {withBackHalves && (
            <div className="space-y-3 p-4">
              <label
                className="flex items-center gap-2.5 text-sm font-medium"
                htmlFor="migrate-back-halves"
              >
                <Checkbox
                  checked={keeping}
                  disabled={!(canKeep || keeping)}
                  id="migrate-back-halves"
                  onCheckedChange={(value) =>
                    set({
                      keepBackHalves: value === true,
                      backHalfDomain:
                        value === true ? (branded[0] ?? null) : null,
                    })
                  }
                />
                <Global aria-hidden className="size-4 text-foreground/70" />
                {t("keepTheOriginalBackHalves")}
                {!canKeep && slugPlans[0] && (
                  <span className="text-muted-foreground rounded-full border px-1.5 py-px text-[11px] font-medium">
                    {PLAN_NAMES[slugPlans[0]]}
                  </span>
                )}
              </label>
              <p className="text-muted-foreground pl-6 text-xs">
                {t("eachCodeKeepsItsOld")}
              </p>
              {keeping && branded.length > 0 && (
                <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-center">
                  <span className="text-sm">{t("linksOn")}</span>
                  <Select
                    onValueChange={(value) =>
                      set({
                        backHalfDomain: value === SHARED_ONLY ? null : value,
                      })
                    }
                    value={options.backHalfDomain ?? SHARED_ONLY}
                  >
                    <SelectTrigger
                      aria-label={t("yourDomain")}
                      className="h-8 sm:w-56"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {branded.map((domain) => (
                        <SelectItem key={domain} value={domain}>
                          {domain}
                        </SelectItem>
                      ))}
                      <SelectItem value={SHARED_ONLY}>
                        {t("noneOfMyDomains")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs sm:flex-1">
                    {options.backHalfDomain
                      ? t("keepTheirsOnThatDomain")
                      : t("everyBackHalfIsKept")}
                  </span>
                </div>
              )}
              {keeping && preview?.backHalves && (
                <div className="space-y-2 pl-6">
                  {preview.backHalves.canUse ? (
                    <Note icon={<Info />}>
                      <p>
                        {t.rich(
                          preview.backHalves.conflicts > 0
                            ? "backHalvesKeptConflicts"
                            : "backHalvesKept",
                          {
                            kept: preview.backHalves.kept,
                            conflicts: preview.backHalves.conflicts,
                            strong: (chunks) => (
                              <span className="text-foreground font-medium">
                                {chunks}
                              </span>
                            ),
                          },
                        )}
                        {preview.backHalves.domain &&
                          preview.backHalves.qrdx &&
                          ` ${t(`domainStatus.${preview.backHalves.qrdx}`, {
                            domain: preview.backHalves.domain,
                          })}`}
                      </p>
                      {preview.backHalves.domain &&
                        preview.backHalves.qrdx !== "verified" &&
                        showsPath(inWorkspace("/settings/domains")) && (
                          <Link
                            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                            href={inWorkspace("/settings/domains")}
                          >
                            {t("openDomains")}
                          </Link>
                        )}
                    </Note>
                  ) : (
                    <Note icon={<Diamonds />}>
                      <p>
                        {slugPlans.length > 0
                          ? t("keepingBackHalvesIsPart", {
                              slugPlans: formatPlanList(slugPlans),
                            })
                          : t("yourPlanDoesntKeepBack")}{" "}
                        {t("withoutItEveryCodeGets")}
                      </p>
                      <button
                        className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                        onClick={openGetProDialog}
                        type="button"
                      >
                        {t("upgrade")}
                      </button>
                    </Note>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {notable.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t("needsALook")}
              <span className="text-muted-foreground font-normal">
                · {notable.length}
              </span>
            </h3>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border text-sm">
              {notable.slice(0, 200).map(({ item, link }) => (
                <li
                  className="flex items-start gap-3 px-3 py-2.5"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {link.title ?? displayLink(link.shortLink ?? link.id)}
                    </div>
                    {item.status === "create" &&
                    item.backHalf &&
                    item.backHalf.status !== "kept" ? (
                      <div className="text-muted-foreground space-y-0.5 text-xs">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <code className="bg-muted text-foreground min-w-0 truncate rounded px-1 py-px">
                            {link.backHalf}
                          </code>
                          <span aria-hidden>→</span>
                          <span className="sr-only">{t("becomes")}</span>
                          <code className="bg-muted text-foreground shrink-0 rounded px-1 py-px">
                            {item.backHalf.slug ?? t("random")}
                          </code>
                        </div>
                        {item.reason && (
                          <p className="truncate">{reasonText(item)}</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted-foreground truncate text-xs">
                        {link.shortLink ? displayLink(link.shortLink) : link.id}
                        {item.reason ? ` · ${reasonText(item)}` : ""}
                        {item.existing
                          ? ` · ${displayLink(item.existing.shortLink)}`
                          : ""}
                      </div>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
                    {item.status === "create"
                      ? t("backHalf")
                      : STATUS_TEXT[item.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          {t("eachCodeGetsTheLinks")}
        </p>
      </div>
    </StepLayout>
  );
}
