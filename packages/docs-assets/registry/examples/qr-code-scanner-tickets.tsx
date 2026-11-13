"use client";

import { useState } from "react";
import { QrCodeScanner } from "@/registry/qrdx/qr-code-scanner";

// In a real app, check the code against your backend instead.
const tickets = new Set(["https://qrdx.dev/docs/components/qr-code-scanner"]);

export default function QrCodeScannerTickets() {
  const [valid, setValid] = useState<boolean | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <QrCodeScanner
        label="Check in a ticket"
        onResult={(value) => setValid(tickets.has(value))}
      />
      <p
        aria-live="polite"
        className={
          valid
            ? "text-emerald-700 text-sm dark:text-emerald-400"
            : "text-destructive text-sm"
        }
      >
        {valid === null
          ? null
          : valid
            ? "Valid ticket. Welcome in."
            : "Unknown ticket."}
      </p>
    </div>
  );
}
