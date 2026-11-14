"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { HUBSPOT_TARGETS } from "@repo/integrations/src/integrations/hubspot/sink";
import { mailchimpTargets } from "@repo/integrations/src/integrations/mailchimp/sink";
import type {
  MailchimpAudience,
  MailchimpMergeField,
} from "@repo/integrations/src/integrations/mailchimp/types";
import {
  type FormMapping,
  formKey,
  type SinkTarget,
  suggestConsentField,
  suggestMapping,
} from "@repo/integrations/src/sinks/mapping";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SyncStatus } from "@/components/data-connections/sync-status";
import { emitSound } from "@/components/editor/sound";
import { LoadMore } from "@/components/load-more";
import {
  DataConnectionError,
  loadMailchimpAudiences,
  loadMailchimpMergeFields,
  loadSinkPages,
  loadSinkView,
  retrySinkNow,
  type SinkViewData,
  saveSink,
} from "@/lib/data-connections/client";
import type { ScopedFormPage } from "@/lib/data-connections/data";
import { mappingsToSave } from "@/lib/data-connections/sink-mappings";
import { useCursorList } from "@/lib/hooks/use-cursor-list";
import type { CursorPage } from "@/lib/keyset-cursor";

const SKIP = "__skip";
const NO_CONSENT = "__none";
const NO_PAGES: CursorPage<ScopedFormPage> = { items: [], nextCursor: null };
/** Wait this long after the last keystroke before searching pages. */
const SEARCH_DELAY_MS = 300;

interface ResponseSinkPanelProps {
  provider: "hubspot" | "mailchimp";
  name: string;
}

/**
 * HubSpot / Mailchimp: which pages' forms to send, the field mapping (with
 * suggested defaults), Mailchimp's audience, tags and consent, the on switch
 * and the last sync.
 */
