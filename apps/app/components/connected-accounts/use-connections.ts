"use client";

import { authClient } from "@repo/auth/client";
import { useEffect, useState } from "react";
import {
  type ConnectedProvider,
  fetchConnections,
} from "@/lib/connected-accounts/client";
import { isIntegrationsMock } from "@/lib/connected-accounts/mock";

let cache: Promise<ConnectedProvider[] | null> | null = null;

/**
 * The signed-in user's short-link and file accounts; null while loading or
 * when signed out. One request per page load, shared by every caller, and
 * none at all for signed-out visitors (the endpoint would only answer 401).
 */
export function useConnections(): ConnectedProvider[] | null {
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user) || isIntegrationsMock();
  const [providers, setProviders] = useState<ConnectedProvider[] | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setProviders(null);
      return;
    }
    let active = true;
    cache ??= fetchConnections().catch(() => null);
    cache.then((result) => {
      if (!result) cache = null; // failed: ask again next time
      if (active) setProviders(result);
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

  return providers;
}
