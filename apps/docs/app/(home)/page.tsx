"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { getContrastLevel, getContrastRatio, QRCode } from "qrdx";
import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { CornerEyeDotPatternSelector } from "./corner-eye-dot-pattern-selector";
import { CornerEyePatternSelector } from "./corner-eye-pattern-selector";
import { DownloadOptions } from "./download-options";
import { ErrorLevelSelector } from "./error-level-selector";
import { PatternSelector } from "./pattern-selector";
import { TemplateSelector } from "./template-selector";

type QRStyles = {
  showLogo?: boolean;
  qrLogo?: string;
  qrColor: string;
  backgroundColor: string;
  eyeColor: string;
  dotColor: string;
  dotPattern?:
    | "circle"
    | "square"
    | "diamond"
    | "circle-mixed"
    | "packman"
    | "rounded"
    | "clean-square";
  cornerEyePattern?:
    | "square"
    | "rounded"
    | "rounded-inward"
    | "rounded-inward-flipped"
    | "gear"
    | "semi-round"
    | "rounded-extra"
    | "rounded-square"
    | "circle";
  cornerEyeDotPattern?:
    | "square"
    | "rounded-square"
    | "circle"
    | "rounded-inward"
    | "rounded-inward-flipped"
    | "semi-round"
    | "leaf"
    | "diamond"
    | "diamond-rounded";
  errorLevel?: "L" | "M" | "Q" | "H";
  customLogo?: string;
  templateId?: string;
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  fontLetterSpacing?: number;
};

