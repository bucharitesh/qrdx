"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import {
  Camera,
  Import as Download,
  Clock as History,
  GalleryExport as ImageUp,
  Layer as Layers,
  Scan as ScanLine,
  ShieldTick as ShieldCheck,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { CameraView } from "./camera-view";
import type { DetectedCode } from "./detector";
import { EntryList, exportEntries } from "./entry-list";
import {
  addToHistory,
  clearHistory,
  createEntryId,
  type HistoryEntry,
  loadHistory,
  readHistoryPreference,
  removeFromHistory,
  writeHistoryPreference,
} from "./history";
import { ImageScan } from "./image-scan";
import { parseScan } from "./parse";
import { ResultCard } from "./result-card";

const HISTORY_PAGE = 30;

const entryKey = (entry: { format: string; value: string }) =>
  `${entry.format}\u0000${entry.value}`;

export function Scanner() {
  const [tab, setTab] = useState<"camera" | "image">("camera");
  const [cameraOn, setCameraOn] = useState(false);
  const [batch, setBatch] = useState(false);
  const [results, setResults] = useState<HistoryEntry[]>([]);
  const [batchItems, setBatchItems] = useState<HistoryEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [saveHistory, setSaveHistory] = useState(true);
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE);
  const [viewing, setViewing] = useState<HistoryEntry | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const batchRef = useRef(batch);
  const batchKeys = useRef(new Set<string>());
  const saveHistoryRef = useRef(saveHistory);
  batchRef.current = batch;
  saveHistoryRef.current = saveHistory;

  useEffect(() => {
    setSaveHistory(readHistoryPreference());
    loadHistory().then((entries) => {
      setHistory(entries);
      setHistoryLoaded(true);
    });
  }, []);

  const remember = useCallback(async (entries: HistoryEntry[]) => {
    if (!saveHistoryRef.current || entries.length === 0) return;
    const next = await addToHistory(entries);
    if (next) setHistory(next);
  }, []);

  const handleDetect = useCallback(
    (codes: DetectedCode[], source: HistoryEntry["source"]) => {
      const now = Date.now();
      const entries: HistoryEntry[] = codes.map((code) => ({
        id: createEntryId(),
        value: code.rawValue,
        format: code.format,
        kind: parseScan(code.rawValue, code.format).kind,
        scannedAt: now,
        source,
      }));

      if (batchRef.current) {
        const fresh = entries.filter((entry) => {
          const key = entryKey(entry);
          if (batchKeys.current.has(key)) return false;
          batchKeys.current.add(key);
          return true;
        });
        if (fresh.length === 0) return;
        setBatchItems((current) => [...fresh, ...current]);
        remember(fresh);
        return;
      }

      if (source === "camera") setCameraOn(false);
      setResults(entries);
      remember(entries);
      requestAnimationFrame(() => {
        resultsRef.current?.focus({ preventScroll: true });
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    [remember],
  );

  const onCameraDetect = useCallback(
    (codes: DetectedCode[]) => handleDetect(codes, "camera"),
    [handleDetect],
  );
  const onImageDetect = useCallback(
    (codes: DetectedCode[]) => handleDetect(codes, "image"),
    [handleDetect],
  );

  const scanAgain = () => {
    setResults([]);
    if (tab === "camera") setCameraOn(true);
  };

  const toggleBatch = (enabled: boolean) => {
    setBatch(enabled);
    setResults([]);
  };

  const clearBatch = () => {
    batchKeys.current.clear();
    setBatchItems([]);
  };

  const toggleSaveHistory = (enabled: boolean) => {
    setSaveHistory(enabled);
    writeHistoryPreference(enabled);
  };

  const removeEntry = async (entry: HistoryEntry) => {
    const next = await removeFromHistory(entry.id);
    if (next) setHistory(next);
  };

  const clearAll = async () => {
    if (await clearHistory()) {
      setHistory([]);
      setHistoryShown(HISTORY_PAGE);
    }
  };

  return (
    // ph-no-capture keeps scanned content out of analytics autocapture and replays.
    <div className="ph-no-capture mx-auto flex w-full max-w-4xl flex-col gap-8">
      <Tabs
        className="gap-4"
        onValueChange={(value) => {
          setTab(value as "camera" | "image");
          if (value !== "camera") setCameraOn(false);
        }}
        value={tab}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="camera">
              <Camera />
              Camera
            </TabsTrigger>
            <TabsTrigger value="image">
              <ImageUp />
              Image
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              checked={batch}
              id="scan-batch-mode"
              onCheckedChange={toggleBatch}
            />
            <label className="cursor-pointer" htmlFor="scan-batch-mode">
              Batch mode
              <span className="text-muted-foreground hidden sm:inline">
                {" "}
                · keep scanning, export CSV
              </span>
            </label>
          </div>
        </div>

        <TabsContent value="camera">
          <CameraView
            active={cameraOn}
            continuous={batch}
            onActiveChange={setCameraOn}
            onDetect={onCameraDetect}
          />
        </TabsContent>
        <TabsContent value="image">
          <ImageScan onDetect={onImageDetect} />
        </TabsContent>
      </Tabs>

      {batch && (
        <section aria-labelledby="scan-batch" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              className="flex items-center gap-2 text-lg font-medium"
              id="scan-batch"
            >
              <Layers aria-hidden className="size-4" />
              This batch
              <span className="text-muted-foreground text-sm font-normal tabular-nums">
                ({batchItems.length})
              </span>
            </h2>
            <div className="flex gap-2">
              <Button
                disabled={batchItems.length === 0}
                onClick={() => exportEntries(batchItems, "qrdx-batch")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
              <Button
                disabled={batchItems.length === 0}
                onClick={clearBatch}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            </div>
          </div>
          {batchItems.length > 0 ? (
            <EntryList entries={batchItems} onOpen={setViewing} />
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              Keep pointing the camera at codes, or add images. Each new code is
              added once; tap one to see what it does.
            </p>
          )}
        </section>
      )}

      {!batch && results.length > 0 && (
        <section aria-labelledby="scan-results" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              className="flex scroll-mt-28 items-center gap-2 text-lg font-medium outline-none"
              id="scan-results"
              ref={resultsRef}
              tabIndex={-1}
            >
              <ScanLine aria-hidden className="size-4" />
              {results.length === 1
                ? "Scan result"
                : `Found ${results.length} codes`}
            </h2>
            <Button
              onClick={scanAgain}
              size="sm"
              type="button"
              variant="outline"
            >
              {tab === "camera" ? (
                <Camera className="size-3.5" />
              ) : (
                <ImageUp className="size-3.5" />
              )}
              Scan another
            </Button>
          </div>
          <div className="grid gap-4">
            {results.map((entry) => (
              <ResultCard
                format={entry.format}
                key={entry.id}
                value={entry.value}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="scan-history" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="flex items-center gap-2 text-lg font-medium"
            id="scan-history"
          >
            <History aria-hidden className="size-4" />
            History
            {history.length > 0 && (
              <span className="text-muted-foreground text-sm font-normal tabular-nums">
                ({history.length})
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Switch
                checked={saveHistory}
                id="scan-save-history"
                onCheckedChange={toggleSaveHistory}
              />
              <label className="cursor-pointer" htmlFor="scan-save-history">
                Save scans on this device
              </label>
            </div>
            <Button
              disabled={history.length === 0}
              onClick={() => exportEntries(history, "qrdx-scan-history")}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download className="size-3.5" />
              Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={history.length === 0}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="ph-no-capture">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear scan history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all {history.length} saved scans from this
                    device. It can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>
                    Clear history
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {history.length > 0 ? (
          <>
            <EntryList
              entries={history.slice(0, historyShown)}
              onOpen={setViewing}
              onRemove={removeEntry}
            />
            {history.length > historyShown && (
              <Button
                className="self-center"
                onClick={() =>
                  setHistoryShown((count) => count + HISTORY_PAGE * 2)
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Show more
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-dashed p-5">
            <HairlineFigure
              className="aspect-square w-16 shrink-0"
              figure="Loupe"
            />
            <p className="text-muted-foreground text-sm">
              {!historyLoaded
                ? "Loading history…"
                : saveHistory
                  ? "Codes you scan show up here. History is kept only in this browser, on this device."
                  : "History is off. Scans aren't saved anywhere."}
            </p>
          </div>
        )}
      </section>

      <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Camera frames and images are decoded on your device and never uploaded.
        To check a link, only its address is sent to QRdx (and to Google Web
        Risk) and it isn't stored. What you scan is kept out of site analytics.
      </p>

      <Dialog
        onOpenChange={(open) => !open && setViewing(null)}
        open={viewing !== null}
      >
        <DialogContent className="ph-no-capture max-h-[90vh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          <DialogTitle className="sr-only">Scan details</DialogTitle>
          <DialogDescription className="sr-only">
            What the scanned code contains and what you can do with it.
          </DialogDescription>
          {viewing && (
            <ResultCard
              format={viewing.format}
              key={viewing.id}
              value={viewing.value}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
