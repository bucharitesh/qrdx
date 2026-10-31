import { Close } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft2,
  ArrowRight2,
  DocumentUpload,
  Element3,
  ElementPlus,
  ExportSquare,
  Figma,
  Lock,
  RotateRight,
  Shapes,
  Text,
} from "iconsax-reactjs";
import type { ReactNode } from "react";
import { QrdxLogo } from "@/components/qrdx-logo";
import { MockQr, type MockQrModules } from "./mock-qr";

// HTML/CSS mockups of each plugin's real UI (labels, controls and actions
// are taken from plugins/*). Decorative: every window is aria-hidden and the
// figure carries a text caption instead. The code they show encodes
// https://qrdx.dev, the value typed in each mock.

const VALUE = "https://qrdx.dev";

const windowClass =
  "relative overflow-hidden rounded-[12px] border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-24px_rgba(0,0,0,0.25)] dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]";

const floatingClass =
  "rounded-[8px] border bg-card shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]";

function Figure({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("@container w-full min-w-0", className)}>
      <div aria-hidden="true">{children}</div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

function TrafficLights() {
  return (
    <span className="flex shrink-0 gap-1.5">
      <span className="size-2.5 rounded-full bg-foreground/15" />
      <span className="size-2.5 rounded-full bg-foreground/15" />
      <span className="size-2.5 rounded-full bg-foreground/15" />
    </span>
  );
}

/** A small form label, as the plugins print them. */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function Field({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-7 min-w-0 items-center rounded-[6px] border bg-background px-2 font-mono text-[10px] text-foreground/80">
      <span className="truncate">{children}</span>
    </span>
  );
}

function InkButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-full bg-foreground px-2.5 text-[10px] font-medium text-background",
        className,
      )}
    >
      {children}
    </span>
  );
}

function OutlineButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-full border bg-background px-2.5 text-[10px] font-medium text-foreground/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-[6px] border bg-background px-1.5 py-1 text-[10px] text-foreground/80">
      <span
        className="size-3 shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/15"
        style={{ backgroundColor: color }}
      />
      <span className="truncate font-mono">{label}</span>
    </span>
  );
}

/** A code on a white tile (codes are designed for light backgrounds). */
function QrTile({
  modules,
  fg,
  eye,
  className,
}: {
  modules: MockQrModules;
  fg?: string;
  eye?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block rounded-[8px] bg-white p-1.5 ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
    >
      <MockQr modules={modules} fg={fg} eye={eye} className="w-full" />
    </span>
  );
}

/** A selection outline with corner handles, in the brand blue. */
function Selection({ label }: { label?: string }) {
  return (
    <span className="pointer-events-none absolute -inset-1 border border-primary">
      {(
        [
          "-top-1 -left-1",
          "-top-1 -right-1",
          "-bottom-1 -left-1",
          "-bottom-1 -right-1",
        ] as const
      ).map((corner) => (
        <span
          key={corner}
          className={cn(
            "absolute size-2 border border-primary bg-white",
            corner,
          )}
        />
      ))}
      {label && (
        <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-[2px] bg-primary px-1 py-px font-mono text-[9px] whitespace-nowrap text-primary-foreground">
          {label}
        </span>
      )}
    </span>
  );
}

const PRESETS = [
  { label: "Classic", color: "#000000" },
  { label: "Minimal", color: "#404040" },
  { label: "Modern", color: "#3b82f6" },
  { label: "Ocean Blue", color: "#1e40af" },
  { label: "Nature", color: "#166534" },
  { label: "Sunset", color: "#c2410c" },
];

function PresetChips() {
  return (
    <span className="grid grid-cols-2 gap-1 @md:grid-cols-3">
      {PRESETS.map((preset, index) => (
        <span
          key={preset.label}
          className={cn(
            "flex min-w-0 items-center gap-1 rounded-[6px] border bg-background px-1.5 py-1 text-[9px] text-foreground/80",
            index === 0 && "border-foreground/50 bg-accent text-foreground",
            index >= 4 && "hidden @md:flex",
          )}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: preset.color }}
          />
          <span className="truncate">{preset.label}</span>
        </span>
      ))}
    </span>
  );
}

