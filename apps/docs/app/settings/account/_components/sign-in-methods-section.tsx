"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import {
  GithubLogo,
  GoogleLogo,
  Spinner,
} from "@repo/design-system/components/icons";
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
import { type ReactNode, useEffect, useState } from "react";
import {
  linkErrorMessage,
  PROVIDER_LABELS,
  type SignInMethodView,
  type SocialProvider,
} from "@/lib/account/sign-in-methods";
import { unlinkSignInMethod } from "../_lib/actions";
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
  const router = useRouter();
  const pathname = usePathname();
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
      toast.success(`${PROVIDER_LABELS[outcome.provider]} is linked`);
    } else {
      toast.error(linkErrorMessage(outcome.code));
    }
    router.replace(pathname, { scroll: false });
  }, [outcome, pathname, router]);

  const link = async (provider: SocialProvider) => {
    setLinking(provider);
    try {
      const { error } = await authClient.linkSocial({
        provider,
        callbackURL: `/settings/account?linked=${provider}#sign-in`,
        errorCallbackURL: "/settings/account",
      });
      if (error) throw error;
    } catch (error) {
      console.error("Linking failed:", error);
      toast.error(`${PROVIDER_LABELS[provider]} can't be linked right now.`);
      setLinking(null);
    }
  };

  const confirmUnlink = async () => {
    if (!unlinking) return;
    setRemoving(true);
    try {
      const result = await unlinkSignInMethod({ accountId: unlinking.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${unlinking.label} is no longer linked`);
      setUnlinking(null);
      router.refresh();
    } finally {
      setRemoving(false);
    }
  };

  const lastUsedBadge = (method: string) =>
    lastUsed === method ? <Badge variant="outline">Last used</Badge> : null;

  return (
    <SettingsSection
      description="The ways you can get into your account. Link Google or GitHub to sign in with one click."
      id="sign-in"
      title="Sign-in methods"
    >
      <ul className="divide-y">
        {methods.map((method) =>
          method.kind === "email" ? (
            <MethodRow
              badges={
                <>
                  <Badge variant="secondary">Always on</Badge>
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
                  Unlink
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
                {linking === provider && <Spinner className="animate-spin" />}
                Link
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
            <AlertDialogTitle>Unlink {unlinking?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to sign in with {unlinking?.label} until you
              link it again. Your other sign-in methods keep working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <Button
              disabled={removing}
              onClick={confirmUnlink}
              variant="outline"
            >
              {removing && <Spinner className="animate-spin" />}
              Unlink
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
