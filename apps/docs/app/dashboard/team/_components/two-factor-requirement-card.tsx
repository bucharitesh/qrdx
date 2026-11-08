"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  membersWithoutTwoFactor,
  TWO_FACTOR_SECTION_ID,
  TWO_FACTOR_SETTINGS_PATH,
} from "@/lib/workspace-two-factor";
import { setTwoFactorRequirement } from "../_lib/two-factor-requirement-actions";

const LINK =
  "text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/**
 * Settings → Team → "Require two-step verification". Owners and admins turn
 * it on or off (on Business, and with two-step verification on themselves);
 * everyone else sees whether it's on.
 */
export function TwoFactorRequirementCard({
  workspaceName,
  required,
  stored,
  planAllows,
  planName,
  canChange,
  forbidden,
  viewerHasTwoFactor,
  membersWithout,
}: {
  workspaceName: string;
  /** It applies now: on, and the plan includes it */
  required: boolean;
  /** The stored setting (kept while the plan doesn't include it) */
  stored: boolean;
  planAllows: boolean;
  /** "Business" */
  planName: string;
  /** Owner or admin */
  canChange: boolean;
  /** Why someone else can't change it */
  forbidden: string;
  viewerHasTwoFactor: boolean;
  /** Members without two-step verification (owners and admins only) */
  membersWithout: number | null;
}) {
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [pending, startTransition] = useTransition();
  // The switch shows the change while it's saved; once the page has
  // refreshed (or anything else changed it), the server's value again.
  const [shown, setShown] = useState<{ value: boolean; from: boolean } | null>(
    null,
  );
  const [asking, setAsking] = useState(false);

  const checked = shown && shown.from === required ? shown.value : required;
  const canTurnOn = canChange && planAllows && viewerHasTwoFactor;
  const disabled = pending || (checked ? !canChange : !canTurnOn);

  const save = (next: boolean) =>
    startTransition(async () => {
      setShown({ value: next, from: required });
      const result = await withConfirmation(
        () => setTwoFactorRequirement({ required: next }),
        next ? "require-two-factor" : "stop-requiring-two-factor",
      );
      setAsking(false);
      if (result === null) {
        setShown(null);
        return;
      }
      if (!result.ok) {
        setShown(null);
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? "Two-step verification is now required"
          : "Two-step verification is no longer required",
      );
      router.refresh();
    });

  const onCheckedChange = (next: boolean) => {
    // Turning it on shuts out whoever doesn't have it yet: say so first.
    if (next && (membersWithout ?? 0) > 0) {
      setAsking(true);
      return;
    }
    save(next);
  };

  let note: ReactNode = null;
  if (!planAllows) {
    note = (
      <>
        {stored
          ? `It's off while this workspace isn't on ${planName}, and applies again if it moves back.`
          : `Requiring two-step verification comes with ${planName}.`}{" "}
        <Link className={`py-3 ${LINK}`} href="/pricing">
          See plans
        </Link>
      </>
    );
  } else if (!canChange) {
    note = forbidden;
  } else if (!required && !viewerHasTwoFactor) {
    note = (
      <>
        Turn on two-step verification for your own account first.{" "}
        <Link
          className={`py-3 ${LINK}`}
          href={`${TWO_FACTOR_SETTINGS_PATH}#${TWO_FACTOR_SECTION_ID}`}
        >
          Profile & security
        </Link>
      </>
    );
  } else if (required && membersWithout !== null) {
    note =
      membersWithout === 0
        ? "Everyone in this workspace has it on."
        : `${membersWithoutTwoFactor(membersWithout)} They're asked to turn it on when they next open the workspace.`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-step verification</CardTitle>
        <CardDescription className="text-pretty">
          Ask everyone in {workspaceName} to sign in with a second step, a
          passkey or an authenticator app, so access to their email alone isn't
          enough.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-two-factor">
              Require two-step verification
            </Label>
            <p className="text-muted-foreground text-sm text-pretty">
              Members without it can't open this workspace until they turn it
              on. Nobody is emailed: they're told when they next open it.
            </p>
          </div>
          <Switch
            checked={checked}
            disabled={disabled}
            id="require-two-factor"
            onCheckedChange={onCheckedChange}
          />
        </div>
        {note && (
          <p className="text-muted-foreground rounded-lg border p-4 text-sm text-pretty">
            {note}
          </p>
        )}
      </CardContent>

      <AlertDialog
        onOpenChange={(open) => !(open || pending) && setAsking(false)}
        open={asking}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Require two-step verification?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {membersWithoutTwoFactor(membersWithout ?? 0)} They can't open{" "}
              {workspaceName} until they do. Nobody is emailed; they're told
              when they next open it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                save(true);
              }}
            >
              Require
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
