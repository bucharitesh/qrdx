"use client";

import { toast } from "@repo/design-system";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CONFIRMATION_MESSAGES,
  type ConfirmationAction,
  needsConfirmation,
  readConfirmReturn,
} from "@/lib/account/confirmation";
import { finishSignInConfirmation } from "./actions";
import {
  type ConfirmationRequest,
  ConfirmIdentityDialog,
} from "./confirm-identity-dialog";

/**
 * Runs a gated server action. When it answers CONFIRMATION_REQUIRED, the
 * "Confirm it's you" dialog opens; after a confirmation the action runs once
 * more and its result is returned. Null when the person cancelled.
 */
export type WithConfirmation = <T>(
  run: () => Promise<T>,
  action: ConfirmationAction,
) => Promise<T | null>;

const ConfirmationContext = createContext<WithConfirmation | null>(null);

/** Holds the one "Confirm it's you" dialog for the components inside it. */
export function ConfirmIdentityProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  // Two gated actions at once share one dialog.
  const pending = useRef<Promise<boolean> | null>(null);

  // Back from signing in again with Google, GitHub or SSO (?confirm=…): the
  // server checks it was this person, signing in just now. The page reloaded
  // on the way, so the change itself is made again. The address loses the
  // keys through the router (a plain history call is undone by it), which
  // also refreshes the page's data (the old session is gone).
  const router = useRouter();
  const returnHandled = useRef(false);
  useEffect(() => {
    if (returnHandled.current) return;
    const returned = readConfirmReturn(window.location.href);
    if (!returned) return;
    returnHandled.current = true;
    finishSignInConfirmation({
      failed: returned.failed,
      error: returned.error,
    })
      .then((result) => {
        if (result.ok) toast.success(CONFIRMATION_MESSAGES.signInConfirmed);
        else toast.error(result.error);
      })
      .catch(() => toast.error(CONFIRMATION_MESSAGES.failed))
      .finally(() => router.replace(returned.cleanPath, { scroll: false }));
  }, [router]);

  const ask = useCallback((action: ConfirmationAction) => {
    if (pending.current) return pending.current;
    const asked = new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
    pending.current = asked;
    setRequest({ action });
    return asked;
  }, []);

  const onDone = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    pending.current = null;
    setRequest(null);
  }, []);

  const withConfirmation = useCallback<WithConfirmation>(
    async (run, action) => {
      const first = await run();
      if (!needsConfirmation(first)) return first;
      if (!(await ask(action))) return null;
      const second = await run();
      if (needsConfirmation(second)) {
        toast.error(CONFIRMATION_MESSAGES.stillRequired);
        return null;
      }
      return second;
    },
    [ask],
  );

  return (
    <ConfirmationContext.Provider value={withConfirmation}>
      {children}
      <ConfirmIdentityDialog onDone={onDone} request={request} />
    </ConfirmationContext.Provider>
  );
}

/** `withConfirmation(run, action)`: see WithConfirmation. */
export function useConfirmation(): { withConfirmation: WithConfirmation } {
  const withConfirmation = useContext(ConfirmationContext);
  if (!withConfirmation) {
    throw new Error(
      "useConfirmation() needs a <ConfirmIdentityProvider> around the component",
    );
  }
  return { withConfirmation };
}
