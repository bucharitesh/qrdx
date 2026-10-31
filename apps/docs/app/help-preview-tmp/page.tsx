"use client";

// TEMPORARY dev-only gallery to review every hint card. Delete before merge.
import { HintCard } from "@/components/help/info-hint";
import { HINTS, type HintId } from "@/lib/help/hints";

export default function HelpPreviewPage() {
  if (process.env.NODE_ENV !== "development") return null;
  const ids = Object.keys(HINTS) as HintId[];
  return (
    <main className="bg-background min-h-screen p-6">
      <div className="flex flex-wrap gap-5">
        {ids.map((id) => (
          <div
            className="bg-popover text-popover-foreground w-[18.5rem] overflow-hidden rounded-md border shadow-md"
            data-preview={id}
            key={id}
          >
            <p className="text-muted-foreground border-b px-3 py-1 font-mono text-[10px]">
              {id}
            </p>
            <HintCard hint={HINTS[id]} />
          </div>
        ))}
      </div>
    </main>
  );
}
