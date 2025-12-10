/** biome-ignore-all lint/a11y/noStaticElementInteractions: false positive */
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

// Common gradient directions
const GRADIENT_ANGLES = [
  { label: "→ Left to Right", value: 0 },
  { label: "↗ Bottom Left to Top Right", value: 45 },
  { label: "↑ Bottom to Top", value: 90 },
  { label: "↖ Bottom Right to Top Left", value: 135 },
  { label: "← Right to Left", value: 180 },
  { label: "↙ Top Right to Bottom Left", value: 225 },
  { label: "↓ Top to Bottom", value: 270 },
  { label: "↘ Top Left to Bottom Right", value: 315 },
] as const;

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
    (newAngle: string) => {
      const angleValue = Number.parseInt(newAngle, 10);
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

              {/* Linear Gradient Direction */}
              {mode === "linear" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Direction
                  </Label>
                  <Select
                    value={angle.toString()}
                    onValueChange={handleAngleChange}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADIENT_ANGLES.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value.toString()}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
}
