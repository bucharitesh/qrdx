"use client";

// Settings → Client portal: invite clients by email, choose the folders
// each one sees, change that later, or remove them (agency tools).

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { Edit2, Folder2, UserRemove } from "iconsax-reactjs";
import { type FormEvent, useId, useState, useTransition } from "react";
import {
  invitePortalClientAction,
  removePortalClientAction,
  updatePortalClientAction,
} from "@/actions/portal";
import { formatDate } from "@/app/(app)/dashboard/codes/_components/format";
import type { PortalClientView } from "@/lib/portal/manage";
import { soundEvent } from "@/lib/sound/emit";

export interface PortalFolderOption {
  id: string;
  name: string;
  depth: number;
}

function FolderChecklist({
  folders,
  selected,
  onChange,
  disabled,
}: {
  folders: PortalFolderOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (folders.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
        No folders yet. Make one in Codes, put the client's codes in it, then
        share it here.
      </p>
    );
  }
  return (
    <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
      {folders.map((folder) => {
        const checked = selected.includes(folder.id);
        return (
          <label
            className={cn(
              "hover:bg-muted/60 flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm",
              disabled && "pointer-events-none opacity-60",
            )}
            htmlFor={`${id}-${folder.id}`}
            key={folder.id}
            style={{ paddingLeft: `${0.5 + folder.depth * 1}rem` }}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              id={`${id}-${folder.id}`}
              onCheckedChange={(value) =>
                onChange(
                  value
                    ? [...selected, folder.id]
                    : selected.filter((other) => other !== folder.id),
                )
              }
            />
            <Folder2 aria-hidden className="text-muted-foreground size-4" />
            <span className="truncate">{folder.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function ClientRow({
  client,
  folders,
  onChange,
  onRemove,
}: {
  client: PortalClientView;
  folders: PortalFolderOption[];
  onChange: (client: PortalClientView) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState(client.folderIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const names = folders
    .filter((folder) => client.folderIds.includes(folder.id))
    .map((folder) => folder.name);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updatePortalClientAction({
        id: client.id,
        name: client.name,
        folderIds: selected,
      });
      if (!result.ok) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      soundEvent("success");
      onChange(result.data);
      setEditing(false);
      toast.success("Folders updated", {
        description: `${client.name || client.email} sees the change on their next page.`,
      });
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removePortalClientAction({ id: client.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRemove(client.id);
      toast.success("Client removed", {
        description: `${client.email} can no longer open the portal.`,
      });
    });
  };

  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {client.name || client.email}
            </span>
            <Badge variant={client.acceptedAt ? "secondary" : "outline"}>
              {client.acceptedAt
                ? `Joined ${formatDate(client.acceptedAt)}`
                : "Invited"}
            </Badge>
          </div>
          {client.name && (
            <p className="text-muted-foreground truncate text-xs">
              {client.email}
            </p>
          )}
          <p className="text-muted-foreground text-xs text-pretty">
            {names.length > 0
              ? `Sees ${names.join(", ")}`
              : "No folders shared: they see an empty portal."}
          </p>
        </div>
        {!(editing || confirming) && (
          <div className="flex gap-1">
            <Button
              onClick={() => {
                setSelected(client.folderIds);
                setEditing(true);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Edit2 aria-hidden />
              Folders
            </Button>
            <Button
              aria-label={`Remove ${client.email}`}
              onClick={() => setConfirming(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <UserRemove aria-hidden />
              Remove
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="space-y-2">
          <FolderChecklist
            disabled={isPending}
            folders={folders}
            onChange={setSelected}
            selected={selected}
          />
          <div className="flex justify-end gap-2">
            <Button
              disabled={isPending}
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || selected.length === 0}
              onClick={save}
              size="sm"
              type="button"
            >
              {isPending && <Spinner aria-hidden className="animate-spin" />}
              Save folders
            </Button>
          </div>
        </div>
      )}
      {confirming && (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md p-2.5 text-sm">
          <span className="text-pretty">
            Remove {client.email}? They lose access at once.
          </span>
          <span className="flex gap-1">
            <Button
              disabled={isPending}
              onClick={() => setConfirming(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={remove}
              size="sm"
              type="button"
              variant="destructive"
            >
              Remove
            </Button>
          </span>
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function PortalClientsManager({
  clients: initialClients,
  folders,
  canInvite,
}: {
  clients: PortalClientView[];
  folders: PortalFolderOption[];
  /** The plan includes the portal (removing works either way) */
  canInvite: boolean;
}) {
  const id = useId();
  const [clients, setClients] = useState(initialClients);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const invite = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await invitePortalClientAction({
        email,
        name,
        folderIds: selected,
      });
      if (!result.ok) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      soundEvent("success");
      const { client, emailed } = result.data;
      setClients((current) =>
        [...current.filter((row) => row.id !== client.id), client].sort(
          (a, b) => a.email.localeCompare(b.email),
        ),
      );
      setEmail("");
      setName("");
      setSelected([]);
      toast.success(emailed ? "Invitation sent" : "Client added", {
        description: emailed
          ? `We emailed ${client.email} the portal link.`
          : "Email isn't set up on this server: send them the portal link yourself.",
      });
    });
  };

  return (
    <div className="space-y-6">
      {canInvite && (
        <form className="space-y-4" onSubmit={invite}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-email`}>Client's email</Label>
              <Input
                autoComplete="off"
                disabled={isPending}
                id={`${id}-email`}
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@client.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-name`}>Name (optional)</Label>
              <Input
                autoComplete="off"
                disabled={isPending}
                id={`${id}-name`}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Client or company name"
                value={name}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Folders they see</Label>
            <FolderChecklist
              disabled={isPending}
              folders={folders}
              onChange={setSelected}
              selected={selected}
            />
            <p className="text-muted-foreground text-xs">
              Only the folders you tick. Subfolders aren't included unless you
              tick them too.
            </p>
          </div>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              disabled={isPending || !email.trim() || selected.length === 0}
              type="submit"
            >
              {isPending && <Spinner aria-hidden className="animate-spin" />}
              Invite client
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Clients{" "}
          <span className="text-muted-foreground font-normal">
            {clients.length}
          </span>
        </h3>
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No clients yet. Invite one above.
          </p>
        ) : (
          <ul className="divide-y">
            {clients.map((client) => (
              <ClientRow
                client={client}
                folders={folders}
                key={client.id}
                onChange={(next) =>
                  setClients((current) =>
                    current.map((row) => (row.id === next.id ? next : row)),
                  )
                }
                onRemove={(gone) =>
                  setClients((current) =>
                    current.filter((row) => row.id !== gone),
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
