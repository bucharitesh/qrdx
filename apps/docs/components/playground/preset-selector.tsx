"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/design-system/components/ui/tabs";
import { QRCodeSVG } from "qrdx";
import { CheckIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import React from "react";
import { useQREditorStore } from "@/store/editor-store";
import { useQRPresetStore } from "@/store/qr-preset-store";
import type { QRPreset } from "@/types/qr";

export const PresetSelector: React.FC = () => {
  const { style, setStyle, currentPreset, applyPreset } = useQREditorStore();
  const {
    getAllPresets,
    getBuiltInPresets,
    getCustomPresets,
    registerPreset,
    unregisterPreset,
  } = useQRPresetStore();

  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [presetDescription, setPresetDescription] = React.useState("");
  const [mounted, setMounted] = React.useState(false);

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const builtInPresets = getBuiltInPresets();
  const customPresets = getCustomPresets();
  
  // Use 0 during SSR to match server rendering
  const customPresetsCount = mounted ? customPresets.length : 0;

  // Handle preset click
  const handlePresetClick = (preset: QRPreset) => {
    applyPreset(preset);
  };

  // Handle save current style as preset
  const handleSavePreset = () => {
    if (!presetName.trim()) return;

    const newPreset: QRPreset = {
      id: `custom-${Date.now()}`,
      name: presetName,
      description: presetDescription,
      source: "SAVED",
      createdAt: new Date().toISOString(),
      style: {
        ...style,
      },
    };

    registerPreset(newPreset);
    setPresetName("");
    setPresetDescription("");
    setSaveDialogOpen(false);
  };

  // Handle delete custom preset
  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    unregisterPreset(id);
  };

  // Preset Card Component
  const PresetCard = ({
    preset,
    isSelected,
  }: {
    preset: QRPreset;
    isSelected: boolean;
  }) => (
    <div
      className={`group relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-lg ${
        isSelected
          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200 dark:bg-blue-950/20"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900"
      }`}
      onClick={() => handlePresetClick(preset)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePresetClick(preset);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Preview */}
      <div className="mb-3 flex items-center justify-center rounded-md bg-gray-50 p-4 dark:bg-gray-800">
        <QRCodeSVG
          bgColor={preset.style.bgColor || "#ffffff"}
          fgColor={preset.style.fgColor || "#000000"}
          eyeColor={preset.style.eyeColor}
          dotColor={preset.style.dotColor}
          bodyPattern={preset.style.bodyPattern}
          cornerEyePattern={preset.style.cornerEyePattern}
          cornerEyeDotPattern={preset.style.cornerEyeDotPattern}
          level={preset.style.level}
          size={96}
          value="https://example.com"
        />
      </div>

      {/* Name */}
      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
        {preset.name}
      </h3>

      {/* Description */}
      {preset.description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {preset.description}
        </p>
      )}

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
            <CheckIcon className="h-4 w-4 text-white" />
          </div>
        </div>
      )}

      {/* Delete button for custom presets */}
      {preset.source === "SAVED" && (
        <button
          className="absolute top-2 left-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => handleDeletePreset(preset.id, e)}
          title="Delete preset"
          type="button"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 hover:bg-red-600">
            <Trash2Icon className="h-3 w-3 text-white" />
          </div>
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Presets</h2>
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <SaveIcon className="h-4 w-4" />
              Save Current
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save QR Code Preset</DialogTitle>
              <DialogDescription>
                Save your current QR code style as a preset for future use.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="preset-name">Preset Name*</Label>
                <Input
                  id="preset-name"
                  placeholder="My Custom Preset"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preset-description">Description</Label>
                <Input
                  id="preset-description"
                  placeholder="A brief description..."
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSaveDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                >
                  <SaveIcon className="h-4 w-4" />
                  Save Preset
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs for Built-in and Custom */}
      <Tabs defaultValue="built-in" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="built-in">
            Built-in ({builtInPresets.length})
          </TabsTrigger>
          <TabsTrigger value="custom">
            Custom ({customPresetsCount})
          </TabsTrigger>
        </TabsList>

        {/* Built-in Presets */}
        <TabsContent value="built-in" className="mt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {builtInPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isSelected={currentPreset?.id === preset.id}
              />
            ))}
          </div>
        </TabsContent>

        {/* Custom Presets */}
        <TabsContent value="custom" className="mt-4">
          {!mounted ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500" />
            </div>
          ) : customPresets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 dark:border-gray-700">
              <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-800">
                <PlusIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
                No custom presets yet
              </h3>
              <p className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Create your first custom preset by clicking the "Save Current"
                button above
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {customPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isSelected={currentPreset?.id === preset.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

