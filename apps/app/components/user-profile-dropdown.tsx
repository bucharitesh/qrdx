"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import {
  Card,
  Crown1,
  Link2,
  Lock,
  Logout,
  SecuritySafe,
  Setting2,
} from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { markSignOutIntent } from "@/app/(app)/(auth)/sign-out/_lib/intent";
import { hasAdminRole } from "@/components/app-shell/nav-config";
import {
  LocaleLink as Link,
  useLocalizeHref,
  useLocaleRouter as useRouter,
} from "@/components/i18n/locale-link";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { splitLocale } from "@/lib/i18n/paths";
import { playgroundHref } from "@/lib/playground-links";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { useAuthStore } from "@/store/auth-store";

/** Each state fades in as it replaces the last (spinner, sign in, avatar). */
const FADE_IN = "animate-in fade-in-0 duration-200 motion-reduce:animate-none";

/** "Try the Playground", except on the playground itself. */
function PlaygroundLink() {
  const t = useTranslations("nav.userProfileDropdown");
  const localize = useLocalizeHref();
  // /es/playground too: the playground in another language.
  const { path } = splitLocale(usePathname() ?? "/");
  if (path === "/playground" || path.startsWith("/playground/")) {
    return null;
  }
  return (
    <Link className="hidden sm:block" href={localize(playgroundHref())}>
      <Button>{t("tryThePlayground")}</Button>
    </Link>
  );
}

export function UserProfileDropdown({
  plan,
  signedIn = false,
}: {
  /**
   * The person's own plan, when the page knows it (the app shell). Without
   * it the badge can only tell Free from paid, so a paid plan shows none.
   */
  plan?: Plan;
  /** The page only renders for signed-in people (the app shell). */
  signedIn?: boolean;
} = {}) {
  const t = useTranslations("nav.userProfileDropdown");
  const { data: session, isPending } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const router = useRouter();
  const { subscriptionStatus } = useSubscription();
  const isPro = plan
    ? plan !== "free"
    : subscriptionStatus?.isSubscribed === true;
  const badge = plan
    ? PLAN_NAMES[plan]
    : subscriptionStatus && !isPro
      ? PLAN_NAMES.free
      : null;

  // /sign-out does the work (a POST, analytics cleanup, then /sign-in);
  // the mark tells it this came from the menu, so it doesn't ask again.
  const handleSignOut = () => {
    markSignOutIntent();
    router.push("/sign-out");
  };

  // While the session loads, hold the exact space of what usually comes
  // next, so the header doesn't move (CLS): the avatar in the app, the
  // signed-out buttons on the site (what first-time visitors get).
  if (isPending) {
    if (signedIn) {
      return (
        <div
          key="spinner"
          className={cn("flex size-8 items-center justify-center", FADE_IN)}
        >
          <Spinner className="text-muted-foreground size-7 animate-spin" />
        </div>
      );
    }
    return (
      <div
        aria-hidden
        key="auth-placeholder"
        className="invisible flex gap-3.5"
      >
        <PlaygroundLink />
        <Button tabIndex={-1} variant="outline">
          {t("signIn")}
        </Button>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div key="auth-buttons" className={cn("flex gap-3.5", FADE_IN)}>
        <PlaygroundLink />
        <Button variant="outline" onClick={() => openAuthDialog("signin")}>
          {t("signIn")}
        </Button>
      </div>
    );
  }

  return (
    // min-h-9: as tall as the Sign in button it replaces.
    <div
      key="user-dropdown"
      className={cn("flex items-center", !signedIn && "min-h-9", FADE_IN)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="0 relative isolate size-8 rounded-full"
          >
            <Avatar className="size-8 rounded-full">
              <AvatarImage
                src={session.user.image || ""}
                alt={session.user.name || ""}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback
                name={session.user.name || session.user.email || "U"}
              />
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm leading-tight font-medium">
                  {session.user.name}
                </p>
                {badge && (
                  <Badge
                    variant={isPro ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {badge}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs leading-tight">
                {session.user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border opacity-80" />
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <Link2 /> {t("dashboard")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/account">
              <Setting2 /> {t("accountSettings")}
            </Link>
          </DropdownMenuItem>
          {(plan || subscriptionStatus) &&
            (isPro ? (
              <DropdownMenuItem asChild>
                {/* Route handler that redirects to the Polar portal. */}
                <a href="/settings/portal">
                  <Card /> {t("manageBilling")}
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href="/pricing">
                  <Crown1 /> {t("upgradeToPro")}
                </Link>
              </DropdownMenuItem>
            ))}
          {hasAdminRole(session.user.role) && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Lock /> {t("admin")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-border opacity-80" />
          <DropdownMenuItem asChild>
            <Link href="/legal/privacy-policy">
              <SecuritySafe />
              {t("privacyPolicy")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleSignOut}>
            <Logout /> {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
