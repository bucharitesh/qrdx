"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

// The dialog (QR engine, drawer) loads the first time it opens, so it stays
// out of every page's first load.
const GetProDialog = dynamic(
  () => import("./get-pro-dialog").then((m) => m.GetProDialog),
  { ssr: false },
);

export function GetProDialogWrapper() {
  const { isOpen, plan, closeGetProDialog } = useGetProDialogStore();
  // Once opened, keep it mounted so closing still animates.
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);
  if (!hasOpened) return null;

  return (
    <GetProDialog isOpen={isOpen} onClose={closeGetProDialog} plan={plan} />
  );
}
