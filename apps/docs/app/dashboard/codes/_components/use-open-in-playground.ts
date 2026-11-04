"use client";

import { authClient } from "@repo/auth/client";
import { useRouter } from "next/navigation";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { loadCodeIntoEditor } from "@/components/editor/dynamic-link-toggle";
import { playgroundHref } from "@/lib/playground-links";

/** Opens a code in the playground, still bound to its short link. */
export function useOpenInPlayground() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  return (code: QrCodeView) => {
    if (!userId) return;
    loadCodeIntoEditor(code, userId);
    // The code's content and link binding go through the store
    // (loadCodeIntoEditor); the link carries none of it.
    router.push(playgroundHref());
  };
}
