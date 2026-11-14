import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AsciiField,
  type AsciiVariant,
  Aurora,
  Backdrop,
  Grain,
  MeshGradient,
  RadialHalo,
} from "@/components/fx";

// Dev-only contact sheet of every backdrop, for screenshots and tuning.
// Not built into production.

export const metadata: Metadata = {
  title: "Backdrops",
  robots: { index: false, follow: false },
};

const VARIANTS: { variant: AsciiVariant; note: string }[] = [
  { variant: "wave", note: "slow sine bands" },
  { variant: "qr", note: "QR modules as glyph density" },
  { variant: "noise", note: "static grain clusters" },
  { variant: "topo", note: "contour lines in characters" },
  { variant: "ramp", note: "density ramp from a corner" },
  { variant: "rain", note: "slow falling columns" },
  { variant: "halo", note: "radial density glow" },
  { variant: "scan", note: "slow scan line" },
];

function Tile({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate flex h-64 flex-col justify-end overflow-hidden rounded-xl border bg-background p-5">
      {children}
      <div className="relative">
        <p className="font-mono text-xs text-muted-foreground">{note}</p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
    </div>
  );
}

export default function FxSheetPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto w-full max-w-[1400px] p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Backdrops</h1>
      <div className="grid grid-cols-4 gap-4">
        {VARIANTS.map(({ variant, note }) => (
          <Tile key={variant} title={`ascii ${variant}`} note={note}>
            <Backdrop>
              <AsciiField
                variant={variant}
                className="[mask-image:none]"
                seed={3}
              />
            </Backdrop>
          </Tile>
        ))}
        <Tile title="MeshGradient" note="cool">
          <MeshGradient />
        </Tile>
        <Tile title="MeshGradient" note="warm">
          <MeshGradient tone="warm" />
        </Tile>
        <Tile title="Aurora" note="brand">
          <Aurora />
        </Tile>
        <Tile title="RadialHalo + Grain" note="violet">
          <RadialHalo tone="violet" width={420} />
          <Grain />
        </Tile>
      </div>
    </main>
  );
}
