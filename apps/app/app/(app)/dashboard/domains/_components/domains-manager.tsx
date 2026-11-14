"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
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
  Flash,
  Global as Globe,
  Add as Plus,
  Refresh2 as RefreshCw,
  Trash as Trash2,
} from "iconsax-reactjs";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  addCustomDomain,
  removeCustomDomain,
  verifyCustomDomain,
} from "@/actions/custom-domains";
import type { CustomDomainView } from "@/app/(app)/dashboard/domains/_lib/domains";
import { InlineLimit } from "@/components/limits/inline-limit";
import { useShowLimit } from "@/components/limits/limit-dialog";
import type {
  DomainConnectOffer,
  DomainConnectOffers,
} from "@/lib/domain-connect/offers";
import type { ConnectReturn } from "@/lib/domain-connect/return";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { DnsRecords } from "./dns-records";

const NO_OFFERS: DomainConnectOffers = {};

/** After a return from the DNS provider: check now, then twice more while DNS settles. */
const AUTO_VERIFY_DELAYS_MS = [0, 10_000, 25_000];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Renders once the streamed one-click offers have arrived. */
function WithOffers({
  offers,
  children,
}: {
  offers: Promise<DomainConnectOffers>;
  children: (offers: DomainConnectOffers) => ReactNode;
}) {
  return children(use(offers));
}

const checkedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function DomainStatusBadge({ verified }: { verified: boolean }) {
  const t = useTranslations("app.dashboard.domains.domainsManager");
  return verified ? (
    <Badge variant="secondary">
      <CheckCircle2 />
      {t("verified")}
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock />
      {t("waitingForDns")}
    </Badge>
  );
}

