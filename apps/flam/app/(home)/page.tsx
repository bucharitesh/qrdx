"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { QRCode } from "qrdx";
import { useQRStore } from "@/lib/qr-store";
import { DownloadOptions } from "./download-options";
import { ErrorLevelSelector } from "./error-level-selector";

const Page = () => {
  const { url, qrStyles, setUrl, updateQrStyle } = useQRStore();

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl select-none p-2 md:p-6">
      <div className="rounded-xl border-0 p-3 backdrop-blur-sm md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column - Form Options */}
          <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-0 lg:col-span-3 lg:pr-4">
            {/* Basic Settings Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Basic Settings
              </h2>
              <div>
                <Label className="mb-2 block text-sm" htmlFor="url-input">
                  URL
                </Label>
                <Input
                  id="url-input"
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter URL"
                  type="text"
                  value={url}
                />
              </div>
            </div>

            {/* Error Correction Level Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Error Correction
              </h2>
              <ErrorLevelSelector />
            </div>

            {/* Color Customization Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Color Customization
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ColorInput
                  color={qrStyles.qrColor}
                  label="QR Color"
                  onChange={(value) => updateQrStyle("qrColor", value)}
                />
                <ColorInput
                  color={qrStyles.backgroundColor}
                  label="Background Color"
                  onChange={(value) => updateQrStyle("backgroundColor", value)}
                />
                <ColorInput
                  color={qrStyles.eyeColor || qrStyles.qrColor}
                  label="Eye Color"
                  onChange={(value) => updateQrStyle("eyeColor", value)}
                />
                <ColorInput
                  color={qrStyles.dotColor || qrStyles.qrColor}
                  label="Dot Color"
                  onChange={(value) => updateQrStyle("dotColor", value)}
                />
              </div>
            </div>

            {/* Logo Settings Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Logo Settings
              </h2>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-gray-100">
                <Label
                  className="cursor-pointer font-medium text-sm"
                  htmlFor="show-logo"
                >
                  Show Logo
                </Label>
                <Switch
                  checked={qrStyles.showLogo}
                  id="show-logo"
                  onCheckedChange={(value) => updateQrStyle("showLogo", value)}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Sticky QR Code Preview */}
          <div className="flex w-full justify-center lg:col-span-2 lg:justify-start">
            <div className="sticky top-10 flex h-fit w-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
              <h2 className="text-center font-semibold text-lg">Preview</h2>
              <QRCode
                bgColor={qrStyles.backgroundColor}
                bodyPattern={qrStyles.bodyPattern}
                cornerEyeDotPattern={qrStyles.cornerEyeDotPattern}
                cornerEyePattern={qrStyles.cornerEyePattern}
                dotColor={qrStyles.dotColor}
                eyeColor={qrStyles.eyeColor}
                fgColor={qrStyles.qrColor}
                hideLogo={!qrStyles.showLogo}
                level={qrStyles.level}
                scale={2}
                templateId={qrStyles.templateId}
                url={url}
              />
              <div className="w-full border-t pt-4">
                <DownloadOptions />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
