"use client";

import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  publishCommunityCollection,
  publishCommunityKit,
} from "@/actions/community";
import {
  COLLECTION_MAX_ITEMS,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "@/lib/community/payloads";
import type { BundleSource } from "@/lib/community/types";
import { type CommunityItemType, TYPE_LABELS } from "@/lib/community/types";
import { soundEvent } from "@/lib/sound/emit";
import { LicenceConfirm } from "./licence-confirm";

type Mode = "collection" | "kit";

const KIT_SLOTS: {
  key: "page" | "theme" | "frame";
  type: CommunityItemType;
  label: string;
  optional: boolean;
}[] = [
  {
    key: "page",
    type: "page-template",
    label: "Page template",
    optional: false,
  },
  { key: "theme", type: "theme", label: "Theme", optional: true },
  { key: "frame", type: "frame", label: "Frame", optional: true },
];

/**
 * Make a collection (any published frames, themes and page templates) or a
 * kit (a page template with the theme and/or frame it goes with) from what
 * you saved or published. Both only point at items already in the
 * community, so they go live at once.
 */
export function CreateBundle({
  sources,
  initialMode = "collection",
}: {
  sources: BundleSource[];
  initialMode?: Mode;
}) {
  const t = useTranslations("community.createBundle");
  const nameId = useId();
  const descriptionId = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selected, setSelected] = useState<string[]>([]);
  const [kit, setKit] = useState<Record<"page" | "theme" | "frame", string>>({
    page: "",
    theme: "",
    frame: "",
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < COLLECTION_MAX_ITEMS
          ? [...current, id]
          : current,
    );

  const ready =
    accepted &&
    name.trim().length > 0 &&
    (mode === "collection"
      ? selected.length >= 2
      : Boolean(kit.page) && Boolean(kit.theme || kit.frame));

  const submit = async () => {
    setPending(true);
    setRefusal(null);
    try {
      const details = { name, description, acceptLicense: accepted };
      const result =
        mode === "collection"
          ? await publishCommunityCollection({ itemIds: selected, ...details })
          : await publishCommunityKit({
              page: kit.page,
              theme: kit.theme || null,
              frame: kit.frame || null,
              ...details,
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

  if (published) {
    return (
      <div className="space-y-3 rounded-xl border p-6">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Tick aria-hidden className="size-5" />
          {t("published")}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("nameIsLiveInThe", { name: name.trim() })}
        </p>
        <Button asChild>
          <Link href={published}>{t("viewIt")}</Link>
        </Button>
      </div>
    );
  }

  const ofType = (type: CommunityItemType) =>
    sources.filter((source) => source.type === type);

  return (
    <div className="space-y-6">
      <fieldset className="bg-muted inline-flex rounded-full p-1">
        <legend className="sr-only">{t("whatToMake")}</legend>
        {(["collection", "kit"] as const).map((option) => (
          <button
            aria-pressed={mode === option}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              mode === option
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            key={option}
            onClick={() => setMode(option)}
            type="button"
          >
            {option === "collection" ? t("collection") : t("kit")}
          </button>
        ))}
      </fieldset>

      <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
        {mode === "collection"
          ? t("groupFramesThemesAndPage")
          : t("aPageTemplateAndThe")}
      </p>

      {sources.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          {t.rich("itemsYouSaveInThe", {
            link: (chunks) => (
              <Link
                className="text-foreground underline underline-offset-2"
                href="/community"
              >
                {chunks}
              </Link>
            ),
          })}
        </div>
      ) : mode === "collection" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-medium">
            {t.rich("itemsLengthPicked", {
              length: selected.length,
              span: (chunks) => (
                <span className="text-muted-foreground text-xs font-normal tabular-nums">
                  {chunks}
                </span>
              ),
            })}
          </legend>
          <ul className="divide-y rounded-xl border">
            {sources.map((source) => {
              const id = `pick-${source.id}`;
              const position = selected.indexOf(source.id);
              return (
                <li
                  className="flex items-center gap-3 px-3 py-2.5"
                  key={source.id}
                >
                  <Checkbox
                    checked={position >= 0}
                    disabled={pending}
                    id={id}
                    onCheckedChange={() => toggle(source.id)}
                  />
                  <Label
                    className="flex min-w-0 flex-1 items-baseline justify-between gap-3 font-normal"
                    htmlFor={id}
                  >
                    <span className="truncate text-sm">{source.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {TYPE_LABELS[source.type].one} ·{" "}
                      {source.mine ? t("yours") : source.creator}
                    </span>
                  </Label>
                  {position >= 0 && (
                    <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                      {position + 1}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {KIT_SLOTS.map((slot) => {
            const options = ofType(slot.type);
            const id = `kit-${slot.key}`;
            return (
              <div className="space-y-1.5" key={slot.key}>
                <Label htmlFor={id}>
                  {slot.label}
                  {slot.optional && (
                    <span className="text-muted-foreground font-normal">
                      {t("optional")}
                    </span>
                  )}
                </Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-50"
                  disabled={pending || options.length === 0}
                  id={id}
                  onChange={(event) =>
                    setKit((current) => ({
                      ...current,
                      [slot.key]: event.target.value,
                    }))
                  }
                  value={kit[slot.key]}
                >
                  <option value="">
                    {options.length === 0
                      ? t("noSavedMany", {
                          many: TYPE_LABELS[slot.type].many.toLowerCase(),
                        })
                      : slot.optional
                        ? t("none")
                        : t("pickOne")}
                  </option>
                  {options.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} ({source.mine ? t("yours") : source.creator}
                      )
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {sources.length > 0 && (
        <div className="grid max-w-2xl gap-4">
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
              placeholder={
                mode === "collection"
                  ? t("eGEverythingForA")
                  : t("eGCaféTableKit")
              }
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
          <div>
            <Button disabled={!ready || pending} onClick={submit}>
              {pending && <Spinner className="size-4" />}
              {pending
                ? t("publishing")
                : mode === "collection"
                  ? t("publishCollection")
                  : t("publishKit")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
