"use client";

import { Spinner } from "@repo/design-system/components/icons";
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
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { SyncStatus } from "@/components/data-connections/sync-status";
import { emitSound } from "@/components/editor/sound";
import {
  DataConnectionError,
  loadMailchimpAudiences,
  loadMailchimpMergeFields,
  loadSinkView,
  retrySinkNow,
  type SinkViewData,
  saveSink,
} from "@/lib/data-connections/client";

const SKIP = "__skip";
const NO_CONSENT = "__none";

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

  useEffect(() => {
    let cancelled = false;
    loadSinkView(provider)
      .then((data) => {
        if (cancelled) return;
        setView(data);
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
  }, [provider, isMailchimp]);

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

  const pages = view?.pages ?? [];
  const included = pages.filter(
    (page) => allPages || pageIds.includes(page.id),
  );

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
      const mappings: Record<string, FormMapping> = {};
      for (const page of included) {
        for (const form of page.forms) {
          mappings[formKey(page.id, form.id)] = mappingOf(page.id, form);
        }
      }
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
          <Spinner className="mx-auto size-5 text-muted-foreground" />
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
        {pages.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t("noHostedPagesWithA")}
          </p>
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

      <div className="flex justify-end">
        <Button
          disabled={saving || (isMailchimp && !audienceId)}
          onClick={save}
          type="button"
        >
          {saving && <Spinner className="size-4" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