const Page = () => {
  const [qrStyles, setQrStyles] = useState<QRStyles>({
    showLogo: false,
    qrColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    dotPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    errorLevel: "L",
    backgroundColor: "#ffffff",
    templateId: "default",
    customText: "",
    textColor: "#000000",
    fontSize: 16,
    fontWeight: 700,
    fontLetterSpacing: 0,
  });
  const [url, setUrl] = useState("https://instant.cdn.flamapp.com/card?o=1234");

  const methods = useForm();

  // Calculate contrast ratio and level
  const contrastInfo = useMemo(() => {
    const ratio = getContrastRatio(qrStyles.qrColor, qrStyles.backgroundColor);
    const level = getContrastLevel(ratio);
    return {
      ratio: ratio.toFixed(2),
      ...level,
    };
  }, [qrStyles.qrColor, qrStyles.backgroundColor]);

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl select-none p-2 md:p-6">
      <div className="rounded-xl border-0 p-3 backdrop-blur-sm md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column - Form Options */}
          <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-0 lg:col-span-3 lg:pr-4">
            <FormProvider {...methods}>
              {/* Basic Settings Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Basic Settings
                </h2>
                <div>
                  <Label
                    className="mb-2 block text-gray-700 text-sm"
                    htmlFor="url-input"
                  >
                    URL
                  </Label>
                  <Input
                    className="text-gray-900 placeholder:text-gray-400"
                    id="url-input"
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enter URL"
                    type="text"
                    value={url}
                  />
                </div>
              </div>

              {/* Pattern Selection Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Dot Patterns
                </h2>
                <PatternSelector
                  backgroundColor={"transparent"}
                  onPatternSelect={(pattern) =>
                    setQrStyles((prev) => ({
                      ...prev,
                      dotPattern: pattern as QRStyles["dotPattern"],
                    }))
                  }
                  qrColor={qrStyles.qrColor}
                  selectedPattern={qrStyles.dotPattern}
                />
              </div>

              {/* Corner Eye Pattern Selection Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Corner Eye Patterns
                </h2>
                <CornerEyePatternSelector
                  backgroundColor={"transparent"}
                  onPatternSelect={(pattern) =>
                    setQrStyles((prev) => ({
                      ...prev,
                      cornerEyePattern: pattern as QRStyles["cornerEyePattern"],
                    }))
                  }
                  qrColor={qrStyles.qrColor}
                  selectedPattern={qrStyles.cornerEyePattern}
                />
              </div>

              {/* Corner Eye Dot Pattern Selection Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Internal Eye Patterns
                </h2>
                <CornerEyeDotPatternSelector
                  backgroundColor={"transparent"}
                  onPatternSelect={(pattern) =>
                    setQrStyles((prev) => ({
                      ...prev,
                      cornerEyeDotPattern: pattern as QRStyles["cornerEyeDotPattern"],
                    }))
                  }
                  qrColor={qrStyles.qrColor}
                  selectedPattern={qrStyles.cornerEyeDotPattern}
                />
              </div>

              {/* Error Correction Level Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
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

              {/* Template Selection Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Frames
                </h2>
                <TemplateSelector
                  onTemplateSelect={(templateId) =>
                    setQrStyles((prev) => ({
                      ...prev,
                      templateId,
                    }))
                  }
                  selectedTemplateId={qrStyles.templateId}
                />
                {qrStyles.templateId === "FlamQR" && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <Label
                        className="mb-2 block text-gray-700 text-sm"
                        htmlFor="custom-text-input"
                      >
                        Custom Text (Optional)
                      </Label>
                      <Input
                        className="text-gray-900 placeholder:text-gray-400"
                        id="custom-text-input"
                        maxLength={20}
                        onChange={(e) =>
                          setQrStyles((prev) => ({
                            ...prev,
                            customText: e.target.value,
                          }))
                        }
                        placeholder="Enter custom text (e.g., Scan Me)"
                        type="text"
                        value={qrStyles.customText}
                      />
                      <p className="mt-1 text-gray-500 text-xs">
                        Leave empty for default "Flam It" text (max 20
                        characters)
                      </p>
                    </div>

                    <div>
                      <Label
                        className="mb-2 block text-gray-700 text-sm"
                        htmlFor="text-color-input"
                      >
                        Text Color
                      </Label>
                      <ColorInput
                        color={qrStyles.textColor || "#000000"}
                        onChange={(value) =>
                          setQrStyles((prev) => ({
                            ...prev,
                            textColor: value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label
                        className="mb-2 block text-gray-700 text-sm"
                        htmlFor="font-size-input"
                      >
                        Font Size
                      </Label>
                      <Input
                        className="text-gray-900 placeholder:text-gray-400"
                        id="font-size-input"
                        min={8}
                        max={48}
                        onChange={(e) =>
                          setQrStyles((prev) => ({
                            ...prev,
                            fontSize: Number(e.target.value),
                          }))
                        }
                        type="number"
                        value={qrStyles.fontSize}
                      />
                    </div>

                    <div>
                      <Label
                        className="mb-2 block text-gray-700 text-sm"
                        htmlFor="font-weight-input"
                      >
                        Font Weight
                      </Label>
                      <Input
                        className="text-gray-900 placeholder:text-gray-400"
                        id="font-weight-input"
                        min={100}
                        max={900}
                        step={100}
                        onChange={(e) =>
                          setQrStyles((prev) => ({
                            ...prev,
                            fontWeight: Number(e.target.value),
                          }))
                        }
                        type="number"
                        value={qrStyles.fontWeight}
                      />
                    </div>

                    <div>
                      <Label
                        className="mb-2 block text-gray-700 text-sm"
                        htmlFor="letter-spacing-input"
                      >
                        Letter Spacing
                      </Label>
                      <Input
                        className="text-gray-900 placeholder:text-gray-400"
                        id="letter-spacing-input"
                        min={-5}
                        max={20}
                        step={0.5}
                        onChange={(e) =>
                          setQrStyles((prev) => ({
                            ...prev,
                            fontLetterSpacing: Number(e.target.value),
                          }))
                        }
                        type="number"
                        value={qrStyles.fontLetterSpacing}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Color Customization Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
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

                {/* Contrast Feedback within Color Section */}
                <div
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                    contrastInfo.warning
                      ? "border border-orange-200 bg-orange-50"
                      : "border border-green-200 bg-green-50"
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      contrastInfo.warning ? "bg-orange-100" : "bg-green-100"
                    }`}
                  >
                    {contrastInfo.warning ? (
                      <span className="font-bold text-orange-600 text-sm">
                        !
                      </span>
                    ) : (
                      <span className="font-bold text-green-600 text-sm">
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-medium text-sm ${
                      contrastInfo.warning
                        ? "text-orange-800"
                        : "text-green-800"
                    }`}
                  >
                    {contrastInfo.warning
                      ? "Hard to scan. Use more contrast colors."
                      : "Great! Your QR code is easy to scan."}
                  </span>
                </div>
              </div>

              {/* Logo Settings Section */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Logo Settings
                </h2>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100">
                  <Label
                    className="cursor-pointer font-medium text-gray-700 text-sm"
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
            <div className="sticky top-4 flex h-fit w-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
              <h2 className="text-center font-semibold text-gray-900 text-lg">
                Preview
              </h2>
              <QRCode
                bgColor={qrStyles.backgroundColor}
                cornerEyeDotPattern={qrStyles.cornerEyeDotPattern}
                cornerEyePattern={qrStyles.cornerEyePattern}
                customText={qrStyles.customText}
                dotColor={qrStyles.dotColor}
                dotPattern={qrStyles.dotPattern}
                errorLevel={qrStyles.errorLevel}
                eyeColor={qrStyles.eyeColor}
                fgColor={qrStyles.qrColor}
                hideLogo={!qrStyles.showLogo}
                scale={2}
                templateId={qrStyles.templateId}
                textColor={qrStyles.textColor}
                fontSize={qrStyles.fontSize}
                fontWeight={qrStyles.fontWeight}
                fontLetterSpacing={qrStyles.fontLetterSpacing}
                url={url}
              />
              <div className="w-full border-gray-200 border-t pt-4">
                <DownloadOptions
                  bgColor={qrStyles.backgroundColor}
                  cornerEyeDotPattern={qrStyles.cornerEyeDotPattern}
                  cornerEyePattern={qrStyles.cornerEyePattern}
                  customText={qrStyles.customText}
                  dotColor={qrStyles.dotColor}
                  dotPattern={qrStyles.dotPattern}
                  errorLevel={qrStyles.errorLevel}
                  eyeColor={qrStyles.eyeColor}
                  fgColor={qrStyles.qrColor}
                  showLogo={qrStyles.showLogo ?? false}
                  templateId={qrStyles.templateId}
                  textColor={qrStyles.textColor}
                  fontSize={qrStyles.fontSize}
                  fontWeight={qrStyles.fontWeight}
                  fontLetterSpacing={qrStyles.fontLetterSpacing}
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
