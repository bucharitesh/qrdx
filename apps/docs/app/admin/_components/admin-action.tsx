"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import type { AdminActionResult } from "../_lib/action";
import {
  banUserAction,
  removeCommunityThemeAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
} from "../actions";
import {
  setDynamicCodeActiveAction,
  setDynamicCodePausedAction,
} from "../codes/actions";
import {
  cancelImportAction,
  deleteUserAccountAction,
  disconnectIntegrationAction,
  markEmailVerifiedAction,
  requeueImportAction,
  resendInvitationAction,
  retryWebhookDeliveryAction,
  setOAuthAppSuspendedAction,
  setOAuthAppVerifiedAction,
  unlinkSignInMethodAction,
} from "../users/support-actions";

// Server actions by name, so server components can render a confirm button
// for any of them with plain (serializable) props. Each action re-checks
// admin, validates and audits on the server; this file only collects input.
const ACTIONS = {
  ban: banUserAction,
  unban: unbanUserAction,
  revokeSessions: revokeUserSessionsAction,
  setRole: setUserRoleAction,
  removeCommunityTheme: removeCommunityThemeAction,
  setCodeActive: setDynamicCodeActiveAction,
  setCodePaused: setDynamicCodePausedAction,
  markEmailVerified: markEmailVerifiedAction,
  unlinkSignIn: unlinkSignInMethodAction,
  retryDelivery: retryWebhookDeliveryAction,
  requeueImport: requeueImportAction,
  cancelImport: cancelImportAction,
  disconnectIntegration: disconnectIntegrationAction,
  setAppVerified: setOAuthAppVerifiedAction,
  setAppSuspended: setOAuthAppSuspendedAction,
  resendInvitation: resendInvitationAction,
  deleteAccount: deleteUserAccountAction,
} as const;

export type AdminActionName = keyof typeof ACTIONS;

type AnyAction = (input: never) => Promise<AdminActionResult<unknown>>;

function describeResult(success: string, data: unknown): string {
  if (!data || typeof data !== "object") return success;
  const value = data as Record<string, unknown>;
  if (typeof value.status === "string") {
    const error = typeof value.error === "string" ? `: ${value.error}` : "";
    return `${success}. Delivery is now ${value.status}${error}`;
  }
  if (value.emailed === false) {
    return `${success}. No email was sent from this environment; share the invite link instead.`;
  }
  return success;
}

export interface AdminActionProps {
  action: AdminActionName;
  /** Everything the action needs except the reason */
  input: Record<string, unknown>;
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  success: string;
  destructive?: boolean;
  size?: "sm" | "default";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  /** Optional actions (quick triage) may skip the reason */
  reasonOptional?: boolean;
  /** The confirm button stays off until this is typed exactly */
  typeToConfirm?: string;
  /** An extra whole-number field, e.g. ban length in days */
  numberField?: { name: string; label: string; min?: number; max?: number };
  disabled?: boolean;
  disabledHint?: string;
  /** Where to go after success (e.g. the user list after a delete) */
  redirectTo?: string;
}

/** A button that opens a confirm dialog with a reason, then runs the action. */
export function AdminAction({
  action,
  input,
  label,
  title,
  description,
  confirmLabel = "Confirm",
  success,
  destructive = false,
  size = "sm",
  variant,
  reasonOptional = false,
  typeToConfirm,
  numberField,
  disabled = false,
  disabledHint,
  redirectTo,
}: AdminActionProps) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reasonOk = reasonOptional || reason.trim().length >= 3;
  const typedOk =
    !typeToConfirm ||
    typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase();

  const reset = () => {
    setReason("");
    setTyped("");
    setNumber("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    const extra: Record<string, unknown> = {};
    if (numberField && number) {
      extra[numberField.name] = Number.parseInt(number, 10);
    }
    if (typeToConfirm) extra.confirmation = typed.trim();
    startTransition(async () => {
      const run = ACTIONS[action] as AnyAction;
      try {
        const result = await run({
          ...input,
          ...extra,
          reason: reason.trim() || undefined,
        } as never);
        if (result.ok) {
          toast.success(describeResult(success, result.data));
          setOpen(false);
          reset();
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("Action failed. Reload the page and try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={disabled || isPending}
          size={size}
          title={disabled ? disabledHint : undefined}
          variant={variant ?? "outline"}
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (reasonOk && typedOk && !isPending) submit();
          }}
        >
          {numberField && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-number`}>{numberField.label}</Label>
              <Input
                id={`${id}-number`}
                inputMode="numeric"
                max={numberField.max}
                min={numberField.min}
                onChange={(event) => setNumber(event.target.value)}
                type="number"
                value={number}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}>
              Reason{reasonOptional ? " (optional)" : ""}
            </Label>
            <Textarea
              id={`${id}-reason`}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ticket number, what the user asked for, what you saw"
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              Saved in the audit log with your name.
            </p>
          </div>
          {typeToConfirm && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-typed`}>
                Type <span className="font-mono">{typeToConfirm}</span> to
                confirm
              </Label>
              <Input
                autoComplete="off"
                id={`${id}-typed`}
                onChange={(event) => setTyped(event.target.value)}
                value={typed}
              />
            </div>
          )}
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={!(reasonOk && typedOk) || isPending}
              type="submit"
              variant={destructive ? "destructive" : "default"}
            >
              {isPending ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
