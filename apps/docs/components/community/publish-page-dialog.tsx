"use client";

import { Info, Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  type CommunityPagePreview,
  previewCommunityPage,
  publishCommunityPage,
} from "@/actions/community";
import { TagSelector } from "@/components/tag-selector";
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PAGE_TEMPLATE_TAGS,
} from "@/lib/community/payloads";
import { soundEvent } from "@/lib/sound/emit";
import { LicenceConfirm } from "./licence-confirm";

// The page renderer (every block) loads only when the dialog opens.
const PagePreview = dynamic(
  () => import("./page-preview").then((module) => module.PagePreview),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted aspect-[9/16] w-full animate-pulse rounded-[2.25rem]" />
    ),
  },
);

type Step = "review" | "details";

/**
 * Publish a hosted page as a community page template. Step 1 shows the
 * page as it would be shared, with the personal data the server takes out
 * (links, contact details, addresses, Wi-Fi, uploads) and what changed;
 * step 2 the details and the CC0 licence. The server scrubs the saved page
 * again when it publishes; nothing here is trusted.
 */
export function PublishPageDialog({
  open,
  onOpenChange,
  pageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
}) {
  const t = useTranslations("community.publishPageDialog");
  const nameId = useId();
  const descriptionId = useId();
  const [step, setStep] = useState<Step>("review");
  const [preview, setPreview] = useState<CommunityPagePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The name starts neutral (the page type), never the page's own title.
  const [name, setName] = useState("");
  const [keep, setKeep] = useState<string[]>([]);
  const named = useRef(false);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  // The preview with the fields the publisher keeps (none at first).
  const load = useCallback(
    (kept: string[]) => {
      let cancelled = false;
      previewCommunityPage(pageId, kept)
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setPreview(result.data);
            if (!named.current) {
              named.current = true;
              setName(result.data.defaultName);
            }
          } else setLoadError(result.message);
        })
        .catch(() => {
          if (!cancelled) setLoadError("Couldn't load the page. Try again.");
        });
      return () => {
        cancelled = true;
      };
    },
    [pageId],
  );

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setPreview(null);
    setLoadError(null);
    named.current = false;
    setName("");
    setKeep([]);
    setDescription("");
    setTags([]);
    setAccepted(false);
    setRefusal(null);
    setPublished(null);
    return load([]);
  }, [open, load]);

  const toggleKeep = (id: string, kept: boolean) => {
    const next = kept ? [...keep, id] : keep.filter((item) => item !== id);
    setKeep(next);
    load(next);
  };
  const problemOf = (id: string) =>
    preview?.problems.find((problem) => problem.id === id)?.message;

  const submit = async () => {
    setPending(true);
    setRefusal(null);
    try {
      if (!preview) return;
      const result = await publishCommunityPage({
        pageId,
        version: preview.version,
        keep,
        name,
        description,
        tags,
        acceptLicense: accepted,
      });
      if (result.ok) {
        setPublished(result.data.href);
        soundEvent("success");
      } else {
        setRefusal({ message: result.message, href: result.href });
      }
    } catch {
      setRefusal({ message: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  };

  const empty = preview !== null && preview.content.blocks.length === 0;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        {published ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tick aria-hidden className="size-5" />
                {t("published")}
              </DialogTitle>
              <DialogDescription>
                {t("valueIsLiveInThe", {
                  value: name.trim() || "Your template",
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("done")}
              </Button>
              <Button asChild>
                <Link href={published}>{t("viewIt")}</Link>
              </Button>
            </DialogFooter>
          </>
        ) : step === "review" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("shareAsAPageTemplate")}</DialogTitle>
              <DialogDescription>{t("step1Of2This")}</DialogDescription>
            </DialogHeader>

            {loadError ? (
              <p className="text-destructive text-sm" role="alert">
                {loadError}
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="mx-auto w-[160px] sm:w-full">
                  {preview ? (
                    <PagePreview content={preview.content} />
                  ) : (
                    <div className="bg-muted aspect-[9/16] w-full animate-pulse rounded-[2.25rem]" />
                  )}
                </div>
                <div className="min-w-0 space-y-3 text-sm">
                  <p className="font-medium">{t("whatWeChanged")}</p>
                  {preview === null ? (
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Spinner className="size-4" />
                      {t("checkingThePage")}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {preview.changes.map((change) => (
                        <li className="flex gap-2" key={change}>
                          <Tick
                            aria-hidden
                            className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview && preview.fields.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-muted-foreground mb-1 text-xs">
                        {t("yourTextIsReplacedWith")}
                      </legend>
                      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                        {preview.fields.map((field) => {
                          const kept = keep.includes(field.id);
                          const problem = problemOf(field.id);
                          const inputId = `keep-${field.id}`;
                          return (
                            <li
                              className="flex gap-2.5 px-3 py-2"
                              key={field.id}
                            >
                              <Checkbox
                                checked={kept}
                                className="mt-0.5"
                                id={inputId}
                                onCheckedChange={(value) =>
                                  toggleKeep(field.id, value === true)
                                }
                              />
                              <label
                                className="min-w-0 flex-1 text-xs leading-snug"
                                htmlFor={inputId}
                              >
                                <span className="text-muted-foreground block">
                                  {field.block} · {field.field}
                                  {kept ? t("kept") : ""}
                                </span>
                                <span className="block break-words">
                                  {kept
                                    ? field.original
                                    : field.sample || t("empty")}
                                </span>
                                {!kept && (
                                  <span className="text-muted-foreground block break-words line-through">
                                    {field.original}
                                  </span>
                                )}
                                {problem && (
                                  <span
                                    className="text-destructive block"
                                    role="alert"
                                  >
                                    {problem}
                                  </span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  )}
                  <p className="text-muted-foreground flex gap-2 text-xs leading-relaxed">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>{t("everyPhotoIsTakenOut")}</span>
                  </p>
                  {empty && (
                    <p className="text-destructive text-sm" role="alert">
                      {t("nothingIsLeftToShare")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("cancel")}
              </Button>
              <Button
                disabled={
                  preview === null || empty || preview.problems.length > 0
                }
                onClick={() => setStep("details")}
              >
                {t("continue")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("shareAsAPageTemplate")}</DialogTitle>
              <DialogDescription>{t("step2Of2Details")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={nameId}>{t("name")}</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {name.length}/{NAME_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  disabled={pending}
                  id={nameId}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("eGCaféMenu")}
                  value={name}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={descriptionId}>{t("description")}</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  disabled={pending}
                  id={descriptionId}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("optionalWhatItsFor")}
                  rows={3}
                  value={description}
                />
              </div>
              <TagSelector
                disabled={pending}
                onTagsChange={setTags}
                options={PAGE_TEMPLATE_TAGS}
                selectedTags={tags}
              />
              <LicenceConfirm
                checked={accepted}
                disabled={pending}
                onCheckedChange={setAccepted}
              />
              {refusal && (
                <p className="text-destructive text-sm" role="alert">
                  {refusal.message}{" "}
                  {refusal.href && (
                    <Link
                      className="underline underline-offset-2"
                      href={refusal.href}
                    >
                      {t("seeIt")}
                    </Link>
                  )}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => setStep("review")}
                variant="outline"
              >
                {t("back")}
              </Button>
              <Button
                disabled={!(accepted && name.trim()) || pending}
                onClick={submit}
              >
                {pending && <Spinner className="size-4" />}
                {pending ? t("publishing") : t("publish")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
