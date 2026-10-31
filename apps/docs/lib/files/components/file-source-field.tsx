"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Link2 } from "iconsax-reactjs";
import { type FormEvent, useId, useState } from "react";
import { CloudFileButton } from "@/components/connected-accounts/cloud-file-button";
import { FieldRow, normalizeLink } from "@/components/landing/editor/fields";
import { landingUrlSchema } from "@/types/landing";
import type { FileSource } from "../source";
import { FILE_KIND_LABELS, type FileKind, type FileView } from "../types";
import { FileKindIcon } from "./file-kind-icon";
import { LibraryButton } from "./library-dialog";
import { UploadButton } from "./upload-button";

export const STORAGE_OFF_MESSAGE = "Storage not configured on this server.";

export const fileToSource = (file: FileView): FileSource => ({
  type: "file",
  fileId: file.id,
  name: file.filename,
});

/** "Paste a link" input; `validate` returns an error message or null. */
export function LinkInput({
  placeholder = "https://…",
  buttonLabel = "Use link",
  validate,
  onSubmit,
}: {
  placeholder?: string;
  buttonLabel?: string;
  validate?: (url: string) => string | null;
  onSubmit: (url: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = landingUrlSchema.safeParse(normalizeLink(value));
    const message = parsed.success
      ? (validate?.(parsed.data) ?? null)
      : (parsed.error.issues[0]?.message ?? "Enter a valid link");
    setError(message);
    if (parsed.success && !message) {
      onSubmit(parsed.data);
      setValue("");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-label="Link to a file"
          autoCapitalize="off"
          inputMode="url"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit(event);
          }}
          placeholder={placeholder}
          value={value}
        />
        <Button
          disabled={!value.trim()}
          onClick={() => submit()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Link2 />
          {buttonLabel}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-xs" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One media source for a block: upload a file, pick one already uploaded, or
 * paste a link to a file hosted elsewhere (always available, also when this
 * server has no storage).
 */
export function FileSourceField({
  label,
  kind,
  value,
  onChange,
  storageEnabled,
  allowLink = true,
  linkPlaceholder,
  linkHint,
  validateLink,
}: {
  label: string;
  kind: FileKind;
  value: FileSource | null;
  onChange: (next: FileSource | null) => void;
  storageEnabled: boolean;
  allowLink?: boolean;
  linkPlaceholder?: string;
  linkHint?: string;
  validateLink?: (url: string) => string | null;
}) {
  const kindLabel = FILE_KIND_LABELS[kind];

  if (value) {
    return (
      <FieldRow label={label}>
        <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          {value.type === "file" ? (
            <FileKindIcon
              className="size-4 shrink-0 text-muted-foreground"
              kind={kind}
            />
          ) : (
            <Link2
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">
            {value.type === "file"
              ? value.name || `Uploaded ${kindLabel.toLowerCase()}`
              : value.url}
          </span>
          <Button
            aria-label={`Remove ${kindLabel.toLowerCase()}`}
            onClick={() => onChange(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow hint={linkHint} label={label}>
      {storageEnabled ? (
        <div className="flex flex-wrap items-start gap-2">
          <UploadButton
            kinds={[kind]}
            onUploaded={([file]) => file && onChange(fileToSource(file))}
            size="sm"
          >
            Upload {kindLabel.toLowerCase()}
          </UploadButton>
          <LibraryButton
            kind={kind}
            onSelect={([file]) => file && onChange(fileToSource(file))}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {STORAGE_OFF_MESSAGE}
          {allowLink && " Paste a link to the file instead."}
        </p>
      )}
      {allowLink && (
        <CloudFileButton onPick={(url) => onChange({ type: "url", url })} />
      )}
      {allowLink && (
        <div className="space-y-1">
          {storageEnabled && (
            <p className="text-muted-foreground text-xs">Or paste a link</p>
          )}
          <LinkInput
            onSubmit={(url) => onChange({ type: "url", url })}
            placeholder={linkPlaceholder}
            validate={validateLink}
          />
        </div>
      )}
    </FieldRow>
  );
}
