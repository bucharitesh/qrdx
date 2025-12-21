/** biome-ignore-all lint/a11y/noStaticElementInteractions: false positive */
/** biome-ignore-all lint/a11y/useAriaPropsSupportedByRole: false positive */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: false positive */
"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import type { ColorConfig, GradientStop } from "qrdx/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

interface GradientPickerProps {
  value: ColorConfig | undefined;
  onChange: (value: ColorConfig) => void;
  label: string;
  fallbackColor?: string;
}

type ColorMode = "solid" | "linear" | "radial";

// Star SVG Icon Component with Gradient Fill
const StarIconWithGradient = ({
  gradientId,
  suggestion,
}: {
  gradientId: string;
  suggestion: GradientSuggestion;
}) => {
  const angle = suggestion.type === "linear" ? (suggestion.angle ?? 0) : 0;
  // Convert angle to SVG coordinates (SVG uses 0deg = top, CSS uses 0deg = right)
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 0.5 - 0.5 * Math.cos(rad);
  const y1 = 0.5 - 0.5 * Math.sin(rad);
  const x2 = 0.5 + 0.5 * Math.cos(rad);
  const y2 = 0.5 + 0.5 * Math.sin(rad);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 72 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Star icon</title>
      <defs>
        {suggestion.type === "linear" ? (
          <linearGradient
            id={gradientId}
            x1={`${x1 * 100}%`}
            y1={`${y1 * 100}%`}
            x2={`${x2 * 100}%`}
            y2={`${y2 * 100}%`}
          >
            {suggestion.stops.map((stop) => (
              <stop
                key={`${stop.offset}-${stop.color}`}
                offset={`${stop.offset}%`}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        ) : (
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            {suggestion.stops.map((stop) => (
              <stop
                key={`${stop.offset}-${stop.color}`}
                offset={`${stop.offset}%`}
                stopColor={stop.color}
              />
            ))}
          </radialGradient>
        )}
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M0.331543 52.6697C-1.04926 57.8231 2.00897 63.1201 7.16235 64.5009L17.3317 67.2258C18.9697 67.6646 20.4632 68.5269 21.6623 69.726L29.1069 77.1706C32.8794 80.9431 38.9958 80.9431 42.7684 77.1706L50.213 69.726C51.412 68.5269 52.9056 67.6646 54.5435 67.2258L64.713 64.5009C69.8663 63.1201 72.9246 57.823 71.5437 52.6697L68.8188 42.5003C68.3799 40.8623 68.3799 39.1377 68.8188 37.4998L71.5437 27.3304C72.9246 22.177 69.8663 16.8799 64.713 15.4991L54.5435 12.7743C52.9056 12.3354 51.412 11.4731 50.213 10.274L42.7684 2.82944C38.9958 -0.943146 32.8794 -0.943146 29.1069 2.82944L21.6623 10.274C20.4632 11.4731 18.9697 12.3354 17.3317 12.7743L7.16235 15.4991C2.00897 16.88 -1.04926 22.177 0.331543 27.3303L3.05646 37.4998C3.4953 39.1377 3.4953 40.8623 3.05646 42.5002L0.331543 52.6697Z"
        stroke="#0f0f0f"
        strokeWidth="0.5"
      />
    </svg>
  );
};

type GradientSuggestion =
  | { type: "linear"; stops: GradientStop[]; angle?: number; name?: string }
  | { type: "radial"; stops: GradientStop[]; name?: string };

// 20 Solid Color Suggestions
const SOLID_COLOR_SUGGESTIONS: string[] = [
  "#000000", // Black
  "#FFFFFF", // White
  "#FF0000", // Red
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FFFF00", // Yellow
  "#FF00FF", // Magenta
  "#00FFFF", // Cyan
  "#FF6B6B", // Coral Red
  "#4ECDC4", // Turquoise
  "#45B7D1", // Sky Blue
  "#FFA07A", // Light Salmon
  "#98D8C8", // Mint Green
  "#F7DC6F", // Light Yellow
  "#BB8FCE", // Lavender
  "#85C1E2", // Light Blue
  "#F8B739", // Golden Yellow
  "#E74C3C", // Bright Red
  "#2ECC71", // Emerald Green
  "#9B59B6", // Purple
];

// 20 Gradient Suggestions (mix of linear and radial) - Themed presets
const GRADIENT_SUGGESTIONS: GradientSuggestion[] = [
  // Christmas Theme
  {
    type: "linear",
    stops: [
      { color: "#DC2626", offset: 0 }, // Red
      { color: "#16A34A", offset: 100 }, // Green
    ],
    angle: 45,
    name: "Christmas",
  },
  {
    type: "linear",
    stops: [
      { color: "#16A34A", offset: 0 }, // Green
      { color: "#DC2626", offset: 100 }, // Red
    ],
    angle: 90,
    name: "Christmas",
  },
  {
    type: "radial",
    stops: [
      { color: "#DC2626", offset: 0 }, // Red
      { color: "#16A34A", offset: 100 }, // Green
    ],
    name: "Christmas",
  },
  // New Years Theme
  {
    type: "linear",
    stops: [
      { color: "#F59E0B", offset: 0 }, // Gold
      { color: "#E5E7EB", offset: 100 }, // Silver
    ],
    angle: 135,
    name: "New Years",
  },
  {
    type: "linear",
    stops: [
      { color: "#1E40AF", offset: 0 }, // Midnight Blue
      { color: "#000000", offset: 100 }, // Black
    ],
    angle: 270,
    name: "New Years",
  },
  {
    type: "radial",
    stops: [
      { color: "#F59E0B", offset: 0 }, // Gold
      { color: "#000000", offset: 100 }, // Black
    ],
    name: "New Years",
  },
  // Diwali Theme (Festival of Lights)
  {
    type: "linear",
    stops: [
      { color: "#F59E0B", offset: 0 }, // Gold
      { color: "#EA580C", offset: 100 }, // Orange
    ],
    angle: 45,
    name: "Diwali",
  },
  {
    type: "linear",
    stops: [
      { color: "#FCD34D", offset: 0 }, // Bright Yellow
      { color: "#F59E0B", offset: 100 }, // Gold
    ],
    angle: 90,
    name: "Diwali",
  },
  {
    type: "radial",
    stops: [
      { color: "#FCD34D", offset: 0 }, // Bright Yellow
      { color: "#EA580C", offset: 100 }, // Orange
    ],
    name: "Diwali",
  },
  // Phataka (Fireworks) Theme
  {
    type: "linear",
    stops: [
      { color: "#DC2626", offset: 0 }, // Red
      { color: "#1E40AF", offset: 100 }, // Blue
    ],
    angle: 45,
    name: "Phataka",
  },
  {
    type: "linear",
    stops: [
      { color: "#16A34A", offset: 0 }, // Green
      { color: "#FCD34D", offset: 100 }, // Yellow
    ],
    angle: 135,
    name: "Phataka",
  },
  {
    type: "linear",
    stops: [
      { color: "#DC2626", offset: 0 }, // Red
      { color: "#FCD34D", offset: 100 }, // Yellow
    ],
    angle: 0,
    name: "Phataka",
  },
  {
    type: "radial",
    stops: [
      { color: "#DC2626", offset: 0 }, // Red
      { color: "#1E40AF", offset: 100 }, // Blue
    ],
    name: "Phataka",
  },
  // Spiderman Theme
  {
    type: "linear",
    stops: [
      { color: "#E31E24", offset: 0 }, // Spiderman Red
      { color: "#0D47A1", offset: 100 }, // Spiderman Blue
    ],
    angle: 45,
    name: "Spiderman",
  },
  {
    type: "linear",
    stops: [
      { color: "#DC143C", offset: 0 }, // Crimson Red
      { color: "#1E3A8A", offset: 100 }, // Deep Blue
    ],
    angle: 90,
    name: "Spiderman",
  },
  {
    type: "radial",
    stops: [
      { color: "#E31E24", offset: 0 }, // Spiderman Red
      { color: "#0D47A1", offset: 100 }, // Spiderman Blue
    ],
    name: "Spiderman",
  },
  // Other Good Themes
  // Sunset
  {
    type: "linear",
    stops: [
      { color: "#F97316", offset: 0 }, // Orange
      { color: "#FCD34D", offset: 100 }, // Yellow
    ],
    angle: 90,
    name: "Sunset",
  },
  // Ocean
  {
    type: "linear",
    stops: [
      { color: "#0EA5E9", offset: 0 }, // Sky Blue
      { color: "#0369A1", offset: 100 }, // Deep Blue
    ],
    angle: 180,
    name: "Ocean",
  },
  // Forest
  {
    type: "linear",
    stops: [
      { color: "#22C55E", offset: 0 }, // Green
      { color: "#15803D", offset: 100 }, // Dark Green
    ],
    angle: 135,
    name: "Forest",
  },
  // Purple Dream
  {
    type: "radial",
    stops: [
      { color: "#A855F7", offset: 0 }, // Purple
      { color: "#7C3AED", offset: 100 }, // Deep Purple
    ],
    name: "Purple Dream",
  },
];

export function GradientPicker({
  value,
  onChange,
  label,
  fallbackColor = "#000000",
}: GradientPickerProps) {
  // Parse current value
  const getCurrentMode = (): ColorMode => {
    if (!value || typeof value === "string") {
      return "solid";
    }
    return value.type;
  };

  const getCurrentStops = (): GradientStop[] => {
    let stops: GradientStop[] = [];

    if (!value || typeof value === "string") {
      stops = [
        { color: fallbackColor, offset: 0 },
        { color: fallbackColor, offset: 100 },
      ];
    } else if (value.type === "solid") {
      stops = [
        { color: value.color, offset: 0 },
        { color: value.color, offset: 100 },
      ];
    } else if (value.type === "linear" || value.type === "radial") {
      // Handle both old format (startColor/endColor) and new format (stops)
      if ("stops" in value && Array.isArray(value.stops)) {
        stops = value.stops;
      } else if (
        "startColor" in value &&
        "endColor" in value &&
        typeof (value as Record<string, unknown>).startColor === "string" &&
        typeof (value as Record<string, unknown>).endColor === "string"
      ) {
        // Backward compatibility: convert old format to new
        const oldValue = value as Record<string, string>;
        stops = [
          { color: oldValue.startColor, offset: 0 },
          { color: oldValue.endColor, offset: 100 },
        ];
      } else {
        stops = [
          { color: fallbackColor, offset: 0 },
          { color: fallbackColor, offset: 100 },
        ];
      }
    } else {
      stops = [
        { color: fallbackColor, offset: 0 },
        { color: fallbackColor, offset: 100 },
      ];
    }

    // Always normalize to exactly 2 stops
    if (stops.length > 2) {
      // Take first and last stop
      const sorted = [...stops].sort((a, b) => a.offset - b.offset);
      return [
        { color: sorted[0].color, offset: 0 },
        { color: sorted[sorted.length - 1].color, offset: 100 },
      ];
    }

    // Ensure we have exactly 2 stops
    if (stops.length < 2) {
      const firstColor = stops[0]?.color || fallbackColor;
      return [
        { color: firstColor, offset: 0 },
        { color: firstColor, offset: 100 },
      ];
    }

    return stops;
  };

  const getCurrentSolidColor = (): string => {
    if (!value || typeof value === "string") {
      return typeof value === "string" ? value : fallbackColor;
    }
    if (value.type === "solid") {
      return value.color;
    }
    return fallbackColor;
  };

  const [mode, setMode] = useState<ColorMode>(getCurrentMode());
  const [solidColor, setSolidColor] = useState(getCurrentSolidColor());
  const [stops, setStops] = useState<GradientStop[]>(getCurrentStops());
  const [angle, setAngle] = useState(
    value && typeof value !== "string" && value.type === "linear"
      ? (value.angle ?? 0)
      : 0,
  );
  const [draggingStopIndex, setDraggingStopIndex] = useState<number | null>(
    null,
  );
  const previewRef = useRef<HTMLDivElement>(null);

  // Track previous value to detect external changes (e.g., theme changes)
  const prevValueRef = useRef(value);

  // TODO: Properly handle external changes to value prop
  // Update internal state when value prop changes externally
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    setMode(getCurrentMode());
    setSolidColor(getCurrentSolidColor());
    setStops(getCurrentStops());
    setAngle(
      value && typeof value !== "string" && value.type === "linear"
        ? (value.angle ?? 0)
        : 0,
    );
  }

  const handleModeChange = useCallback(
    (newMode: ColorMode) => {
      setMode(newMode);

      if (newMode === "solid") {
        onChange({ type: "solid", color: solidColor });
      } else if (newMode === "linear") {
        // Always use exactly 2 stops
        const validStops =
          Array.isArray(stops) && stops.length >= 2
            ? stops.slice(0, 2)
            : [
                { color: solidColor, offset: 0 },
                { color: solidColor, offset: 100 },
              ];
        setStops(validStops);
        onChange({
          type: "linear",
          stops: validStops,
          angle,
        });
      } else if (newMode === "radial") {
        // Always use exactly 2 stops
        const validStops =
          Array.isArray(stops) && stops.length >= 2
            ? stops.slice(0, 2)
            : [
                { color: solidColor, offset: 0 },
                { color: solidColor, offset: 100 },
              ];
        setStops(validStops);
        onChange({
          type: "radial",
          stops: validStops,
        });
      }
    },
    [solidColor, stops, angle, onChange],
  );

  const handleSolidColorChange = useCallback(
    (color: string) => {
      setSolidColor(color);
      onChange({ type: "solid", color });
    },
    [onChange],
  );

  const handleStopColorChange = useCallback(
    (index: number, color: string) => {
      if (!Array.isArray(stops) || !stops[index] || index >= 2) return;

      const newStops = [...stops.slice(0, 2)];
      newStops[index] = { ...newStops[index], color };
      setStops(newStops);

      if (mode === "linear") {
        onChange({
          type: "linear",
          stops: newStops,
          angle,
        });
      } else if (mode === "radial") {
        onChange({
          type: "radial",
          stops: newStops,
        });
      }
    },
    [mode, stops, angle, onChange],
  );

  const handleStopOffsetChange = useCallback(
    (index: number, offset: number) => {
      if (!Array.isArray(stops) || !stops[index] || index >= 2) return;

      // Clamp offset to valid range
      const clampedOffset = Math.max(0, Math.min(100, offset));

      const newStops = [...stops.slice(0, 2)];
      newStops[index] = { ...newStops[index], offset: clampedOffset };

      // If stops cross each other, swap them
      if (newStops[0].offset > newStops[1].offset) {
        // Swap the stops
        const temp = newStops[0];
        newStops[0] = newStops[1];
        newStops[1] = temp;

        // If we're currently dragging, update the dragging index to match the swapped position
        if (draggingStopIndex !== null) {
          setDraggingStopIndex(index === 0 ? 1 : 0);
        }
      }

      setStops(newStops);

      if (mode === "linear") {
        onChange({
          type: "linear",
          stops: newStops,
          angle,
        });
      } else if (mode === "radial") {
        onChange({
          type: "radial",
          stops: newStops,
        });
      }
    },
    [mode, stops, angle, onChange, draggingStopIndex],
  );

  const handleAngleChange = useCallback(
    (newAngle: number | number[]) => {
      const angleValue = Array.isArray(newAngle) ? newAngle[0] : newAngle;
      setAngle(angleValue);
      onChange({
        type: "linear",
        stops,
        angle: angleValue,
      });
    },
    [stops, onChange],
  );

  const calculateOffsetFromEvent = useCallback((clientX: number): number => {
    if (!previewRef.current) return 0;
    const rect = previewRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }, []);

  const handlePreviewMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingStopIndex(index);
    },
    [],
  );

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // Don't handle clicks if we just finished dragging
      if (draggingStopIndex !== null) return;
      if (!previewRef.current) return;

      // Check if click was on a stop handle
      const target = e.target as HTMLElement;
      if (target.closest("[data-stop-handle]")) return;

      const offset = calculateOffsetFromEvent(e.clientX);
      const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);

      // Find which stop is closer to the click position
      const distances = sortedStops.map((stop) => ({
        originalIndex: stops.indexOf(stop),
        distance: Math.abs(stop.offset - offset),
      }));
      distances.sort((a, b) => a.distance - b.distance);

      // Move the closest stop to the click position
      if (distances[0]) {
        handleStopOffsetChange(distances[0].originalIndex, offset);
      }
    },
    [
      draggingStopIndex,
      stops,
      calculateOffsetFromEvent,
      handleStopOffsetChange,
    ],
  );

  const handlePreviewMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingStopIndex === null || !previewRef.current) return;

      const offset = calculateOffsetFromEvent(e.clientX);
      handleStopOffsetChange(draggingStopIndex, offset);
    },
    [draggingStopIndex, calculateOffsetFromEvent, handleStopOffsetChange],
  );

  const handlePreviewMouseUp = useCallback(() => {
    setDraggingStopIndex(null);
  }, []);

  // Set up global mouse event listeners for dragging
  useEffect(() => {
    if (draggingStopIndex !== null) {
      window.addEventListener("mousemove", handlePreviewMouseMove);
      window.addEventListener("mouseup", handlePreviewMouseUp);
      return () => {
        window.removeEventListener("mousemove", handlePreviewMouseMove);
        window.removeEventListener("mouseup", handlePreviewMouseUp);
      };
    }
  }, [draggingStopIndex, handlePreviewMouseMove, handlePreviewMouseUp]);

  // Generate gradient preview
  const getGradientPreview = (): string => {
    if (mode === "solid") {
      return solidColor;
    }

    // Ensure stops is always an array
    const stopsArray = Array.isArray(stops) ? stops : [];
    if (stopsArray.length === 0) {
      return solidColor;
    }

    const sortedStops = [...stopsArray].sort((a, b) => a.offset - b.offset);
    const colorStops = sortedStops
      .map((stop) => `${stop.color} ${stop.offset}%`)
      .join(", ");

    if (mode === "linear") {
      return `linear-gradient(${angle}deg, ${colorStops})`;
    }
    if (mode === "radial") {
      return `radial-gradient(circle, ${colorStops})`;
    }
    return solidColor;
  };

  // Get display text for trigger
  const getTriggerText = (): string => {
    if (mode === "solid") {
      return solidColor.toUpperCase();
    }
    if (mode === "linear") {
      return "Linear";
    }
    if (mode === "radial") {
      return "Radial";
    }
    return solidColor.toUpperCase();
  };

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (suggestion: GradientSuggestion) => {
      if (suggestion.type === "linear") {
        setMode("linear");
        setStops(suggestion.stops);
        setAngle(suggestion.angle ?? 0);
        onChange({
          type: "linear",
          stops: suggestion.stops,
          angle: suggestion.angle ?? 0,
        });
      } else if (suggestion.type === "radial") {
        setMode("radial");
        setStops(suggestion.stops);
        onChange({
          type: "radial",
          stops: suggestion.stops,
        });
      }
    },
    [onChange],
  );

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <div className="flex w-full items-center gap-2 ">
            <div
              className="h-8 w-8 shrink-0 rounded"
              style={{ background: getGradientPreview() }}
            />
            <div className="flex w-full items-center bg-input/25 flex-1 text-left border-border/20 h-8 rounded border px-2  text-sm hover:bg-input/40">
              {getTriggerText()}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-4">
          <Tabs
            defaultValue={mode === "solid" ? "solid" : "gradient"}
            onValueChange={(value) => {
              if (value === "solid") {
                handleModeChange("solid");
              } else if (value === "gradient" && mode === "solid") {
                handleModeChange("linear");
              }
            }}
            value={mode === "solid" ? "solid" : "gradient"}
          >
            <TabsList className="inline-flex w-fit items-center justify-center">
              <TabsTrigger
                className="flex p-2 items-center gap-2"
                value="solid"
              >
                <div className="h-3 w-3 rounded-full bg-current" />
              </TabsTrigger>
              <TabsTrigger
                className="flex p-2 items-center gap-2"
                value="gradient"
              >
                <div className="h-3 w-3 rounded bg-linear-to-r from-current/40 to-current" />
              </TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-4" value="solid">
              {/* Color Picker */}
              <HexColorPicker
                color={solidColor}
                onChange={handleSolidColorChange}
                style={{ width: "100%" }}
              />

              {/* Color Input */}
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border/40"
                  style={{ backgroundColor: solidColor }}
                />
                <Input
                  className="h-8 flex-1 font-mono text-sm"
                  maxLength={7}
                  onChange={(e) => handleSolidColorChange(e.target.value)}
                  placeholder="#000000"
                  value={solidColor}
                />
              </div>

              {/* Solid Color Suggestions */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Suggestions
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SOLID_COLOR_SUGGESTIONS.map((color) => (
                    <div
                      key={color}
                      onClick={() => handleSolidColorChange(color)}
                      className="group relative h-6 w-6 rounded overflow-hidden bg-transparent flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                      aria-label={`Apply color ${color}`}
                    >
                      <div className="h-6 w-6">
                        <svg
                          width="100%"
                          height="100%"
                          viewBox="0 0 72 80"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <title>Star icon</title>
                          <path
                            fill={color}
                            d="M0.331543 52.6697C-1.04926 57.8231 2.00897 63.1201 7.16235 64.5009L17.3317 67.2258C18.9697 67.6646 20.4632 68.5269 21.6623 69.726L29.1069 77.1706C32.8794 80.9431 38.9958 80.9431 42.7684 77.1706L50.213 69.726C51.412 68.5269 52.9056 67.6646 54.5435 67.2258L64.713 64.5009C69.8663 63.1201 72.9246 57.823 71.5437 52.6697L68.8188 42.5003C68.3799 40.8623 68.3799 39.1377 68.8188 37.4998L71.5437 27.3304C72.9246 22.177 69.8663 16.8799 64.713 15.4991L54.5435 12.7743C52.9056 12.3354 51.412 11.4731 50.213 10.274L42.7684 2.82944C38.9958 -0.943146 32.8794 -0.943146 29.1069 2.82944L21.6623 10.274C20.4632 11.4731 18.9697 12.3354 17.3317 12.7743L7.16235 15.4991C2.00897 16.88 -1.04926 22.177 0.331543 27.3303L3.05646 37.4998C3.4953 39.1377 3.4953 40.8623 3.05646 42.5002L0.331543 52.6697Z"
                            stroke="#0f0f0f"
                            strokeWidth="0.5"
                          />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-4 space-y-4" value="gradient">
              {/* Gradient Type Selector */}
              <div className="space-y-2">
                <Select
                  value={mode === "solid" ? "linear" : mode}
                  onValueChange={(value) => {
                    handleModeChange(value as ColorMode);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="radial">Radial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gradient Preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Preview</Label>
                <div className="relative">
                  <div
                    ref={previewRef}
                    className="relative h-12 w-full rounded ring-1 ring-border/40 cursor-pointer bg-transparent p-0"
                    style={{ background: getGradientPreview() }}
                    onClick={(e) =>
                      handlePreviewClick(e as React.MouseEvent<HTMLElement>)
                    }
                  />
                  {Array.isArray(stops) &&
                    stops
                      .slice(0, 2)
                      .sort((a, b) => a.offset - b.offset)
                      .map((stop) => {
                        const originalIndex = stops.indexOf(stop);
                        return (
                          <button
                            key={`preview-stop-${originalIndex}`}
                            type="button"
                            data-stop-handle
                            className="absolute top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10 rounded-full border-2 border-white shadow-md transition-transform hover:scale-110 bg-transparent p-0"
                            style={{
                              left: `${stop.offset}%`,
                              backgroundColor: stop.color,
                              cursor:
                                draggingStopIndex === originalIndex
                                  ? "grabbing"
                                  : "grab",
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handlePreviewMouseDown(e, originalIndex);
                            }}
                            aria-label={`Gradient stop ${originalIndex + 1} at ${Math.round(stop.offset)}%`}
                          />
                        );
                      })}
                </div>
              </div>

              {/* Gradient Stops List */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Stops</Label>
                <div className="space-y-2">
                  {Array.isArray(stops) &&
                    stops.slice(0, 2).map((stop, index) => (
                      <div
                        key={`stop-${index}-${stop.offset}`}
                        className="flex items-center gap-2"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border/40"
                                style={{
                                  backgroundColor: stop.color,
                                }}
                                type="button"
                              />
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-3">
                              <HexColorPicker
                                color={stop.color}
                                onChange={(color) =>
                                  handleStopColorChange(index, color)
                                }
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            className="h-8 flex-1 font-mono text-sm"
                            maxLength={7}
                            onChange={(e) =>
                              handleStopColorChange(index, e.target.value)
                            }
                            placeholder="#000000"
                            value={stop.color}
                          />
                          <Input
                            className="h-8 w-20 text-center text-sm"
                            max="100"
                            min="0"
                            step="0.5"
                            onChange={(e) => {
                              const val = Number.parseFloat(e.target.value);
                              if (!Number.isNaN(val)) {
                                const rounded = Math.round(val * 100) / 100;
                                handleStopOffsetChange(index, rounded);
                              }
                            }}
                            onBlur={(e) => {
                              const val = Number.parseFloat(e.target.value);
                              if (!Number.isNaN(val)) {
                                const rounded = Math.round(val * 100) / 100;
                                handleStopOffsetChange(index, rounded);
                              }
                            }}
                            placeholder="0.00"
                            type="number"
                            value={stop.offset}
                          />
                          <span className="text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Linear Gradient Rotation */}
              {mode === "linear" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Rotation
                    </Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {angle}°
                    </span>
                  </div>
                  <Slider
                    value={[angle]}
                    onValueChange={(values) => handleAngleChange(values)}
                    min={0}
                    max={360}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}

              {/* Gradient Suggestions */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Suggestions
                </Label>
                <div className="flex flex-wrap gap-2">
                  {GRADIENT_SUGGESTIONS.map((suggestion, index) => {
                    const suggestionKey = `${suggestion.type}-${suggestion.stops[0]?.color}-${suggestion.stops[1]?.color}-${suggestion.type === "linear" ? (suggestion.angle ?? 0) : ""}`;
                    const gradientId = `gradient-${suggestionKey}`;
                    return (
                      <div
                        key={suggestionKey}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="group relative h-6 w-6 rounded overflow-hidden bg-transparent flex items-center justify-center"
                        aria-label={`Apply gradient suggestion ${index + 1}`}
                      >
                        <div className="h-6 w-6">
                          <StarIconWithGradient
                            gradientId={gradientId}
                            suggestion={suggestion}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
}
