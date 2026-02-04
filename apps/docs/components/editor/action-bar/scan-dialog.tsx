"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectFromElement,
  getQRAsCanvas,
  initOpenCVWorker,
  getOpenCVStatus,
  type QRDetectionResult,
  type OpenCVStatus,
  type DetectionProgress,
} from "qrdx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { getQRData } from "qrdx";
import { useQREditorStore } from "@/store/editor-store";
import {
  Loader2,
  Check,
  X,
  Copy,
  RefreshCw,
  ScanLine,
  AlertCircle,
} from "lucide-react";
import { cn } from "@repo/design-system/lib/utils";

export function ScanButton() {
  const { value, themeState } = useQREditorStore();
  const [open, setOpen] = useState(false);
  const [kernelSize, setKernelSize] = useState(9);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<QRDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opencvStatus, setOpencvStatus] = useState<OpenCVStatus>({
    ready: false,
    loading: false,
    progress: 0,
    status: "Not initialized",
  });
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [morphologyPreviewUrl, setMorphologyPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<DetectionProgress | null>(null);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const morphologyWorkerRef = useRef<Worker | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const lastLogKeyRef = useRef<string>("");

  const qrProps = useCallback(
    () =>
      ({
        ...getQRData({
          value,
          fgColor: themeState.styles.fgColor,
          bgColor: themeState.styles.bgColor,
          eyeColor: themeState.styles.eyeColor,
          dotColor: themeState.styles.dotColor,
          bodyPattern: themeState.styles.bodyPattern,
          hideLogo: !themeState.styles.showLogo,
          logo: themeState.styles.customLogo,
        }),
        level: themeState.styles.level,
        cornerEyePattern: themeState.styles.cornerEyePattern,
        cornerEyeDotPattern: themeState.styles.cornerEyeDotPattern,
        templateId: themeState.styles.templateId,
      }),
    [value, themeState]
  );

  // When dialog opens, render QR to canvas
  useEffect(() => {
    if (!open || !value?.trim()) return;

    const load = async () => {
      setOpencvStatus({ ...getOpenCVStatus() });
      if (!getOpenCVStatus().ready) {
        const status = await initOpenCVWorker();
        setOpencvStatus(status);
      }

      try {
        const canvas = (await getQRAsCanvas(qrProps(), "image/png", true)) as HTMLCanvasElement;
        if (canvas) {
          canvasRef.current = canvas;
          setOriginalImageUrl(canvas.toDataURL("image/png"));
        }
      } catch (e) {
        setError("Failed to generate QR preview");
      }
    };

    load();
  }, [open, value, qrProps]);

  // Generate morphology preview when kernel size changes
  useEffect(() => {
    if (!canvasRef.current || !opencvStatus.ready || !open) {
      setMorphologyPreviewUrl(null);
      return;
    }

    const generatePreview = async () => {
      setIsGeneratingPreview(true);

      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Create a Web Worker to apply morphology with current kernel
        const workerCode = `
          let cvReady = false;
          
          async function initOpenCV() {
            if (cvReady) return true;
            try {
              importScripts('https://docs.opencv.org/4.9.0/opencv.js');
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('OpenCV timeout')), 30000);
                const checkInterval = setInterval(() => {
                  if (typeof cv !== 'undefined' && cv.Mat) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve();
                  }
                }, 100);
              });
              cvReady = true;
              return true;
            } catch (e) {
              return false;
            }
          }
          
          self.onmessage = async (e) => {
            const { imageData, kernelSize } = e.data;
            
            if (!cvReady) {
              const ready = await initOpenCV();
              if (!ready) {
                self.postMessage({ error: 'OpenCV not available' });
                return;
              }
            }
            
            try {
              const src = cv.matFromImageData(imageData);
              const gray = new cv.Mat();
              cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
              
              const inverted = new cv.Mat();
              cv.bitwise_not(gray, inverted);
              
              const kernel = cv.getStructuringElement(
                cv.MORPH_ELLIPSE,
                new cv.Size(kernelSize, kernelSize)
              );
              
              const closed = new cv.Mat();
              cv.morphologyEx(inverted, closed, cv.MORPH_CLOSE, kernel);
              
              const final = new cv.Mat();
              cv.bitwise_not(closed, final);
              
              const result = new cv.Mat();
              cv.cvtColor(final, result, cv.COLOR_GRAY2RGBA);
              
              const resultData = new ImageData(
                new Uint8ClampedArray(result.data),
                result.cols,
                result.rows
              );
              
              src.delete();
              gray.delete();
              inverted.delete();
              kernel.delete();
              closed.delete();
              final.delete();
              result.delete();
              
              self.postMessage({ imageData: resultData });
            } catch (error) {
              self.postMessage({ error: error.message });
            }
          };
        `;

        const blob = new Blob([workerCode], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        morphologyWorkerRef.current = worker;

        worker.onmessage = (e) => {
          if (e.data.imageData) {
            const resultCanvas = document.createElement("canvas");
            resultCanvas.width = e.data.imageData.width;
            resultCanvas.height = e.data.imageData.height;
            const resultCtx = resultCanvas.getContext("2d");
            if (resultCtx) {
              resultCtx.putImageData(e.data.imageData, 0, 0);
              setMorphologyPreviewUrl(resultCanvas.toDataURL("image/png"));
            }
          }
          setIsGeneratingPreview(false);
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        };

        worker.onerror = () => {
          setIsGeneratingPreview(false);
          setMorphologyPreviewUrl(null);
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        };

        worker.postMessage({ imageData, kernelSize });
      } catch (e) {
        setIsGeneratingPreview(false);
        setMorphologyPreviewUrl(null);
      }
    };

    // Debounce the preview generation
    const timer = setTimeout(generatePreview, 200);
    return () => {
      clearTimeout(timer);
      if (morphologyWorkerRef.current) {
        morphologyWorkerRef.current.terminate();
      }
    };
  }, [kernelSize, opencvStatus.ready, open, originalImageUrl]);

  const processDetection = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError("No QR image available");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setCurrentProgress(null);
    setProcessingLog([]);
    lastLogKeyRef.current = "";

    try {
      const results = await detectFromElement(canvas, {
        kernelSize,
        returnDetailedInfo: true,
        useOpenCV: opencvStatus.ready,
        onProgress: (progress: DetectionProgress) => {
          setCurrentProgress(progress);

          // Append to processing log when strategy or message changes (like sample)
          const logKey = `${progress.strategy}:${progress.message}`;
          if (logKey && logKey !== lastLogKeyRef.current) {
            lastLogKeyRef.current = logKey;
            const line = progress.strategy && progress.message
              ? `${progress.strategy}: ${progress.message}`
              : progress.message || progress.strategy;
            if (line) {
              setProcessingLog((prev) => {
                const next = [...prev, line];
                setTimeout(() => {
                  logContainerRef.current?.scrollTo({
                    top: logContainerRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                }, 10);
                return next;
              });
            }
          }
        },
      });

      if (results.length === 0) {
        setError("QR code not detected. Try adjusting the kernel size.");
        setProcessingLog((prev) => [...prev, "✗ Detection failed - no QR code found"]);
      } else {
        setResult(results[0]);
        setProcessingLog((prev) => [...prev, `✓ Found QR with strategy: ${results[0].strategy}`]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
      setProcessingLog((prev) => [...prev, "✗ Detection failed - no QR code found"]);
    } finally {
      setIsProcessing(false);
    }
  }, [kernelSize, opencvStatus.ready]);

  const copyToClipboard = useCallback(() => {
    if (result?.data) {
      navigator.clipboard.writeText(result.data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result?.data]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setCopied(false);
    setCurrentProgress(null);
    setProcessingLog([]);
  }, []);

  const isMatch = result?.data === value;
  const hasValidContent = value?.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipWrapper label="Detect / verify QR code" asChild>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasValidContent}
            className="gap-0"
          >
            <ScanLine className="h-4 w-4" />
            <span className="hidden text-sm md:block sr-only">Scan</span>
          </Button>
        </DialogTrigger>
      </TooltipWrapper>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            QR Code Detection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!opencvStatus.ready && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-muted-foreground text-sm">
              {opencvStatus.loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {opencvStatus.status} ({Math.round(opencvStatus.progress)}%)
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span>Loading OpenCV for advanced detection...</span>
                </>
              )}
            </div>
          )}

          {/* Side-by-side Original and Morphology Preview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Original QR Code</Label>
              <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-3 aspect-square">
                {originalImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={originalImageUrl}
                    alt="QR Code"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Morphology Preview
                {isGeneratingPreview && (
                  <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />
                )}
              </Label>
              <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-3 aspect-square">
                {morphologyPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={morphologyPreviewUrl}
                    alt="Morphology Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : opencvStatus.ready ? (
                  <span className="text-xs text-muted-foreground text-center px-2">
                    {isGeneratingPreview ? "Generating..." : "Adjust kernel to see preview"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground text-center px-2">
                    Requires OpenCV
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Kernel size</Label>
              <span className="font-mono text-muted-foreground text-sm">
                {kernelSize}×{kernelSize}
              </span>
            </div>
            <Slider
              value={[kernelSize]}
              onValueChange={([v]) => setKernelSize(v ?? 9)}
              min={3}
              max={31}
              step={2}
              disabled={isProcessing}
            />
            <p className="text-muted-foreground text-xs">
              Increase for stylized/dot QRs; decrease for standard QR codes.
            </p>
          </div>

          {/* Processing: current strategy, strategy tags, and log (like sample) */}
          {(isProcessing || processingLog.length > 0) && !result && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Detecting QR code</p>
                    <p className="text-muted-foreground text-xs">Trying multiple strategies...</p>
                  </div>
                </div>
              )}

              {/* Current strategy banner */}
              {isProcessing && currentProgress?.strategy && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <span className="text-sm font-semibold">Current:</span>
                  <span className="font-mono text-sm truncate">
                    {currentProgress.strategy}
                    {currentProgress.message ? ` — ${currentProgress.message}` : ""}
                  </span>
                </div>
              )}

              {/* Strategies progress tags (completed + current; last one highlighted) */}
              {(() => {
                const completed = currentProgress?.completedStrategies ?? [];
                const current = currentProgress?.strategy;
                const tags = current && !completed.includes(current)
                  ? [...completed, current]
                  : [...completed];
                if (tags.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((strategy, i) => (
                      <span
                        key={`${strategy}-${i}`}
                        className={cn(
                          "px-2 py-1 rounded-md text-xs font-mono",
                          i === tags.length - 1
                            ? "bg-primary/30 text-primary border border-primary/50"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {strategy}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Processing log */}
              <div className="rounded-lg border bg-background/80 overflow-hidden">
                <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/50">
                  <span className="text-muted-foreground text-xs font-medium">Processing Log</span>
                  <span className="text-muted-foreground/70 text-xs">{processingLog.length} entries</span>
                </div>
                <div
                  ref={logContainerRef}
                  className="p-3 max-h-48 overflow-y-auto space-y-1"
                >
                  {processingLog.length === 0 ? (
                    <p className="text-muted-foreground text-xs font-mono italic">Starting detection...</p>
                  ) : (
                    processingLog.map((log, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-xs font-mono leading-relaxed",
                          log.startsWith("✓") && "text-green-600 dark:text-green-400 font-semibold",
                          log.startsWith("✗") && "text-destructive font-medium",
                          log.startsWith("Strategy ") || (log.includes(":") && !log.startsWith("✓") && !log.startsWith("✗"))
                            ? "text-foreground/90"
                            : "text-muted-foreground"
                        )}
                      >
                        {log}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {!result && !isProcessing && processingLog.length === 0 && (
            <Button
              className="w-full"
              onClick={processDetection}
              disabled={isProcessing || !originalImageUrl}
            >
              <ScanLine className="mr-2 h-4 w-4" />
              Detect QR code
            </Button>
          )}

          {isProcessing && (
            <Button className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {currentProgress?.strategy || "Processing..."}
            </Button>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <X className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Detection failed</p>
                  <p className="text-destructive/90 text-sm mt-1">{error}</p>
                  <p className="text-muted-foreground text-xs mt-2">
                    Adjust the kernel size and click &quot;Detect QR code&quot; again.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={reset}>
                <RefreshCw className="mr-2 h-3 w-3" />
                Try again
              </Button>
            </div>
          )}

          {result && (
            <div
              className={cn(
                "rounded-lg border p-4",
                isMatch ? "border-green-500/50 bg-green-500/10" : "border-amber-500/50 bg-amber-500/10"
              )}
            >
              <div className="flex items-start gap-3">
                {isMatch ? (
                  <Check className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "font-medium",
                      isMatch ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {isMatch ? "QR code detected" : "QR code detected (data mismatch)"}
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">{result.strategy}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-medium">Detected data</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border bg-background p-3 font-mono text-sm break-all">
                    {result.data}
                  </div>
                  <Button variant="outline" size="icon" onClick={copyToClipboard} title="Copy">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {!isMatch && (
                <div className="mt-4 space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Expected</Label>
                  <div className="rounded-lg border bg-muted/30 p-3 font-mono text-sm break-all text-muted-foreground">
                    {value}
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={reset}>
                <RefreshCw className="mr-2 h-3 w-3" />
                Detect again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