/** The Chrome popup over a tab, opened from the toolbar icon. */
export function ChromeMock() {
  return (
    <Figure caption="Mockup of the QRdx Chrome extension: its popup, opened from the toolbar, shows a QR code for the current tab with style presets, colors, export size and Download PNG, Download SVG and Copy image buttons.">
      <div className={windowClass}>
        <div className="flex h-9 items-end gap-3 border-b bg-muted/50 px-3">
          <span className="mb-3">
            <TrafficLights />
          </span>
          <span className="flex h-7 min-w-0 max-w-52 items-center gap-2 rounded-t-[8px] border border-b-0 bg-background px-3 text-[11px] text-foreground/80">
            <QrdxLogo className="size-3 shrink-0 fill-foreground" />
            <span className="truncate">QRdx: free QR code generator</span>
          </span>
        </div>
        <div className="flex h-10 items-center gap-2.5 border-b px-3 text-muted-foreground">
          <ArrowLeft2 className="size-3.5 shrink-0" />
          <ArrowRight2 className="size-3.5 shrink-0 opacity-50" />
          <RotateRight className="size-3.5 shrink-0" />
          <span className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-muted/60 px-3 font-mono text-[11px]">
            <Lock className="size-3 shrink-0" />
            <span className="truncate">qrdx.dev</span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-accent ring-1 ring-foreground/10">
            <QrdxLogo className="size-3.5 fill-foreground" />
          </span>
        </div>

        <div className="relative h-[18rem] @sm:h-[20.5rem] @md:h-[23rem]">
          {/* The page behind the popup. */}
          <div className="flex flex-col gap-3 p-5 opacity-60">
            <span className="h-3 w-2/5 rounded-full bg-foreground/10" />
            <span className="h-6 w-3/5 rounded-[6px] bg-foreground/10" />
            <span className="h-2 w-1/2 rounded-full bg-foreground/[0.07]" />
            <span className="h-2 w-2/5 rounded-full bg-foreground/[0.07]" />
            <span className="mt-4 h-32 w-1/2 rounded-[12px] bg-foreground/[0.05]" />
          </div>

          <div
            className={cn(
              floatingClass,
              "absolute top-2 right-2 left-2 rounded-[12px] @md:left-auto @md:w-[23rem]",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <span className="flex items-center gap-2 text-xs font-semibold">
                <QrdxLogo className="size-3.5 fill-foreground" />
                QRdx
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                Open in QRdx
                <ExportSquare className="size-3" />
              </span>
            </div>
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 p-3 @md:grid-cols-[8rem_minmax(0,1fr)]">
              <QrTile modules="dots" className="self-start" />
              <div className="flex min-w-0 flex-col gap-2.5">
                <span className="flex flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <Label>Content</Label>
                    <span className="rounded-full border px-1.5 text-[9px] text-muted-foreground">
                      This page
                    </span>
                  </span>
                  <Field>{VALUE}</Field>
                </span>
                <span className="flex flex-col gap-1">
                  <Label>Style</Label>
                  <PresetChips />
                </span>
                <span className="hidden flex-col gap-1 @sm:flex">
                  <Label>Colors</Label>
                  <span className="grid grid-cols-2 gap-1">
                    <Swatch color="#000000" label="#000000" />
                    <Swatch color="#ffffff" label="#FFFFFF" />
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t p-3">
              <InkButton className="flex-1">Download PNG</InkButton>
              <OutlineButton className="flex-1">Download SVG</OutlineButton>
              <OutlineButton className="hidden flex-1 @xs:flex">
                Copy image
              </OutlineButton>
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/** A Figma file with a selected code, the plugin window and the relaunch button. */
export function FigmaMock() {
  return (
    <Figure caption="Mockup of the QRdx Figma plugin: a QR code inserted as vector layers on a menu design is selected, the plugin window offers Replace selected QR and Insert new, and the right panel shows the Edit QR code button.">
      <div className={windowClass}>
        <div className="flex h-10 items-center gap-3 border-b px-3">
          <Figma
            variant="Bold"
            className="size-4 shrink-0 text-foreground/80"
          />
          <span className="hidden gap-1.5 @sm:flex">
            <span className="size-5 rounded-[4px] bg-foreground/[0.07]" />
            <span className="size-5 rounded-[4px] bg-foreground/[0.07]" />
            <span className="size-5 rounded-[4px] bg-foreground/[0.07]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            Spring menu
          </span>
          <InkButton className="h-6 px-3">Share</InkButton>
        </div>

        <div className="flex h-[24rem]">
          <div className="hidden w-40 shrink-0 flex-col gap-0.5 border-r p-2 text-[10px] @lg:flex">
            <span className="px-1.5 pb-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Layers
            </span>
            <span className="truncate px-1.5 py-1 font-medium text-foreground/80">
              # Menu A5
            </span>
            <span className="flex min-w-0 items-center gap-1 truncate rounded-[6px] bg-primary/10 py-1 pr-1.5 pl-4 font-medium text-foreground">
              <QrdxLogo className="size-2.5 shrink-0 fill-foreground" />
              <span className="truncate">QR – {VALUE}</span>
            </span>
            {["Prices", "Dishes", "Title", "Background"].map((layer) => (
              <span
                key={layer}
                className="truncate py-1 pr-1.5 pl-4 text-muted-foreground"
              >
                {layer}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1 overflow-hidden bg-muted/40">
            <span className="absolute top-[7%] left-[7%] text-[9px] text-muted-foreground">
              Menu A5
            </span>
            <div className="absolute top-[12%] left-[7%] flex aspect-[148/210] w-[50%] flex-col gap-[6%] rounded-[2px] bg-white p-[7%] text-black shadow-sm ring-1 ring-black/5 @lg:w-[46%]">
              <span className="text-[clamp(10px,3.4cqi,16px)] font-semibold tracking-tight">
                Spring menu
              </span>
              <span className="flex flex-col gap-1.5">
                {[80, 64, 72, 56, 68].map((width) => (
                  <span
                    key={width}
                    className="h-1 rounded-full bg-black/10"
                    style={{ width: `${width}%` }}
                  />
                ))}
              </span>
              <span className="relative mt-auto mr-auto w-[38%]">
                <MockQr modules="rounded" className="w-full" />
                <Selection label="240 × 240" />
              </span>
            </div>

            <div
              className={cn(
                floatingClass,
                "absolute top-2.5 right-2.5 w-[42%] min-w-40 max-w-56 text-[10px]",
              )}
            >
              <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                <span className="text-[11px] font-medium">QRdx</span>
                <Close className="size-3 text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-2 p-2.5">
                <span className="flex items-center justify-between gap-2 rounded-[6px] bg-muted/60 px-2 py-1">
                  <span className="truncate text-foreground/80">
                    Selected QR code
                  </span>
                  <span className="shrink-0 text-muted-foreground">240 px</span>
                </span>
                <span className="flex flex-col gap-1">
                  <Label>URL or text</Label>
                  <Field>{VALUE}</Field>
                </span>
                <span className="flex flex-col gap-1">
                  <Label>Style</Label>
                  <span className="flex gap-1">
                    {PRESETS.map((preset, index) => (
                      <span
                        key={preset.label}
                        className={cn(
                          "size-4 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                          index === 0 &&
                            "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                        )}
                        style={{ backgroundColor: preset.color }}
                      />
                    ))}
                  </span>
                </span>
                <InkButton>Replace selected QR</InkButton>
                <OutlineButton>Insert new</OutlineButton>
              </div>
            </div>
          </div>

          <div className="hidden w-36 shrink-0 flex-col gap-3 border-l p-2.5 text-[10px] @2xl:flex">
            <span className="font-medium text-foreground/80">Design</span>
            <span className="flex flex-col gap-1">
              <Label>Frame</Label>
              <span className="grid grid-cols-2 gap-1">
                <Field>W 240</Field>
                <Field>H 240</Field>
              </span>
            </span>
            <span className="flex flex-col gap-1.5 border-t pt-3">
              <Label>Plugin</Label>
              <OutlineButton className="justify-start rounded-[6px]">
                <QrdxLogo className="size-2.5 shrink-0 fill-foreground" />
                Edit QR code
              </OutlineButton>
            </span>
          </div>
        </div>
      </div>
    </Figure>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-[4px] border bg-muted/60 px-1 font-sans text-[9px] text-muted-foreground">
      {children}
    </span>
  );
}

/** Raycast's detail view for a generated code, with its action panel. */
export function RaycastMock() {
  const meta: [string, string][] = [
    ["Data", VALUE],
    ["Body", "Rounded"],
    ["Corner eyes", "Rounded"],
    ["Template", "Default"],
    ["Colors", "#0A0A0A on #FFFFFF"],
    ["Size", "1024 px"],
  ];
  return (
    <Figure caption="Mockup of the QRdx Raycast extension: the Generate QR command shows the code with its settings, with Copy PNG to Clipboard as the main action and more under Actions.">
      <div className={cn(windowClass, "rounded-[16px]")}>
        <div className="flex h-12 items-center gap-3 border-b px-4">
          <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-muted">
            <ArrowLeft2 className="size-3.5 text-foreground/80" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">Generate QR</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            QRdx
          </span>
        </div>

        <div className="grid @md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="grid place-items-center p-6">
            <QrTile modules="rounded" className="w-40 p-2 @md:w-48" />
          </div>
          <dl className="flex flex-col divide-y border-t px-4 py-1 text-[11px] @md:border-t-0 @md:border-l">
            {meta.map(([term, value]) => (
              <div key={term} className="flex flex-col gap-0.5 py-2">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="truncate font-mono text-foreground/80">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex h-10 items-center justify-between gap-3 border-t bg-muted/30 px-3 text-[11px]">
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <QrdxLogo className="size-3.5 shrink-0 fill-foreground/70" />
            <span className="truncate">Generate QR</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-foreground/80">
            <span className="hidden items-center gap-1.5 @sm:flex">
              Copy PNG to Clipboard <Kbd>↵</Kbd>
            </span>
            <span className="hidden h-4 w-px bg-border @sm:block" />
            <span className="flex items-center gap-1.5">
              Actions <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </span>
        </div>
      </div>
    </Figure>
  );
}

const RAIL = [
  { icon: Element3, label: "Design" },
  { icon: Shapes, label: "Elements" },
  { icon: Text, label: "Text" },
  { icon: DocumentUpload, label: "Uploads" },
  { icon: ElementPlus, label: "Apps", active: true },
];

/** The Canva editor with the QRdx app open in the side panel. */
export function CanvaMock() {
  return (
    <Figure caption="Mockup of the QRdx Canva app: in the editor's side panel, a URL field, a live preview, template and dot pattern pickers, colors and an Add to Design button, next to a poster with the code placed on it.">
      <div className={windowClass}>
        <div className="flex h-10 items-center gap-3 border-b px-3 text-[11px]">
          <span className="hidden gap-3 text-muted-foreground @sm:flex">
            <span>Home</span>
            <span>File</span>
            <span>Resize</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-center text-muted-foreground">
            Open studio poster
          </span>
          <InkButton className="h-6 px-3">Share</InkButton>
        </div>

        <div className="flex h-[26rem]">
          <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r py-2.5">
            {RAIL.map(({ icon: Icon, label, active }) => (
              <span
                key={label}
                className={cn(
                  "flex w-11 flex-col items-center gap-0.5 rounded-[8px] py-1.5 text-[8px] text-muted-foreground",
                  active && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </span>
            ))}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2.5 overflow-hidden border-r p-3 text-[10px] @lg:w-56 @lg:shrink-0">
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <QrdxLogo className="size-3 fill-foreground" />
              QRdx
            </span>
            <span className="flex flex-col gap-1">
              <Label>URL or Text</Label>
              <Field>{VALUE}</Field>
            </span>
            <span className="grid place-items-center rounded-[8px] border bg-white py-2.5">
              <MockQr modules="dots" className="w-24" />
            </span>
            {(
              [
                ["Templates", ["square", "rounded", "dots", "square"]],
                ["Dot Pattern", ["dots", "rounded", "square", "dots"]],
              ] as const
            ).map(([label, styles]) => (
              <span
                key={label}
                className={cn(
                  "flex flex-col gap-1",
                  // Only one picker row fits the narrow panel.
                  label === "Dot Pattern" && "hidden @lg:flex",
                )}
              >
                <Label>{label}</Label>
                <span className="grid max-w-[13rem] grid-cols-4 gap-1">
                  {styles.map((style, index) => (
                    <span
                      key={`${label}-${style}-${index.toString()}`}
                      className={cn(
                        "rounded-[6px] bg-white p-1 ring-1 ring-black/10 dark:ring-white/10",
                        index === (label === "Templates" ? 0 : 1) &&
                          "ring-2 ring-foreground",
                      )}
                    >
                      <MockQr modules={style} className="w-full" />
                    </span>
                  ))}
                </span>
              </span>
            ))}
            <span className="hidden flex-col gap-1 @lg:flex">
              <Label>Foreground</Label>
              <Swatch color="#000000" label="#000000" />
            </span>
            <InkButton className="mt-auto shrink-0 rounded-[6px]">
              Add to Design
            </InkButton>
          </div>

          <div className="hidden min-w-0 flex-1 place-items-center bg-muted/40 @lg:grid">
            <div className="flex aspect-[3/4] w-[64%] flex-col justify-between bg-white p-[8%] text-black shadow-sm ring-1 ring-black/5">
              <span className="flex flex-col gap-1">
                <span className="text-[8px] font-medium tracking-[0.2em] text-black/60 uppercase">
                  Open studio
                </span>
                <span className="text-[clamp(12px,4cqi,20px)] leading-tight font-semibold tracking-tight">
                  Print &amp; pixels
                </span>
                <span className="text-[8px] text-black/60">
                  Saturday · 10 am to 6 pm
                </span>
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="text-[8px] leading-snug text-black/60">
                  Scan for
                  <br />
                  the schedule
                </span>
                <span className="relative w-[34%]">
                  <MockQr modules="dots" className="w-full" />
                  <Selection />
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}
