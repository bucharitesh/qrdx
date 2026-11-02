"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Add } from "iconsax-reactjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type { ApiKeyView } from "@/lib/api-keys/service";
import { accessLabel, firstRequest, maskedKey } from "@/lib/api-keys/shared";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "../_lib/api-key-actions";
import { CreateApiKeyForm } from "./create-api-key-form";
import { formatDate } from "./format";
import { CopyField, Snippet } from "./snippet";

const QUICKSTART_HREF = "/docs/developers/quickstart";

export type ApiKeysState =
  | { available: true; keys: ApiKeyView[] }
  | { available: false };

function KeyMeta({ apiKey }: { apiKey: ApiKeyView }) {
  const parts = [
    accessLabel(apiKey.scopes),
    apiKey.lastUsedAt
      ? `Last used ${formatDate(apiKey.lastUsedAt)}`
      : "Never used",
    apiKey.expiresAt
      ? `${apiKey.expired ? "Expired" : "Expires"} ${formatDate(apiKey.expiresAt)}`
      : null,
    apiKey.mine ? null : `By ${apiKey.creator.name || "a former member"}`,
  ].filter(Boolean);
  return <p className="text-muted-foreground text-xs">{parts.join(" · ")}</p>;
}

function KeyList({
  keys,
  onRevoke,
}: {
  keys: ApiKeyView[];
  onRevoke: (key: ApiKeyView) => void;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {keys.map((apiKey) => (
        <li className="flex items-center gap-4 p-4" key={apiKey.id}>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium">{apiKey.name}</p>
              {apiKey.expired && <Badge variant="outline">Expired</Badge>}
            </div>
            <p className="text-muted-foreground font-mono text-xs">
              {maskedKey(apiKey.start)}
            </p>
            <KeyMeta apiKey={apiKey} />
          </div>
          {apiKey.canRevoke && (
            <Button onClick={() => onRevoke(apiKey)} size="sm" variant="ghost">
              Revoke
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Shown once, right after creation: the key and a request to try it with. */
function KeyCreatedDialog({
  created,
  apiBase,
  onClose,
}: {
  created: { key: string; apiKey: ApiKeyView } | null;
  apiBase: string;
  onClose: () => void;
}) {
  const sample = created
    ? firstRequest(apiBase, created.key, created.apiKey.scopes)
    : null;
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={created !== null}>
      <DialogContent
        className="sm:max-w-2xl"
        // A stray click outside must not throw away a key shown only once.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Copy your API key</DialogTitle>
          <DialogDescription>
            It's shown only this once. Keep it on your server, never in a
            browser or an app.
          </DialogDescription>
        </DialogHeader>
        {created && sample && (
          <div className="min-w-0 space-y-4">
            <CopyField label="API key" value={created.key} />
            <Snippet code={sample.command} label={sample.description} />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings → API keys & apps: the open workspace's API keys. */
export function ApiKeysSection({
  state,
  workspaceName,
  isTeam,
  apiBase,
  openCreate,
  emptyFigure,
}: {
  state: ApiKeysState;
  workspaceName: string;
  isTeam: boolean;
  /** The API base URL for samples, as seen from this site */
  apiBase: string;
  /** Open the create dialog straight away (`?new=1`, from the quickstart) */
  openCreate: boolean;
  emptyFigure: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const keys = state.available ? state.keys : [];
  const [creating, setCreating] = useState(openCreate && state.available);
  const [created, setCreated] = useState<{
    key: string;
    apiKey: ApiKeyView;
  } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [pending, startTransition] = useTransition();

  const closeCreated = () => {
    setCreated(null);
    // Drop ?new=1 so a reload doesn't open the form again.
    if (openCreate) router.replace(pathname);
    router.refresh();
  };

  const revoke = (apiKey: ApiKeyView) =>
    startTransition(async () => {
      const result = await revokeApiKeyAction({ id: apiKey.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRevoking(null);
      toast.success("Key revoked");
      router.refresh();
    });

  return (
    <section aria-labelledby="api-keys-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold" id="api-keys-heading">
            API keys
          </h2>
          <p className="text-muted-foreground text-sm">
            Call the REST API from your servers and scripts. Keys act as you in{" "}
            <span className="text-foreground font-medium">{workspaceName}</span>
            {isTeam ? ", with your role there." : "."}
          </p>
        </div>
        {state.available && keys.length > 0 && (
          <Button onClick={() => setCreating(true)} size="sm">
            <Add />
            Create key
          </Button>
        )}
      </div>

      {!state.available ? (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          API keys aren't available on this deployment yet.
        </p>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center">
          {emptyFigure}
          <div className="space-y-1">
            <p className="text-sm font-medium">No API keys yet</p>
            <p className="text-muted-foreground text-sm">
              Create a key, then make your first request with one curl command.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Add />
            Create key
          </Button>
          <Link
            className="text-muted-foreground text-xs underline underline-offset-4"
            href={QUICKSTART_HREF}
          >
            Read the quickstart
          </Link>
        </div>
      ) : (
        <KeyList keys={keys} onRevoke={setRevoking} />
      )}

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              {isTeam
                ? `For ${workspaceName}. It can do what your role allows, within its scopes.`
                : "For your own workspace, within the scopes you choose."}
            </DialogDescription>
          </DialogHeader>
          <CreateApiKeyForm
            defaultName={keys.length === 0 ? "My first key" : ""}
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const result = await createApiKeyAction(input);
              if (!result.ok) return result.error;
              setCreating(false);
              setCreated(result.data);
              return null;
            }}
          />
        </DialogContent>
      </Dialog>

      <KeyCreatedDialog
        apiBase={apiBase}
        created={created}
        onClose={closeCreated}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setRevoking(null)}
        open={revoking !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests with this key fail from now on. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => revoking && revoke(revoking)}
              variant="destructive"
            >
              Revoke key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
