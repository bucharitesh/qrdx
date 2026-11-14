"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { GithubLogo, GoogleLogo } from "@repo/design-system/components/icons";
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
import { Sms } from "iconsax-reactjs";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  EMAIL_CODES_REMAIN,
  linkErrorMessage,
  PROVIDER_LABELS,
  type SignInMethodView,
  type SocialProvider,
} from "@/lib/account/sign-in-methods";
import { linkSignInMethod, unlinkSignInMethod } from "../_lib/actions";
import { SettingsSection } from "./settings-section";

const PROVIDER_ICONS: Record<
  SocialProvider,
  (props: { className?: string }) => ReactNode
> = {
  google: GoogleLogo,
  github: GithubLogo,
};

/** What came back from a "Link" round trip (?linked= or ?error=). */
export type LinkOutcome =
  | { kind: "linked"; provider: SocialProvider }
  | { kind: "error"; code: string };

function MethodIcon({ kind }: { kind: SignInMethodView["kind"] }) {
  const Icon = kind === "email" ? null : PROVIDER_ICONS[kind];
  return (
    <span className="bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full border">
      {Icon ? (
        <Icon className="size-4" />
      ) : (
        <Sms aria-hidden className="size-4" />
      )}
    </span>
  );
}

function MethodRow({
  kind,
  title,
  detail,
  badges,
  action,
}: {
  kind: SignInMethodView["kind"];
  title: string;
  detail: ReactNode;
  badges?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-4 sm:gap-4 sm:px-6">
      <MethodIcon kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {badges}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
          {detail}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

export function SignInMethodsSection({
  methods,
  linkable,
  email,
  outcome,
}: {
  methods: SignInMethodView[];
  linkable: SocialProvider[];
  email: string;
  outcome: LinkOutcome | null;
}) {
  const t = useTranslations("app.settings.account.signInMethodsSection");
  const router = useRouter();
  const pathname = usePathname();
  const { withConfirmation } = useConfirmation();
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [linking, setLinking] = useState<SocialProvider | null>(null);
  const [unlinking, setUnlinking] = useState<SignInMethodView | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setLastUsed(authClient.getLastUsedLoginMethod());
  }, []);

  // Report the link round trip once, then drop it from the address bar.
  useEffect(() => {
    if (!outcome) return;
    if (outcome.kind === "linked") {
      toast.success(
        t("valueIsLinked", { value: PROVIDER_LABELS[outcome.provider] }),
      );
    } else {
      toast.error(linkErrorMessage(outcome.code));
    }
    router.replace(pathname, { scroll: false });
  }, [outcome, pathname, router, t]);

  // Asks "Confirm it's you" first when this session hasn't recently; the
  // server then answers the provider's address to go to.
  const link = async (provider: SocialProvider) => {
    setLinking(provider);
    try {
      const result = await withConfirmation(
        () => linkSignInMethod({ provider }),
        "link-sign-in",
      );
      if (result === null) {
        setLinking(null);
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        setLinking(null);
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      console.error("Linking failed:", error);
      toast.error(
        t("valueCantBeLinkedRight", { value: PROVIDER_LABELS[provider] }),
      );
      setLinking(null);
    }
  };

  const confirmUnlink = async () => {
    if (!unlinking) return;
    setRemoving(true);
    try {
      const result = await withConfirmation(
        () => unlinkSignInMethod({ accountId: unlinking.id }),
        "unlink-sign-in",
      );
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("labelIsNoLongerLinked", { label: unlinking.label }));
      setUnlinking(null);
      router.refresh();
    } finally {
      setRemoving(false);
    }
  };

  const lastUsedBadge = (method: string) =>
    lastUsed === method ? (
      <Badge variant="outline">{t("lastUsed")}</Badge>
    ) : null;

  return (
    <SettingsSection
      description={t("theWaysYouCanGet")}
      id="sign-in"
      title={t("signInMethods")}
    >
      <ul className="divide-y">
        {methods.map((method) =>
          method.kind === "email" ? (
            <MethodRow
              badges={
                <>
                  <Badge variant="secondary">{t("alwaysOn")}</Badge>
                  {lastUsedBadge("email-otp")}
                </>
              }
              detail={`A one-time code sent to ${email}.`}
              key={method.id}
              kind="email"
              title={method.label}
            />
          ) : (
            <MethodRow
              action={
                <Button
                  disabled={Boolean(method.unlinkBlocked)}
                  onClick={() => setUnlinking(method)}
                  size="sm"
                  title={method.unlinkBlocked ?? undefined}
                  variant="outline"
                >
                  {t("unlink")}
                </Button>
              }
              badges={lastUsedBadge(method.kind)}
              detail={
                method.unlinkBlocked
                  ? `Linked ${method.linkedAt}. ${method.unlinkBlocked}`
                  : `Linked ${method.linkedAt}.`
              }
              key={method.id}
              kind={method.kind}
              title={method.label}
            />
          ),
        )}
        {linkable.map((provider) => (
          <MethodRow
            action={
              <Button
                disabled={linking !== null}
                onClick={() => link(provider)}
                size="sm"
                variant="outline"
              >
                {linking === provider && <ModuleOrbit aria-hidden />}
                {t("link")}
              </Button>
            }
            detail={`Not linked. Use the ${PROVIDER_LABELS[provider]} account with ${email}.`}
            key={provider}
            kind={provider}
            title={PROVIDER_LABELS[provider]}
          />
        ))}
      </ul>

      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || removing)) setUnlinking(null);
        }}
        open={unlinking !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("unlinkLabel", { label: unlinking?.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("youWontBeAbleTo", {
                label: unlinking?.label ?? "",
                EMAIL_CODES_REMAIN,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              disabled={removing}
              onClick={confirmUnlink}
              variant="outline"
            >
              {removing && <ModuleOrbit aria-hidden />}
              {t("unlink")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
