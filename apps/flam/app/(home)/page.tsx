"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  type BodyPattern,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  QRCode,
} from "qrdx";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { DownloadOptions } from "./download-options";
import { ErrorLevelSelector } from "./error-level-selector";

type QRStyles = {
  showLogo?: boolean;
  qrLogo?: string;
  qrColor: string;
  backgroundColor: string;
  eyeColor: string;
  dotColor: string;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  errorLevel?: "L" | "M" | "Q" | "H";
  customLogo?: string;
  templateId?: string;
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  fontLetterSpacing?: number;
  fontFamily?: string;
};

const Page = () => {
  const [qrStyles, setQrStyles] = useState<QRStyles>({
    showLogo: false,
    qrColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle-large",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    errorLevel: "L",
    backgroundColor: "#ffffff",
    templateId: "FlamQR",
    customText: "",
    textColor: "#000000",
    fontSize: 40,
    fontWeight: 900,
    fontLetterSpacing: 6,
    fontFamily: "Arial, Helvetica, sans-serif",
  });
  const [url, setUrl] = useState(
    "https://instant.cdn.flamapp.com/card?o=12345"
  );

  const methods = useForm();

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl select-none p-2 md:p-6">
      <div className="rounded-xl border-0 p-3 backdrop-blur-sm md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column - Form Options */}
          <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-0 lg:col-span-3 lg:pr-4">
            <FormProvider {...methods}>
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
                <ErrorLevelSelector
                  onLevelSelect={(level) =>
                    setQrStyles((prev) => ({
                      ...prev,
                      errorLevel: level as QRStyles["errorLevel"],
                    }))
                  }
                  selectedLevel={qrStyles.errorLevel}
                />
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
                    onChange={(value) =>
                      setQrStyles((prev) => ({
                        ...prev,
                        qrColor: value,
                      }))
                    }
                  />
                  <ColorInput
                    color={qrStyles.backgroundColor}
                    label="Background Color"
                    onChange={(value) =>
                      setQrStyles((prev) => ({
                        ...prev,
                        backgroundColor: value,
                      }))
                    }
                  />
                  <ColorInput
                    color={qrStyles.eyeColor || qrStyles.qrColor}
                    label="Eye Color"
                    onChange={(value) =>
                      setQrStyles((prev) => ({
                        ...prev,
                        eyeColor: value,
                      }))
                    }
                  />
                  <ColorInput
                    color={qrStyles.dotColor || qrStyles.qrColor}
                    label="Dot Color"
                    onChange={(value) =>
                      setQrStyles((prev) => ({
                        ...prev,
                        dotColor: value,
                      }))
                    }
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
                    onCheckedChange={(value) =>
                      setQrStyles((prev) => ({
                        ...prev,
                        showLogo: value,
                      }))
                    }
                  />
                </div>
              </div>
            </FormProvider>
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
                customText={qrStyles.customText}
                dotColor={qrStyles.dotColor}
                errorLevel={qrStyles.errorLevel}
                eyeColor={qrStyles.eyeColor}
                fgColor={qrStyles.qrColor}
                fontFamily={qrStyles.fontFamily}
                fontLetterSpacing={qrStyles.fontLetterSpacing}
                fontSize={qrStyles.fontSize}
                fontWeight={qrStyles.fontWeight}
                hideLogo={!qrStyles.showLogo}
                scale={2}
                templateId={qrStyles.templateId}
                textColor={qrStyles.textColor}
                url={url}
              />
              <div className="w-full border-t pt-4">
                <DownloadOptions
                  bgColor={qrStyles.backgroundColor}
                  bodyPattern={qrStyles.bodyPattern}
                  cornerEyeDotPattern={qrStyles.cornerEyeDotPattern}
                  cornerEyePattern={qrStyles.cornerEyePattern}
                  customText={qrStyles.customText}
                  dotColor={qrStyles.dotColor}
                  errorLevel={qrStyles.errorLevel}
                  eyeColor={qrStyles.eyeColor}
                  fgColor={qrStyles.qrColor}
                  fontFamily={qrStyles.fontFamily}
                  fontLetterSpacing={qrStyles.fontLetterSpacing}
                  fontSize={qrStyles.fontSize}
                  fontWeight={qrStyles.fontWeight}
                  showLogo={qrStyles.showLogo ?? false}
                  templateId={qrStyles.templateId}
                  textColor={qrStyles.textColor}
                  url={url}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