export function ResponseSinkPanel({ provider, name }: ResponseSinkPanelProps) {
  const t = useTranslations("app.settings.integrations.responseSinkPanel");
  const id = useId();
  const [view, setView] = useState<SinkViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [allPages, setAllPages] = useState(true);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, FormMapping>>({});
  const [audiences, setAudiences] = useState<MailchimpAudience[]>([]);
  const [audienceId, setAudienceId] = useState("");
  const [mergeFields, setMergeFields] = useState<MailchimpMergeField[]>([]);
  const [tags, setTags] = useState("");
  const [withoutConsent, setWithoutConsent] = useState<"pending" | "skip">(
    "pending",
  );
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isMailchimp = provider === "mailchimp";
  // The workspace's form pages, a page at a time (most recently updated
  // first), narrowed by a title search once typing pauses.
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  /** The pages the sync was limited to when the panel loaded */
  const [selectedPages, setSelectedPages] = useState<ScopedFormPage[]>([]);
  const list = useCursorList({
    first: NO_PAGES,
    keyOf: (page) => page.id,
    errorMessage: t("couldntLoadMorePages"),
    load: (cursor) => loadSinkPages(provider, { cursor, q: query }),
  });
  /** The search the list shows; the latest search request */
  const shownQuery = useRef("");
  const latestSearch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadSinkView(provider)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        list.replace({ items: data.pages, nextCursor: data.pagesCursor });
        setSelectedPages(data.selectedPages);
        const settings = data.settings as {
          pageIds?: string[] | null;
          forms?: Record<string, FormMapping>;
          audienceId?: string;
          tags?: string[];
          withoutConsent?: "pending" | "skip";
        };
        setEnabled(Boolean(data.sync?.enabled));
        setAllPages(!settings.pageIds);
        setPageIds(settings.pageIds ?? []);
        setForms(settings.forms ?? {});
        setAudienceId(settings.audienceId ?? "");
        setTags((settings.tags ?? []).join(", "));
        setWithoutConsent(settings.withoutConsent ?? "pending");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof DataConnectionError ? err.message : "Couldn't load.",
          );
        }
      });
    if (isMailchimp) {
      loadMailchimpAudiences()
        .then((list) => !cancelled && setAudiences(list))
        .catch(
          (err) =>
            !cancelled &&
            setError(
              err instanceof Error ? err.message : "Couldn't load audiences.",
            ),
        );
    }
    return () => {
      cancelled = true;
    };
  }, [provider, isMailchimp, list.replace]);

  // Search once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // A new search: its first page (the first view's page already shows "").
  useEffect(() => {
    if (!view || query === shownQuery.current) return;
    shownQuery.current = query;
    const request = ++latestSearch.current;
    setSearching(true);
    loadSinkPages(provider, { q: query })
      .then((page) => request === latestSearch.current && list.replace(page))
      .catch(
        (err) =>
          request === latestSearch.current &&
          toast.error(
            err instanceof Error ? err.message : t("couldntLoadMorePages"),
          ),
      )
      .finally(() => request === latestSearch.current && setSearching(false));
  }, [view, query, provider, list.replace, t]);

  useEffect(() => {
    if (!(isMailchimp && audienceId)) return;
    let cancelled = false;
    loadMailchimpMergeFields(audienceId)
      .then((fields) => !cancelled && setMergeFields(fields))
      .catch(() => !cancelled && setMergeFields([]));
    return () => {
      cancelled = true;
    };
  }, [isMailchimp, audienceId]);

  const targets: SinkTarget[] = useMemo(
    () => (isMailchimp ? mailchimpTargets(mergeFields) : HUBSPOT_TARGETS),
    [isMailchimp, mergeFields],
  );

  const pages = list.items;
  /** Every page loaded so far, and the selected ones wherever they sit */
  const known = useMemo(
    () =>
      new Map([...selectedPages, ...list.items].map((page) => [page.id, page])),
    [selectedPages, list.items],
  );
  // Every page with a form: those loaded so far (more load as you scroll).
  // Chosen pages: each one picked, loaded or not.
  const included = allPages
    ? pages
    : pageIds.flatMap((pageId) => known.get(pageId) ?? []);

  const mappingOf = (
    pageId: string,
    form: (typeof pages)[number]["forms"][number],
  ) =>
    forms[formKey(pageId, form.id)] ?? {
      fields: suggestMapping(form.fields, targets),
      consentFieldId: suggestConsentField(form.fields),
    };

  const setField = (
    key: string,
    base: FormMapping,
    fieldId: string,
    target: string,
  ) =>
    setForms((current) => ({
      ...current,
      [key]: {
        ...base,
        fields: { ...base.fields, [fieldId]: target === SKIP ? "" : target },
      },
    }));

  const save = async () => {
    setSaving(true);
    try {
      const shown: Record<string, FormMapping> = {};
      for (const page of included) {
        for (const form of page.forms) {
          shown[formKey(page.id, form.id)] = mappingOf(page.id, form);
        }
      }
      // Pages the panel never loaded keep what was saved for them.
      const mappings = mappingsToSave(forms, new Set(known.keys()), shown);
      const next = await saveSink(provider, {
        enabled,
        pageIds: allPages ? null : pageIds,
        forms: mappings,
        ...(isMailchimp
          ? {
              audienceId,
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 10),
              withoutConsent,
            }
          : {}),
      });
      setView(next);
      emitSound("success");
      toast.success(enabled ? t("nameSyncIsOn", { name }) : t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("couldntSave"));
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      setView(await retrySinkNow(provider));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("retryFailed"));
    } finally {
      setRetrying(false);
    }
  };

  if (!view) {
    return (
      <div className="rounded-xl border bg-card p-6">
        {error ? (
          <p className="text-muted-foreground text-sm text-pretty">{error}</p>
        ) : (
          <ModuleOrbit
            aria-hidden
            className="mx-auto size-5 text-muted-foreground"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {t("sendFormResponsesToName", { name })}
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            {isMailchimp
              ? t("newResponsesAddOrUpdate")
              : t("newResponsesCreateOrUpdate")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            id={`${id}-on`}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor={`${id}-on`}>{enabled ? t("on") : t("off")}</Label>
        </div>
      </div>

      <SyncStatus
        noun={isMailchimp ? t("members") : t("contacts")}
        onRetry={retry}
        retrying={retrying}
        state={view.sync}
      />

      {isMailchimp && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-audience`}>{t("audience")}</Label>
            <Select
              onValueChange={setAudienceId}
              value={audienceId || undefined}
            >
              <SelectTrigger className="w-full" id={`${id}-audience`}>
                <SelectValue placeholder={t("pickAnAudience")} />
              </SelectTrigger>
              <SelectContent>
                {audiences.map((audience) => (
                  <SelectItem key={audience.id} value={audience.id}>
                    {audience.name} ({audience.memberCount.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-tags`}>{t("tags")}</Label>
            <Input
              id={`${id}-tags`}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("qrSpringMenu")}
              value={tags}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${id}-consent`}>
              {t("formsWithoutAConsentCheckbox")}
            </Label>
            <Select
              onValueChange={(value) =>
                setWithoutConsent(value as "pending" | "skip")
              }
              value={withoutConsent}
            >
              <SelectTrigger className="w-full" id={`${id}-consent`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  {t("askThemToConfirmBy")}
                </SelectItem>
                <SelectItem value="skip">{t("dontAddThem")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs text-pretty">
              {t("withAConsentCheckboxMapped")}
            </p>
          </div>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("pages")}</legend>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allPages}
            id={`${id}-all`}
            onCheckedChange={(value) => setAllPages(value === true)}
          />
          <Label className="font-normal" htmlFor={`${id}-all`}>
            {t("everyPageWithAForm")}
          </Label>
        </div>
        {(pages.length > 0 || query || list.hasMore) && (
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("searchPages")}
              className="sm:max-w-xs"
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPages")}
              value={search}
            />
            {searching && <ModuleOrbit aria-hidden className="size-4" />}
          </div>
        )}
        {!allPages && (
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((page) => (
              <div className="flex items-center gap-2" key={page.id}>
                <Checkbox
                  checked={pageIds.includes(page.id)}
                  id={`${id}-${page.id}`}
                  onCheckedChange={(value) =>
                    setPageIds((current) =>
                      value === true
                        ? [...current, page.id]
                        : current.filter((pid) => pid !== page.id),
                    )
                  }
                />
                <Label className="font-normal" htmlFor={`${id}-${page.id}`}>
                  {page.title || t("untitledPage")}
                </Label>
              </div>
            ))}
          </div>
        )}
        {pages.length === 0 && !searching && (
          <p className="text-muted-foreground text-sm">
            {query ? t("noPagesMatch") : t("noHostedPagesWithA")}
          </p>
        )}
        {!allPages && pages.length > 0 && (
          <LoadMore
            count={pages.length}
            error={list.error}
            hasMore={list.hasMore}
            labels={{
              loadMore: t("loadMorePages"),
              loading: t("loadingPages"),
              retry: t("tryAgain"),
            }}
            loading={list.loading}
            onLoadMore={list.loadMore}
          />
        )}
      </fieldset>

      {included.map((page) =>
        page.forms.map((form) => {
          const key = formKey(page.id, form.id);
          const mapping = mappingOf(page.id, form);
          const saved = Boolean(forms[key]);
          const consentFields = form.fields.filter(
            (field) => field.type === "consent",
          );
          return (
            <div className="space-y-3 rounded-lg border p-4" key={key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {page.title || t("untitledPage")} · {form.title}
                </p>
                {!saved && (
                  <Badge className="font-normal" variant="outline">
                    {t("suggested")}
                  </Badge>
                )}
              </div>
              <div className="divide-y">
                {form.fields
                  .filter((field) => field.type !== "consent")
                  .map((field) => (
                    <div
                      className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                      key={field.id}
                    >
                      <span className="min-w-0 text-sm">
                        {field.label}
                        <span className="text-muted-foreground">
                          {" "}
                          · {field.type}
                        </span>
                      </span>
                      <Select
                        onValueChange={(value) =>
                          setField(key, mapping, field.id, value)
                        }
                        value={mapping.fields[field.id] || SKIP}
                      >
                        <SelectTrigger
                          aria-label={t("nameFieldForLabel", {
                            name,
                            label: field.label,
                          })}
                          className="w-full sm:w-56"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>{t("dontSend")}</SelectItem>
                          {targets.map((target) => (
                            <SelectItem key={target.id} value={target.id}>
                              {target.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                {isMailchimp && (
                  <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm">{t("marketingConsent")}</span>
                    <Select
                      onValueChange={(value) =>
                        setForms((current) => ({
                          ...current,
                          [key]: {
                            ...mapping,
                            consentFieldId: value === NO_CONSENT ? null : value,
                          },
                        }))
                      }
                      value={mapping.consentFieldId ?? NO_CONSENT}
                    >
                      <SelectTrigger
                        aria-label={t("consentCheckbox")}
                        className="w-full sm:w-56"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CONSENT}>
                          {t("noConsentCheckbox")}
                        </SelectItem>
                        {consentFields.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          );
        }),
      )}
      {allPages && pages.length > 0 && (
        <LoadMore
          count={pages.length}
          error={list.error}
          hasMore={list.hasMore}
          labels={{
            loadMore: t("loadMorePages"),
            loading: t("loadingPages"),
            retry: t("tryAgain"),
          }}
          loading={list.loading}
          onLoadMore={list.loadMore}
        />
      )}

      <div className="flex justify-end">
        <Button
          disabled={saving || (isMailchimp && !audienceId)}
          onClick={save}
          type="button"
        >
          {saving && <ModuleOrbit aria-hidden className="size-4" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
