"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignInPanel } from "../components/sign-in-panel";
import { type SocialSignIn, signInErrorMessage } from "./_lib/error-message";

function Heading({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <h1 className={className}>{children}</h1>;
}

function Lead({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <p className={className}>{children}</p>;
}

/**
 * The sign-in panel on a page: centered, with a way back to the site.
 * Google, GitHub and the email code all land on `next` (already checked by
 * lib/safe-redirect on the server).
 */
export function SignInPage({
  next,
  signedOut,
  error = null,
  via = null,
}: {
  next: string;
  signedOut: boolean;
  /** Code from a failed sign-in; its description isn't shown (it's from the URL). */
  error?: string | null;
  /** Google or GitHub; otherwise single sign-on. */
  via?: SocialSignIn | null;
}) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="bg-card w-full max-w-sm overflow-hidden rounded-xl border shadow-sm">
        <SignInPanel
          callbackURL={() => next}
          Description={Lead}
          notice={
            error
              ? signInErrorMessage(error, via)
              : signedOut
                ? "You're signed out."
                : undefined
          }
          redirectTo={next}
          Title={Heading}
        />
      </div>
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center rounded-sm px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href="/"
      >
        Back to QRdx
      </Link>
    </main>
  );
}
