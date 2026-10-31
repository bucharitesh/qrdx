"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowSwapHorizontal, Book1 } from "iconsax-reactjs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";

interface CompareMigrateButtonProps {
  href: string;
  label: string;
  /** Docs guide (libraries) instead of the import flow */
  docs?: boolean;
  variant?: "default" | "outline";
}

const RETURN_PARAM = "migrate";

function MigrateButton({
  href,
  label,
  docs,
  variant = "outline",
}: CompareMigrateButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);

  // Back from sign-in (the auth dialog returns to this URL): open the import.
  useEffect(() => {
    if (!docs && session && searchParams.get(RETURN_PARAM) === "1") {
      router.replace(href);
    }
  }, [docs, session, searchParams, router, href]);

  const icon = docs ? (
    <Book1 aria-hidden />
  ) : (
    <ArrowSwapHorizontal aria-hidden />
  );
  if (docs || session) {
    return (
      <Button asChild variant={variant}>
        <Link href={href}>
          {icon}
          {label}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      onClick={() => {
        // Sign in first; the dialog's callback URL carries ?migrate=1 back here.
        router.replace(`${pathname}?${RETURN_PARAM}=1`, { scroll: false });
        openAuthDialog("signin");
      }}
      variant={variant}
    >
      {icon}
      {label}
    </Button>
  );
}

/** "Move from <competitor>": the import flow (sign-in first) or a docs guide. */
export function CompareMigrateButton(props: CompareMigrateButtonProps) {
  return (
    <Suspense
      fallback={
        <Button asChild variant={props.variant ?? "outline"}>
          <Link href={props.href}>{props.label}</Link>
        </Button>
      }
    >
      <MigrateButton {...props} />
    </Suspense>
  );
}
