"use client";

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
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/events/types";
import { EventCheckboxes } from "./event-checkboxes";

export interface EndpointFormValues {
  url: string;
  events: WebhookEvent[];
}

/** Create or edit an endpoint: https URL + subscribed events. */
export function EndpointDialog({
  open,
  onOpenChange,
  mode,
  initial,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: EndpointFormValues;
  pending: boolean;
  error: string | null;
  onSubmit: (values: EndpointFormValues) => void;
}) {
  const t = useTranslations("app.dashboard.webhooks.endpointDialog");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>(
    initial?.events ?? [...WEBHOOK_EVENTS],
  );

  useEffect(() => {
    if (open) {
      setUrl(initial?.url ?? "");
      setEvents(initial?.events ?? [...WEBHOOK_EVENTS]);
    }
  }, [open, initial]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ url: url.trim(), events });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? t("addWebhookEndpoint") : t("editEndpoint")}
            </DialogTitle>
            <DialogDescription>{t("qrdxSendsASignedJson")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("endpointUrl")}</Label>
            <Input
              autoComplete="off"
              id="webhook-url"
              inputMode="url"
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/qrdx"
              required
              spellCheck={false}
              type="url"
              value={url}
            />
            <p className="text-muted-foreground text-xs">
              {t("publicHttpsUrlsOnlyRedirects")}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("events")}</legend>
            <EventCheckboxes
              events={WEBHOOK_EVENTS}
              idPrefix={`webhook-${mode}`}
              onChange={setEvents}
              value={events}
            />
          </fieldset>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={pending || events.length === 0} type="submit">
              {pending
                ? t("saving")
                : mode === "create"
                  ? t("addEndpoint")
                  : t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
