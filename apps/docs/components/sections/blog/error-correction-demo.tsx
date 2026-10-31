"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCodeSVG } from "qrdx";
import type { ErrorLevel } from "qrdx/types";
import { useState } from "react";

const LEVELS: { id: ErrorLevel; name: string; recovery: string }[] = [
  { id: "L", name: "Low", recovery: "~7%" },
  { id: "M", name: "Medium", recovery: "~15%" },
  { id: "Q", name: "Quartile", recovery: "~25%" },
  { id: "H", name: "High", recovery: "~30%" },
];

const DEMO_VALUE = "https://qrdx.dev/blog/understanding-qr-codes";

export function ErrorCorrectionDemo() {
  const [level, setLevel] = useState<ErrorLevel>("M");
  const [damaged, setDamaged] = useState(false);
  const current = LEVELS.find((l) => l.id === level) ?? LEVELS[1];

  return (
    <div className="not-prose my-8 flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-6">
      <fieldset className="flex flex-wrap justify-center gap-2">
        <legend className="sr-only">Error correction level</legend>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={level === l.id}
            onClick={() => setLevel(l.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              level === l.id
                ? "bg-secondary-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-secondary-foreground",
            )}
          >
            {l.id} · {l.name}
          </button>
        ))}
      </fieldset>

      <div className="relative rounded-lg bg-white p-5">
        <QRCodeSVG
          value={DEMO_VALUE}
          level={level}
          size={200}
          fgColor="#000000"
          bgColor="#ffffff"
          bodyPattern="square"
          cornerEyePattern="square"
          cornerEyeDotPattern="square"
        />
        {damaged && (
          <div
            aria-hidden="true"
            className="absolute top-[38%] left-[38%] size-[30%] rotate-12 rounded-[40%] bg-neutral-400/90"
          />
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground text-balance">
        Level <strong className="text-foreground">{current.id}</strong> can
        recover {current.recovery} of damaged codewords. Same URL, yet the grid
        generally gets denser at higher levels: the extra modules carry the
        redundancy.
      </p>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={damaged}
          onChange={(e) => setDamaged(e.target.checked)}
          className="size-4 accent-primary"
        />
        Add a smudge, then try scanning each level with your phone
      </label>
    </div>
  );
}
