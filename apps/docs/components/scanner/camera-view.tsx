"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Slider } from "@repo/design-system/components/ui/slider";
import { cn } from "@repo/design-system/lib/utils";
import {
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  LoaderCircle,
  SwitchCamera,
  ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DetectedCode, detectCodes, getDetector } from "./detector";

// Torch and zoom are Image Capture extensions, missing from TypeScript's DOM types.
interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
}
interface CameraSettings extends MediaTrackSettings {
  zoom?: number;
}
type CameraConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
};

const SCAN_INTERVAL_MS = 120;
/** In batch mode the same value is reported again only after this long. */
const REPEAT_COOLDOWN_MS = 3000;

function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera for this site in your browser settings, or scan a picture instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Scan a picture instead.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is busy in another app or tab. Close it and try again.";
  }
  return "The camera couldn't start. Try again, or scan a picture instead.";
}

export function CameraView({
  active,
  continuous,
  onActiveChange,
  onDetect,
}: {
  active: boolean;
  /** Keep scanning after a detection (batch mode). */
  continuous: boolean;
  onActiveChange: (active: boolean) => void;
  onDetect: (codes: DetectedCode[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onDetectRef = useRef(onDetect);
  const continuousRef = useRef(continuous);
  const recentRef = useRef(new Map<string, number>());
  const [status, setStatus] = useState<
    "idle" | "starting" | "running" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [boxes, setBoxes] = useState<DetectedCode[]>([]);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [zoom, setZoom] = useState<{
    min: number;
    max: number;
    step: number;
    value: number;
  } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  onDetectRef.current = onDetect;
  continuousRef.current = continuous;

  const stop = useCallback(() => {
    trackRef.current?.stop();
    trackRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      for (const track of video.srcObject.getTracks()) track.stop();
      video.srcObject = null;
    }
    setBoxes([]);
    setTorch({ supported: false, on: false });
    setZoom(null);
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      setStatus((current) => (current === "error" ? current : "idle"));
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loaded = false;
    let failures = 0;

    const scan = async () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const codes = await detectCodes(video);
          if (cancelled) return;
          loaded = true;
          setReady(true);
          setBoxes(codes);
          if (codes.length > 0) {
            const now = Date.now();
            const fresh = continuousRef.current
              ? codes.filter((code) => {
                  const key = `${code.format}\u0000${code.rawValue}`;
                  const last = recentRef.current.get(key) ?? 0;
                  recentRef.current.set(key, now);
                  return now - last > REPEAT_COOLDOWN_MS;
                })
              : codes;
            if (fresh.length > 0) {
              setFlash(true);
              setTimeout(() => setFlash(false), 250);
              navigator.vibrate?.(40);
              onDetectRef.current(fresh);
              if (!continuousRef.current) return;
            }
          }
        } catch (scanError) {
          console.error("Barcode detection failed:", scanError);
          // The WebAssembly decoder loads on the first frame; give up if it can't.
          if (!loaded && ++failures >= 3) {
            stop();
            setStatus("error");
            setError(
              "The scanner couldn't load. Check your connection and try again.",
            );
            onActiveChange(false);
            return;
          }
        }
      }
      timer = setTimeout(scan, SCAN_INTERVAL_MS);
    };

    const start = async () => {
      setStatus("starting");
      setError(null);
      setReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError(
          window.isSecureContext
            ? "This browser can't use the camera. Scan a picture instead."
            : "The camera only works on a secure (https) page. Scan a picture instead.",
        );
        onActiveChange(false);
        return;
      }
      try {
        // Load the decoder while the camera warms up.
        const detector = getDetector();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        const [track] = stream.getVideoTracks();
        trackRef.current = track ?? null;
        const video = videoRef.current;
        if (!video || !track) throw new Error("No video track");
        video.srcObject = stream;
        await video.play().catch(() => {});

        const capabilities = (track.getCapabilities?.() ??
          {}) as CameraCapabilities;
        const settings = track.getSettings() as CameraSettings;
        setTorch({ supported: capabilities.torch === true, on: false });
        setZoom(
          capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min
            ? {
                ...capabilities.zoom,
                value: settings.zoom ?? capabilities.zoom.min,
              }
            : null,
        );
        navigator.mediaDevices
          .enumerateDevices()
          .then((list) => {
            if (!cancelled)
              setDevices(list.filter((device) => device.kind === "videoinput"));
          })
          .catch(() => {});
        await detector;
        if (cancelled) return;
        setStatus("running");
        scan();
      } catch (startError) {
        if (cancelled) return;
        console.error("Camera start failed:", startError);
        stop();
        setStatus("error");
        setError(
          (startError as Error)?.message?.includes("import") ||
            (startError as Error)?.name === "ChunkLoadError"
            ? "The scanner couldn't load. Check your connection and try again."
            : cameraError(startError),
        );
        onActiveChange(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [active, deviceId, onActiveChange, stop]);

  // Release the camera when the tab is hidden; the person restarts it by hand.
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onActiveChange(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, onActiveChange]);

  const applyConstraint = async (constraint: CameraConstraintSet) => {
    try {
      await trackRef.current?.applyConstraints({ advanced: [constraint] });
      return true;
    } catch {
      return false;
    }
  };

  const toggleTorch = async () => {
    const next = !torch.on;
    if (await applyConstraint({ torch: next })) {
      setTorch((current) => ({ ...current, on: next }));
    }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    const currentId = trackRef.current?.getSettings().deviceId ?? deviceId;
    const index = devices.findIndex((device) => device.deviceId === currentId);
    const next = devices[(index + 1) % devices.length];
    if (next) setDeviceId(next.deviceId);
  };

  const running = status === "running";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-[3/4] max-h-[70vh] w-full overflow-hidden rounded-xl bg-neutral-950 sm:aspect-video">
        <video
          aria-label="Camera preview"
          className={cn(
            "absolute inset-0 size-full object-cover",
            !running && "opacity-0",
          )}
          muted
          onLoadedMetadata={(event) =>
            setFrame({
              width: event.currentTarget.videoWidth,
              height: event.currentTarget.videoHeight,
            })
          }
          playsInline
          ref={videoRef}
        />

        {running && frame.width > 0 && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
            preserveAspectRatio="xMidYMid slice"
            viewBox={`0 0 ${frame.width} ${frame.height}`}
          >
            {boxes.map((box) => (
              <polygon
                className="fill-emerald-400/20 stroke-emerald-400"
                key={`${box.format}-${box.rawValue}`}
                points={box.cornerPoints
                  .map(({ x, y }) => `${x},${y}`)
                  .join(" ")}
                strokeLinejoin="round"
                strokeWidth={Math.max(3, frame.width / 240)}
              />
            ))}
          </svg>
        )}

        {running && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/60 transition-colors sm:inset-x-[30%] sm:inset-y-[12%]",
              flash && "border-emerald-400 bg-emerald-400/10",
            )}
          />
        )}

        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            {status === "starting" ? (
              <>
                <LoaderCircle aria-hidden className="size-8 animate-spin" />
                <p className="text-sm">Starting the camera…</p>
              </>
            ) : (
              <>
                <Camera aria-hidden className="size-10 opacity-80" />
                <p className="max-w-sm text-sm text-white/80">
                  {error ??
                    "Point your camera at a QR code or barcode. Nothing opens until you choose to."}
                </p>
                <Button onClick={() => onActiveChange(true)} type="button">
                  <Camera className="size-4" />
                  {error ? "Try again" : "Start camera"}
                </Button>
              </>
            )}
          </div>
        )}

        {running && !ready && (
          <p className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            Loading the scanner…
          </p>
        )}

        {running && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
            {torch.supported && (
              <Button
                aria-label={
                  torch.on ? "Turn flashlight off" : "Turn flashlight on"
                }
                aria-pressed={torch.on}
                className="bg-black/50 text-white hover:bg-black/70 hover:text-white"
                onClick={toggleTorch}
                size="icon"
                type="button"
                variant="ghost"
              >
                {torch.on ? <FlashlightOff /> : <Flashlight />}
              </Button>
            )}
            {devices.length > 1 && (
              <Button
                aria-label="Switch camera"
                className="bg-black/50 text-white hover:bg-black/70 hover:text-white"
                onClick={switchCamera}
                size="icon"
                type="button"
                variant="ghost"
              >
                <SwitchCamera />
              </Button>
            )}
            <Button
              aria-label="Stop camera"
              className="bg-black/50 text-white hover:bg-black/70 hover:text-white"
              onClick={() => onActiveChange(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CameraOff />
            </Button>
          </div>
        )}
      </div>

      {running && zoom && (
        <div className="mx-auto flex w-full max-w-sm items-center gap-3">
          <ZoomIn
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <Slider
            aria-label="Zoom"
            max={zoom.max}
            min={zoom.min}
            onValueChange={([value]) => {
              if (value === undefined) return;
              setZoom((current) => (current ? { ...current, value } : current));
              applyConstraint({ zoom: value });
            }}
            step={zoom.step || 0.1}
            value={[zoom.value]}
          />
          <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
            {zoom.value.toFixed(1)}×
          </span>
        </div>
      )}
    </div>
  );
}
