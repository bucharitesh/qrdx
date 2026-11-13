"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, InfoCircle, Warning2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { checkUrl } from "@/components/editor/content-forms/url-check";
import { useDynamicLinkStore } from "@/components/editor/dynamic-link-toggle";
import { textSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { TextContent, UrlContent } from "@/types/qr-content";
import { encodeText } from "@/utils/qr-content-encoder";

// What the code encodes, edited from the background's toolbar. A plain link
// or text is edited in place with the Content tab's own checks (checkUrl,
// textSchema): only a valid entry changes the code, and an invalid one shows
// the form's message. Every other content type has a form of its own, so the
// field is a button to it. Content isn't part of the design's undo history;
// the toolbar's session puts it back on Escape (part-overlay.tsx).

/** The content as it was, so Escape can put it back. */
export interface ContentSnapshot {
  value: string;
  url: UrlContent | undefined;
  text: TextContent | undefined;
}

export function contentSnapshot(): ContentSnapshot {
  const { value, contentConfigs } = useQREditorStore.getState();
  return {
    value,
    url: contentConfigs.url as UrlContent | undefined,
    text: contentConfigs.text as TextContent | undefined,
  };
}

/** Puts back the content `snapshot` holds, if it changed. */
export function restoreContent(snapshot: ContentSnapshot) {
  const store = useQREditorStore.getState();
  if (snapshot.url) store.setContentConfig("url", snapshot.url);
  if (snapshot.text) store.setContentConfig("text", snapshot.text);
  if (store.value !== snapshot.value) store.setValue(snapshot.value);
}

export function ContentField({
  onOpenContent,
}: {
  /** Keeps the edit and opens the Content tab with its form */
  onOpenContent: () => void;
}) {
  const t = useTranslations("editor.partInline.content");
  const contentType = useQREditorStore((state) => state.contentType);
  const value = useQREditorStore((state) => state.value);
  const linked = useDynamicLinkStore((state) => state.code);
  // A dynamic code encodes its short link; its address is edited with it
  const dynamic = Boolean(linked && value === linked.shortLink);

  if (contentType === "url" && !dynamic) return <UrlField />;
  if (contentType === "text") return <TextField />;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs text-pretty">
        {t("editedInTheContentTab")}
      </p>
      <Button
        className="w-full"
        onClick={onOpenContent}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("openTheContentTab")}
        <ArrowRight aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

function Message({
  id,
  tone,
  children,
}: {
  id: string;
  tone: "error" | "warning" | "hint";
  children: ReactNode;
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "text-muted-foreground flex items-start gap-1.5 text-xs text-pretty",
        tone === "error" && "text-destructive",
        tone === "warning" && "text-amber-700 dark:text-amber-400",
      )}
      id={id}
    >
      {tone === "error" && (
        <InfoCircle aria-hidden className="mt-px size-3.5 shrink-0" />
      )}
      {tone === "warning" && (
        <Warning2 aria-hidden className="mt-px size-3.5 shrink-0" />
      )}
      <span>{children}</span>
    </p>
  );
}

function UrlField() {
  const t = useTranslations("editor.partInline.content");
  const id = useId();
  const helperId = useId();
  const [url, setUrl] = useState(
    () =>
      (useQREditorStore.getState().contentConfigs.url as UrlContent | undefined)
        ?.url ?? "",
  );
  const check = checkUrl(url);

  const change = (next: string) => {
    setUrl(next);
    const result = checkUrl(next);
    // Only a real web address changes the code (https:// added when missing)
    if (result.status !== "ok" && result.status !== "warning") return;
    const store = useQREditorStore.getState();
    store.setContentConfig("url", { type: "url", url: next });
    if (store.value !== result.url) store.setValue(result.url);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor={id}>
        {t("link")}
      </Label>
      <Input
        aria-describedby={helperId}
        aria-invalid={check.status === "error" || undefined}
        autoCapitalize="none"
        autoComplete="url"
        id={id}
        inputMode="url"
        onChange={(event) => change(event.target.value)}
        placeholder="example.com"
        spellCheck={false}
        type="text"
        value={url}
      />
      {check.status === "error" ? (
        <Message id={helperId} tone="error">
          {check.message} {t("theCodeKeepsItsContent")}
        </Message>
      ) : check.status === "warning" ? (
        <Message id={helperId} tone="warning">
          {check.message}
        </Message>
      ) : check.status === "empty" ? (
        <Message id={helperId} tone="hint">
          {t("theCodeKeepsItsContent")}
        </Message>
      ) : (
        <Message id={helperId} tone="hint">
          {t("scansOpenHost", { host: check.host })}
        </Message>
      )}
    </div>
  );
}

function TextField() {
  const t = useTranslations("editor.partInline.content");
  const id = useId();
  const helperId = useId();
  const [text, setText] = useState(
    () =>
      (
        useQREditorStore.getState().contentConfigs.text as
          | TextContent
          | undefined
      )?.text ?? "",
  );
  const result = textSchema.safeParse({ text });
  const error = result.success ? null : result.error.issues[0]?.message;

  const change = (next: string) => {
    setText(next);
    const parsed = textSchema.safeParse({ text: next });
    if (!parsed.success) return;
    const config: TextContent = { type: "text", ...parsed.data };
    const store = useQREditorStore.getState();
    store.setContentConfig("text", config);
    const encoded = encodeText(config);
    if (store.value !== encoded) store.setValue(encoded);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor={id}>
        {t("text")}
      </Label>
      <Textarea
        aria-describedby={helperId}
        aria-invalid={Boolean(error) || undefined}
        className="resize-none"
        id={id}
        onChange={(event) => change(event.target.value)}
        rows={3}
        value={text}
      />
      <Message id={helperId} tone={error ? "error" : "hint"}>
        {error ? `${error}. ${t("theCodeKeepsItsContent")}` : t("textHint")}
      </Message>
    </div>
  );
}
