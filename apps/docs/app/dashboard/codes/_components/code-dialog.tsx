"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Palette } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { createQrCode, updateQrCode } from "@/actions/qr-codes";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { normalizeDestination } from "@/components/editor/dynamic-link-toggle";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { CodeDownloadButtons, CodeQr } from "./code-qr";
import { useOpenInPlayground } from "./use-open-in-playground";

interface CodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this code; omitted = create a new one */
  code?: QrCodeView;
}

export function CodeDialog({ open, onOpenChange, code }: CodeDialogProps) {
  const router = useRouter();
  const openInPlayground = useOpenInPlayground();
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const [destination, setDestination] = useState("");
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<QrCodeView | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setDestination(code?.destinationUrl ?? "");
      setTitle(code?.title ?? "");
      setCreated(null);
      setError(null);
    }
  }, [open, code]);

  const preview = code ?? created;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const destinationUrl = normalizeDestination(destination);
    if (!destinationUrl) {
      setError({
        code: "VALIDATION_ERROR",
        message: "Enter a web address, for example https://example.com",
      });
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = code
        ? await updateQrCode({ id: code.id, destinationUrl, title })
        : await createQrCode({ destinationUrl, title });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (code) {
        toast.success("Changes saved", {
          description: "Scans now open the updated destination.",
        });
        onOpenChange(false);
      } else {
        setCreated(result.data);
      }
    });
  };

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="p-6 sm:max-w-2xl" showCloseButton>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {code
              ? "Edit dynamic QR code"
              : created
                ? "Your dynamic QR code is ready"
                : "New dynamic QR code"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {created
              ? "Download it and print it anywhere. You can change where it points at any time."
              : "The QR code encodes a short link, so you can change the destination after printing."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="grid gap-6 py-4 md:grid-cols-[1fr_220px]">
          {created ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Short link</Label>
                <div className="flex items-center gap-1">
                  <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm">
                    {created.shortLink}
                  </code>
                  <CopyButton
                    className="size-8"
                    successMessage={{ title: "Short link copied" }}
                    textToCopy={created.shortLink}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Opens</Label>
                <p className="text-muted-foreground text-sm break-all">
                  {created.destinationUrl}
                </p>
              </div>
            </div>
          ) : (
            <form className="space-y-4" id="code-form" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="code-destination">Destination URL</Label>
                <Input
                  autoFocus
                  id="code-destination"
                  inputMode="url"
                  maxLength={2048}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="https://example.com/menu"
                  required
                  value={destination}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-title">
                  Title{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="code-title"
                  maxLength={100}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Table tent, spring menu"
                  value={title}
                />
              </div>
              {error && (
                <div
                  className="bg-destructive/10 text-destructive space-y-2 rounded-md p-3 text-sm"
                  role="alert"
                >
                  <p>{error.message}</p>
                  {error.code === "LIMIT_REACHED" && (
                    <Button onClick={openGetProDialog} size="sm" type="button">
                      Upgrade to Pro
                    </Button>
                  )}
                </div>
              )}
            </form>
          )}

          <div className="space-y-3">
            {preview ? (
              <>
                <CodeQr
                  className="bg-muted/40 rounded-lg border p-3"
                  style={preview.style}
                  value={preview.shortLink}
                />
                <CodeDownloadButtons code={preview} />
                <Button
                  className="w-full"
                  onClick={() => openInPlayground(preview)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Palette />
                  Edit design in playground
                </Button>
              </>
            ) : (
              <div className="text-muted-foreground flex aspect-square items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
                Your QR code appears here once it's created.
              </div>
            )}
          </div>
        </div>

        <ResponsiveDialogFooter className="gap-2">
          {created ? (
            <>
              <Button asChild variant="outline">
                <Link
                  href={`/dashboard/codes/${encodeURIComponent(created.id)}`}
                >
                  View analytics
                </Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancel
              </Button>
              <Button disabled={isPending} form="code-form" type="submit">
                {isPending
                  ? "Saving..."
                  : code
                    ? "Save changes"
                    : "Create code"}
              </Button>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
