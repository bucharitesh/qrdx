"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import {
  TickCircle as CheckCircle2,
  Clock,
  Global as Globe,
  Add as Plus,
  Refresh2 as RefreshCw,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import {
  addCustomDomain,
  removeCustomDomain,
  verifyCustomDomain,
} from "@/actions/custom-domains";
import type { CustomDomainView } from "@/app/dashboard/domains/_lib/domains";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { DnsRecords } from "./dns-records";

const checkedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function DomainStatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">
      <CheckCircle2 />
      Verified
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock />
      Waiting for DNS
    </Badge>
  );
}

function DomainCard({
  domain,
  canManage,
  busy,
  onVerify,
  onRemove,
}: {
  domain: CustomDomainView;
  canManage: boolean;
  busy: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const [showRecords, setShowRecords] = useState(false);
  const recordsVisible = !domain.verified || showRecords;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-mono text-base break-all">
                {domain.hostname}
              </CardTitle>
              <DomainStatusBadge verified={domain.verified} />
            </div>
            <CardDescription>
              {domain.verified
                ? `Short links look like https://${domain.hostname}/aB3dE5f · used by ${plural(domain.codeCount, "code")}`
                : "Add these records at your DNS provider, then click Verify."}
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button
                disabled={busy}
                onClick={onVerify}
                size="sm"
                variant={domain.verified ? "outline" : "default"}
              >
                {busy ? <Spinner /> : <RefreshCw />}
                {domain.verified ? "Check DNS" : "Verify"}
              </Button>
              <Button
                aria-label={`Remove ${domain.hostname}`}
                disabled={busy}
                onClick={onRemove}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {domain.message && (
          <p
            className={cn(
              "rounded-md p-3 text-sm",
              domain.verified
                ? "bg-muted"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            {domain.verified ? `Last check: ${domain.message}` : domain.message}
          </p>
        )}
        {recordsVisible && (
          <DnsRecords apexName={domain.apexName} records={domain.records} />
        )}
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            {domain.checkedAt
              ? `Last checked ${checkedFormat.format(new Date(domain.checkedAt))}`
              : "Not checked yet"}
          </span>
          {domain.verified && domain.records.length > 0 && (
            <Button
              className="h-auto p-0 text-xs"
              onClick={() => setShowRecords((value) => !value)}
              size="sm"
              variant="link"
            >
              {showRecords ? "Hide DNS records" : "Show DNS records"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DomainsManager({
  domains,
  canManage,
  canAdd,
  limit,
  defaultHost,
  canUpgrade,
}: {
  domains: CustomDomainView[];
  /** Owner or admin of the active scope */
  canManage: boolean;
  /** Plan allows another domain */
  canAdd: boolean;
  limit: number;
  /** Host of default short links (codes fall back to it) */
  defaultHost: string;
  /** Personal scope: upgrading lifts the limit */
  canUpgrade: boolean;
}) {
  const router = useRouter();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const [hostname, setHostname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CustomDomainView | null>(null);
  const [isAdding, startAdding] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  const add = (event: FormEvent) => {
    event.preventDefault();
    setAddError(null);
    startAdding(async () => {
      const result = await addCustomDomain({ hostname });
      if (!result.success) {
        setAddError(result.error.message);
        if (result.error.code === "PLAN_REQUIRED" && canUpgrade) {
          openGetProDialog();
        }
        return;
      }
      setHostname("");
      toast.success(`Added ${result.data.hostname}`, {
        description: "Add the DNS records shown, then click Verify.",
      });
      router.refresh();
    });
  };

  const verify = async (domain: CustomDomainView) => {
    setBusyId(domain.id);
    try {
      const result = await verifyCustomDomain({ id: domain.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      if (result.data.verified && !domain.verified) {
        toast.success(`${domain.hostname} is verified`, {
          description: "You can now pick it for your dynamic codes.",
        });
      } else if (result.data.verified) {
        toast.success(
          result.data.message ? "Checked DNS" : "DNS looks good",
          result.data.message ? { description: result.data.message } : {},
        );
      } else {
        toast.info("Not verified yet", {
          description: result.data.message ?? undefined,
        });
      }
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = () => {
    const domain = removing;
    if (!domain) return;
    startRemoving(async () => {
      const result = await removeCustomDomain({ id: domain.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setRemoving(null);
      toast.success(`Removed ${domain.hostname}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card className="gap-3 py-4">
          <CardContent className="px-4">
            <form className="space-y-2" onSubmit={add}>
              <Label htmlFor="custom-domain">Add a domain</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  autoCapitalize="none"
                  autoComplete="off"
                  disabled={!canAdd || isAdding}
                  id="custom-domain"
                  inputMode="url"
                  maxLength={300}
                  onChange={(event) => setHostname(event.target.value)}
                  placeholder="go.yourbrand.com"
                  spellCheck={false}
                  value={hostname}
                />
                <Button
                  disabled={!canAdd || isAdding || !hostname.trim()}
                  type="submit"
                >
                  <Plus />
                  {isAdding ? "Adding..." : "Add domain"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {canAdd
                  ? "A subdomain such as go. or qr. works best: your main website stays where it is."
                  : limit === 0
                    ? "Adding domains needs Pro or Business."
                    : `You've added ${plural(limit, "domain")}, the most your plan includes. Remove one to add another.`}
              </p>
              {addError && (
                <p
                  className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
                  role="alert"
                >
                  {addError}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          Team owners and admins add and verify domains. You can use verified
          domains for your codes.
        </p>
      )}

      {domains.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>No custom domains yet</EmptyTitle>
            <EmptyDescription>
              Add a domain, create the DNS records we show you, then click
              Verify. Verified domains appear in the domain picker when you
              create or edit a dynamic code.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => (
            <DomainCard
              busy={
                busyId === domain.id ||
                (isRemoving && removing?.id === domain.id)
              }
              canManage={canManage}
              domain={domain}
              key={domain.id}
              onRemove={() => setRemoving(domain)}
              onVerify={() => verify(domain)}
            />
          ))}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isRemoving) setRemoving(null);
        }}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && removing.codeCount > 0
                ? `${removing.codeCount === 1 ? "1 code uses" : `${removing.codeCount} codes use`} this domain. QR codes printed with ${removing.hostname} links will stop working, and the codes switch to their ${defaultHost}/q/… link.`
                : `Short links on ${removing?.hostname ?? "this domain"} stop working.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <Button
              disabled={isRemoving}
              onClick={confirmRemove}
              variant="destructive"
            >
              {isRemoving ? "Removing..." : "Remove domain"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