function DomainCard({
  domain,
  canManage,
  busy,
  offer,
  onVerify,
  onRemove,
}: {
  domain: CustomDomainView;
  canManage: boolean;
  busy: boolean;
  /** One-click DNS setup at the domain's DNS provider, when it works */
  offer: DomainConnectOffer | null;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.dashboard.domains.domainsManager");
  const [showRecords, setShowRecords] = useState(false);
  const recordsVisible = !domain.verified || showRecords;
  const oneClick = offer && canManage && !domain.verified ? offer : null;
  const provider = oneClick?.providerName ?? null;

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
                ? t("shortLinksLookLikeHttps", {
                    hostname: domain.hostname,
                    count: domain.codeCount,
                  })
                : oneClick
                  ? provider
                    ? t("providerCanAddRecords", { provider })
                    : t("yourProviderCanAddRecords")
                  : t("addTheseRecordsAtYour")}
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button
                disabled={busy}
                onClick={onVerify}
                size="sm"
                variant={domain.verified || oneClick ? "outline" : "default"}
              >
                {busy ? <ModuleOrbit aria-hidden /> : <RefreshCw />}
                {domain.verified ? t("checkDns") : t("verify")}
              </Button>
              <Button
                aria-label={t("removeHostname2", { hostname: domain.hostname })}
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
        {oneClick && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button asChild className="w-full sm:w-auto">
              <a href={oneClick.url}>
                <Flash />
                {provider
                  ? t("setUpWithProvider", { provider })
                  : t("setUpAutomatically")}
              </a>
            </Button>
            <p className="text-muted-foreground text-xs">
              {provider
                ? t("approveAtProvider", { provider })
                : t("approveAtYourProvider")}
            </p>
          </div>
        )}
        {domain.message && (
          <p
            className={cn(
              "rounded-md p-3 text-sm",
              domain.verified
                ? "bg-muted"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            {domain.verified
              ? t("lastCheckMessage", { message: domain.message })
              : domain.message}
          </p>
        )}
        {recordsVisible && oneClick && domain.records.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {t("orAddTheseRecordsYourself")}
          </p>
        )}
        {recordsVisible && (
          <DnsRecords apexName={domain.apexName} records={domain.records} />
        )}
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            {domain.checkedAt
              ? t("lastCheckedValue", {
                  value: checkedFormat.format(new Date(domain.checkedAt)),
                })
              : t("notCheckedYet")}
          </span>
          {domain.verified && domain.records.length > 0 && (
            <Button
              className="h-auto p-0 text-xs"
              onClick={() => setShowRecords((value) => !value)}
              size="sm"
              variant="link"
            >
              {showRecords ? t("hideDnsRecords") : t("showDnsRecords")}
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
  connectOffers,
  connectReturn = null,
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
  /** One-click DNS setup by domain id, streamed (only where it's enabled) */
  connectOffers?: Promise<DomainConnectOffers>;
  /** Back from the DNS provider's consent page */
  connectReturn?: ConnectReturn | null;
}) {
  const t = useTranslations("app.dashboard.domains.domainsManager");
  const router = useRouter();
  const pathname = usePathname();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const showLimit = useShowLimit();
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
        // The plan's domain cap: the limit card says why and what lifts it.
        if (result.error.code === "LIMIT_REACHED") {
          showLimit("customDomains", { message: result.error.message });
          return;
        }
        setAddError(result.error.message);
        if (result.error.code === "PLAN_REQUIRED" && canUpgrade) {
          openGetProDialog();
        }
        return;
      }
      setHostname("");
      toast.success(t("addedHostname", { hostname: result.data.hostname }), {
        description: t("addTheDnsRecordsShown"),
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
        toast.success(t("hostnameIsVerified", { hostname: domain.hostname }), {
          description: t("youCanNowPickIt"),
        });
      } else if (result.data.verified) {
        toast.success(
          result.data.message ? t("checkedDns") : t("dnsLooksGood"),
          result.data.message ? { description: result.data.message } : {},
        );
      } else {
        toast.info(t("notVerifiedYet"), {
          description: result.data.message ?? undefined,
        });
      }
      router.refresh();
    } catch {
      toast.error(t("somethingWentWrongPleaseTry"));
    } finally {
      setBusyId(null);
    }
  };

  // Back from the DNS provider: drop the return parameters, then check DNS
  // (a few times, since new records take a moment to show up).
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!connectReturn || handledReturn.current) return;
    handledReturn.current = true;
    router.replace(pathname, { scroll: false });
    const domain = domains.find(({ id }) => id === connectReturn.domainId);
    if (!domain || domain.verified) return;
    if (!connectReturn.applied) {
      toast.info(t("yourDnsProviderDidntAdd"), {
        description: t("addThemYourselfBelowThen"),
      });
      return;
    }
    const checkAfterSetup = async () => {
      setBusyId(domain.id);
      const toastId = toast.loading(
        t("checkingDnsForHostname", { hostname: domain.hostname }),
      );
      try {
        let message: string | null = null;
        for (const delay of AUTO_VERIFY_DELAYS_MS) {
          if (delay) await wait(delay);
          const result = await verifyCustomDomain({ id: domain.id });
          if (!result.success) {
            toast.error(result.error.message, { id: toastId });
            return;
          }
          if (result.data.verified) {
            toast.success(
              t("hostnameIsVerified", { hostname: domain.hostname }),
              {
                id: toastId,
                description: t("youCanNowPickIt"),
              },
            );
            return;
          }
          message = result.data.message;
        }
        toast.info(t("notVerifiedYet"), {
          id: toastId,
          description: message ?? undefined,
        });
      } catch {
        toast.error(t("somethingWentWrongPleaseTry"), {
          id: toastId,
        });
      } finally {
        setBusyId(null);
        router.refresh();
      }
    };
    checkAfterSetup();
  }, [connectReturn, domains, pathname, router, t]);

  const renderCards = (offers: DomainConnectOffers) => (
    <div className="space-y-3">
      {domains.map((domain) => (
        <DomainCard
          busy={
            busyId === domain.id || (isRemoving && removing?.id === domain.id)
          }
          canManage={canManage}
          domain={domain}
          key={domain.id}
          offer={offers[domain.id] ?? null}
          onRemove={() => setRemoving(domain)}
          onVerify={() => verify(domain)}
        />
      ))}
    </div>
  );

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
      toast.success(t("removedHostname", { hostname: domain.hostname }));
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card className="gap-3 py-4">
          <CardContent className="px-4">
            <form className="space-y-2" onSubmit={add}>
              <Label htmlFor="custom-domain">{t("addADomain")}</Label>
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
                  {isAdding ? t("adding") : t("addDomain")}
                </Button>
              </div>
              {canAdd || limit === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {canAdd
                    ? t("aSubdomainSuchAsGo")
                    : t("addingDomainsNeedsProOr")}
                </p>
              ) : (
                <InlineLimit
                  className="mt-1"
                  fallback={
                    <p className="text-muted-foreground text-xs">
                      {t("youveAddedValueTheMost", {
                        count: limit,
                      })}
                    </p>
                  }
                  meterId="customDomains"
                  used={domains.length}
                />
              )}
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
          {t("teamOwnersAndAdminsAdd")}
        </p>
      )}

      {domains.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>{t("noCustomDomainsYet")}</EmptyTitle>
            <EmptyDescription>{t("addADomainCreateThe")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : connectOffers ? (
        // Until the offers arrive the cards look exactly as without them.
        <Suspense fallback={renderCards(NO_OFFERS)}>
          <WithOffers offers={connectOffers}>{renderCards}</WithOffers>
        </Suspense>
      ) : (
        renderCards(NO_OFFERS)
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isRemoving) setRemoving(null);
        }}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeHostname", { hostname: removing?.hostname ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing && removing.codeCount > 0
                ? t("removeDomainInUse", {
                    count: removing.codeCount,
                    hostname: removing.hostname,
                    defaultHost,
                  })
                : t("removeDomainUnused", {
                    hostname: removing?.hostname ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              disabled={isRemoving}
              onClick={confirmRemove}
              variant="destructive"
            >
              {isRemoving ? t("removing") : t("removeDomain")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
