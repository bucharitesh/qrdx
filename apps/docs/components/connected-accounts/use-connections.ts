"use client";

import { useEffect, useState } from "react";
import {
  type ConnectedProvider,
  fetchConnections,
} from "@/lib/connected-accounts/client";

let cache: Promise<ConnectedProvider[] | null> | null = null;

/**
 * The signed-in user's short-link and file accounts; null while loading or
 * when signed out. One request per page load, shared by every caller.
 */
export function useConnections(): ConnectedProvider[] | null {
  const [providers, setProviders] = useState<ConnectedProvider[] | null>(null);

  useEffect(() => {
    let active = true;
    cache ??= fetchConnections().catch(() => null);
    cache.then((result) => {
      if (!result) cache = null; // signed out: ask again after sign-in
      if (active) setProviders(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return providers;
}
