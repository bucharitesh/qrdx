"use client";

import { authClient } from "@repo/auth/client";
import { useRouter } from "next/navigation";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { loadCodeIntoEditor } from "@/components/editor/dynamic-link-toggle";

/** Opens a code in the playground, still bound to its short link. */
export function useOpenInPlayground() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  return (code: QrCodeView) => {
    if (!userId) return;
    loadCodeIntoEditor(code, userId);
    router.push("/playground");
  };
}
