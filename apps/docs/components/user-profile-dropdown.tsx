"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { BookLock, Loader2, LogOut, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { authClient } from "@/lib/auth-client";
import { useAuthStore } from "@/store/auth-store";

export function UserProfileDropdown() {
  const { data: session, isPending } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const router = useRouter();
  const posthog = usePostHog();

  const handleLogOut = async () => {
    posthog.reset();
    await authClient.signOut();
    router.refresh();
  };

  return (
    <AnimatePresence mode="wait">
      {isPending ? (
        <motion.div
          key="spinner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex size-8 items-center justify-center"
        >
          <Loader2 className="text-muted-foreground size-7 animate-spin" />
        </motion.div>
      ) : !session?.user ? (
        <motion.div
          key="auth-buttons"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex gap-3.5"
        >
          <Link href="/playground">
            <Button>Try the Playground</Button>
          </Link>
          <Button variant="outline" onClick={() => openAuthDialog("signin")}>
            Sign In
          </Button>
        </motion.div>
      ) : (
        <motion.div
          key="user-dropdown"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="0 relative isolate size-8 rounded-full"
              >
                <Avatar className="size-8">
                  <AvatarImage
                    src={session.user.image || ""}
                    alt={session.user.name || ""}
                  />
                  <AvatarFallback>
                    {session.user.name?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm leading-tight font-medium">
                    {session.user.name}{" "}
                  </p>
                  <p className="text-muted-foreground text-xs leading-tight">
                    {session.user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border opacity-80" />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border opacity-80" />
              <DropdownMenuItem asChild>
                <Link href="/legal/privacy-policy">
                  <BookLock />
                  Privacy Policy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogOut}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
