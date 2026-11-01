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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasAdminRole } from "@/components/app-shell/nav-config";
import { resetAnalytics, track } from "@/lib/analytics";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { useAuthStore } from "@/store/auth-store";

/** Each state fades in as it replaces the last (spinner, sign in, avatar). */
const FADE_IN = "animate-in fade-in-0 duration-200 motion-reduce:animate-none";

/** "Try the Playground", except on the playground itself. */
function PlaygroundLink() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/playground" || pathname.startsWith("/playground/")) {
    return null;
  }
  return (
    <Link className="hidden sm:block" href="/playground">
      <Button>Try the Playground</Button>
    </Link>
  );
}

export function UserProfileDropdown() {
  const { data: session, isPending } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const router = useRouter();
  const { subscriptionStatus } = useSubscription();
  const isPro = subscriptionStatus?.isSubscribed === true;

  const handleLogOut = async () => {
    track("sign_out");
    await authClient.signOut();
    resetAnalytics();
    router.refresh();
  };

  if (isPending) {
    return (
      <div
        key="spinner"
        className={cn("flex size-8 items-center justify-center", FADE_IN)}
      >
        <Spinner className="text-muted-foreground size-7 animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div key="auth-buttons" className={cn("flex gap-3.5", FADE_IN)}>
        <PlaygroundLink />
        <Button variant="outline" onClick={() => openAuthDialog("signin")}>
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div key="user-dropdown" className={cn("flex", FADE_IN)}>
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
                {subscriptionStatus && (
                  <Badge
                    variant={isPro ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {isPro ? "Pro" : "Free"}
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
              <Link2 /> Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/account">
              <Setting2 /> Settings
            </Link>
          </DropdownMenuItem>
          {subscriptionStatus &&
            (isPro ? (
              <DropdownMenuItem asChild>
                {/* Route handler that redirects to the Polar portal. */}
                <a href="/settings/portal">
                  <Card /> Manage billing
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href="/pricing">
                  <Crown1 /> Upgrade to Pro
                </Link>
              </DropdownMenuItem>
            ))}
          {hasAdminRole(session.user.role) && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Lock /> Admin
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-border opacity-80" />
          <DropdownMenuItem asChild>
            <Link href="/legal/privacy-policy">
              <SecuritySafe />
              Privacy Policy
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogOut}>
            <Logout /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
