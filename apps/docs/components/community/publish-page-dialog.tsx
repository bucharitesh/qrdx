"use client";

import { Info, Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
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
import { useEffect, useId, useState } from "react";
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
  pageTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  pageTitle?: string | null;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const [step, setStep] = useState<Step>("review");
  const [preview, setPreview] = useState<CommunityPagePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(pageTitle ?? "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setPreview(null);
    setLoadError(null);
    setName(pageTitle ?? "");
    setDescription("");
    setTags([]);
    setAccepted(false);
    setRefusal(null);
    setPublished(null);
    let cancelled = false;
    previewCommunityPage(pageId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setPreview(result.data);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the page. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, pageId, pageTitle]);

  const submit = async () => {
    setPending(true);
    setRefusal(null);
    try {
      const result = await publishCommunityPage({
        pageId,
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
                Published
              </DialogTitle>
              <DialogDescription>
                {name.trim() || "Your template"} is live in the community. Your
                page itself hasn't changed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Done
              </Button>
              <Button asChild>
                <Link href={published}>View it</Link>
              </Button>
            </DialogFooter>
          </>
        ) : step === "review" ? (
          <>
            <DialogHeader>
              <DialogTitle>Share as a page template</DialogTitle>
              <DialogDescription>
                Step 1 of 2 · This is what people get. Your own details are
                taken out first.
              </DialogDescription>
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
                  <p className="font-medium">What we changed</p>
                  {preview === null ? (
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Spinner className="size-4" />
                      Checking the page
                    </p>
                  ) : preview.changes.length > 0 ? (
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
                  ) : (
                    <p className="text-muted-foreground">
                      Nothing personal found. The page is shared as it is.
                    </p>
                  )}
                  <p className="text-muted-foreground flex gap-2 text-xs leading-relaxed">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Read it through before you share it: names and words in
                      your text stay as you wrote them. Photos from QRdx's
                      template library are kept.
                    </span>
                  </p>
                  {empty && (
                    <p className="text-destructive text-sm" role="alert">
                      Nothing is left to share once your details are taken out.
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={preview === null || empty}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share as a page template</DialogTitle>
              <DialogDescription>
                Step 2 of 2 · Details. It goes live in the community at once,
                and your page stays as it is.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={nameId}>Name</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {name.length}/{NAME_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  disabled={pending}
                  id={nameId}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Café menu"
                  value={name}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={descriptionId}>Description</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  disabled={pending}
                  id={descriptionId}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional: what it's for"
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
                      See it
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
                Back
              </Button>
              <Button
                disabled={!(accepted && name.trim()) || pending}
                onClick={submit}
              >
                {pending && <Spinner className="size-4" />}
                {pending ? "Publishing" : "Publish"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
