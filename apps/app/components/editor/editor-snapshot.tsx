"use client";

import { unstable_createAdapterProvider as createAdapterProvider } from "nuqs/adapters/custom";
import { DialogActionsProvider } from "@/lib/hooks/use-dialog-actions";
import type { QRStyle } from "@/types/theme";
import ThemeControlPanel from "../qr-control-panel";
import QRPreviewPanel from "../qr-preview-panel";
import { ActionBar, MobileActionBar } from "./action-bar";

const NO_PARAMS = new URLSearchParams();

/**
 * The query string as a prerendered page has it: none. The snapshot's tab
 * hooks (lib/hooks/use-controls-tab-from-url.ts) go through nuqs, whose
 * Next.js adapter calls useSearchParams(); on a prerendered page that gives
 * up on server-rendering the snapshot. It never runs in the browser, so it
 * never writes the address.
 */
const NoQueryAdapter = createAdapterProvider(() => ({
  searchParams: NO_PARAMS,
  updateUrl: () => undefined,
  getSearchParamsSnapshot: () => NO_PARAMS,
}));

const ignoreChange = () => undefined;

/**
 * The editor as it first looks, for the page's server HTML: the real toolbar,
 * preview and controls with the default state (or a shared theme's look),
 * so crawlers and the first paint get the editor instead of a skeleton.
 * Shown through ServerSnapshot (components/server-snapshot.tsx) until the
 * live editor takes over in components/editor.tsx.
 *
 * One tree for both layouts: on phones the toolbar, the preview, the
 * controls sheet and the bottom bar stack (Editor's mobile layout); from
 * md up the controls are the left panel and the toolbar and preview the
 * right one, at the resizable panels' default 30/70 split.
 */
export function EditorSnapshot({
  styles,
  sampleSrc,
}: {
  styles: QRStyle;
  /** The sample code as an image file (default look only, see QRPreviewPanel). */
  sampleSrc?: string;
}) {
  return (
    <NoQueryAdapter>
      <DialogActionsProvider>
        <div className="relative isolate flex flex-1 flex-col overflow-hidden md:flex-row">
          <div className="flex shrink-0 flex-col md:order-3 md:min-w-0 md:flex-[70_1_0px] md:shrink md:overflow-hidden">
            <div className="md:hidden">
              <ActionBar layout="mobile" />
            </div>
            <div className="hidden md:block">
              <ActionBar />
            </div>
            <div className="relative flex h-[32svh] min-h-52 shrink-0 flex-col overflow-hidden md:h-auto md:min-h-0 md:flex-1 md:shrink">
              <QRPreviewPanel sampleSrc={sampleSrc} still style={styles} />
            </div>
          </div>
          <div
            aria-hidden
            className="bg-border hidden w-px shrink-0 md:order-2 md:block"
          />
          <div className="bg-background relative z-10 -mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[calc(var(--radius)+0.25rem)] border-t shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] md:z-1 md:order-1 md:mt-0 md:min-w-[max(20%,22rem)] md:flex-[30_1_0px] md:rounded-none md:border-t-0 md:shadow-none">
            <div
              aria-hidden
              className="bg-muted-foreground/25 mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full md:hidden"
            />
            <ThemeControlPanel onChange={ignoreChange} styles={styles} />
          </div>
          <div className="shrink-0 md:hidden">
            <MobileActionBar />
          </div>
        </div>
      </DialogActionsProvider>
    </NoQueryAdapter>
  );
}
