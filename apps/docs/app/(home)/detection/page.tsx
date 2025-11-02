/** biome-ignore-all lint/suspicious/useAwait: false positive */
"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import {
  CheckCircle2,
  Download,
  Image as ImageIcon,
  QrCode,
  Upload,
  XCircle,
} from "lucide-react";
import { downloadImageWithBoundingBox, handleImageLoad } from "qrdx/detection";
import { useRef, useState } from "react";

type DetectionResult = {
  status: "idle" | "processing" | "success" | "error" | "no-qr";
  data?: string;
  boundingBox?: { x: number; y: number }[];
  error?: string;
};

const DetectionPage = () => {
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [imagePreview, setImagePreview] = useState<string>("");
  const [detectionResult, setDetectionResult] = useState<DetectionResult>({
    status: "idle",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setDetectionResult({
        status: "error",
        error: "Please upload a valid image file",
      });
      return;
    }

    setDetectionResult({ status: "processing" });

    // Create image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);

      // Create image element for detection
      const img = new Image();
      img.onload = async () => {
        setUploadedImage(img);

        // Run QR detection
        try {
          const result = await handleImageLoad(img, 1024, true);

          if (result === "NO_QR") {
            setDetectionResult({
              status: "no-qr",
            });
          } else if (result && typeof result === "object" && result.data) {
            setDetectionResult({
              status: "success",
              data: result.data,
              boundingBox: result.boundingBox,
            });
          } else {
            setDetectionResult({
              status: "error",
              error: "Unable to detect QR code",
            });
          }
        } catch (error) {
          console.error("Detection error:", error);
          setDetectionResult({
            status: "error",
            error: "An error occurred during QR detection",
          });
        }
      };

      img.onerror = () => {
        setDetectionResult({
          status: "error",
          error: "Failed to load image",
        });
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      setDetectionResult({
        status: "error",
        error: "Failed to read file",
      });
    };

    reader.readAsDataURL(file);
  };

  const handleDownloadWithBox = () => {
    if (uploadedImage && detectionResult.boundingBox) {
      downloadImageWithBoundingBox(
        uploadedImage,
        detectionResult.boundingBox,
        "qr_detected.png",
      );
    }
  };

  const handleReset = () => {
    setUploadedImage(null);
    setImagePreview("");
    setDetectionResult({ status: "idle" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl select-none p-2 pt-20 md:p-6 md:pt-24">
      <div className="rounded-xl border-0 bg-black/70 p-3 backdrop-blur-sm md:p-8">
        {/* Page Title */}
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-bold text-2xl text-white md:text-3xl">
            QR Code Detection
          </h1>
          <p className="text-gray-300 text-sm md:text-base">
            Upload an image to detect and decode QR codes
          </p>
        </div>

        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column - Upload Section */}
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-6 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                Upload Image
              </h2>

              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                ref={fileInputRef}
                type="file"
              />

              {imagePreview ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-lg border border-gray-200">
                    <img
                      alt="Uploaded preview"
                      className="h-auto w-full"
                      src={imagePreview}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={triggerFileInput}
                      variant="outline"
                    >
                      <Upload className="h-4 w-4" />
                      Upload New
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleReset}
                      variant="outline"
                    >
                      <XCircle className="h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-gray-300 border-dashed bg-gray-50 p-12 transition-all hover:border-gray-400 hover:bg-gray-100"
                  onClick={triggerFileInput}
                  type="button"
                >
                  <Upload className="mb-4 h-12 w-12 text-gray-400 transition-colors group-hover:text-gray-500" />
                  <p className="mb-2 font-semibold text-gray-700 text-sm">
                    Click to upload an image
                  </p>
                  <p className="text-gray-500 text-xs">
                    PNG, JPG, JPEG, WEBP (Max 10MB)
                  </p>
                </button>
              )}
            </div>

            {/* Instructions */}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-6 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                How It Works
              </h2>
              <ul className="space-y-3 text-gray-700 text-sm">
                <li className="flex items-start gap-3">
                  <ImageIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span>Upload an image containing a QR code</span>
                </li>
                <li className="flex items-start gap-3">
                  <QrCode className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span>
                    Our system will automatically detect and decode the QR code
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Download className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span>
                    Download the image with detected QR code highlighted
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column - Results Section */}
          <div className="space-y-6">
            <div className="sticky top-4 space-y-6">
              {/* Detection Status */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-6 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Detection Results
                </h2>

                {detectionResult.status === "idle" && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <QrCode className="mb-4 h-16 w-16 text-gray-300" />
                    <p className="text-gray-500 text-sm">
                      Upload an image to start detection
                    </p>
                  </div>
                )}

                {detectionResult.status === "processing" && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
                    <p className="font-medium text-gray-700 text-sm">
                      Processing image...
                    </p>
                    <p className="text-gray-500 text-xs">Detecting QR code</p>
                  </div>
                )}

                {detectionResult.status === "success" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                      <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" />
                      <span className="font-medium text-green-800 text-sm">
                        QR Code Detected Successfully!
                      </span>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <Label className="mb-2 block font-semibold text-gray-700 text-sm">
                        Decoded Data:
                      </Label>
                      <div className="overflow-x-auto rounded bg-white p-3">
                        <code className="break-all font-mono text-gray-900 text-xs">
                          {detectionResult.data}
                        </code>
                      </div>
                    </div>

                    {detectionResult.boundingBox && (
                      <Button
                        className="w-full"
                        onClick={handleDownloadWithBox}
                      >
                        <Download className="h-4 w-4" />
                        Download with Bounding Box
                      </Button>
                    )}
                  </div>
                )}

                {detectionResult.status === "no-qr" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                      <XCircle className="h-6 w-6 flex-shrink-0 text-orange-600" />
                      <span className="font-medium text-orange-800 text-sm">
                        No QR Code Found
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm">
                      We couldn't detect a QR code in this image. Try:
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-gray-600 text-sm">
                      <li>Using a clearer image</li>
                      <li>Ensuring the QR code is visible and not obscured</li>
                      <li>Using better lighting or higher resolution</li>
                    </ul>
                  </div>
                )}

                {detectionResult.status === "error" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <XCircle className="h-6 w-6 flex-shrink-0 text-red-600" />
                      <span className="font-medium text-red-800 text-sm">
                        Detection Error
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm">
                      {detectionResult.error ||
                        "An error occurred during detection"}
                    </p>
                  </div>
                )}
              </div>

              {/* Additional Info */}
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white/90 p-6 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-gray-900 text-lg">
                  Supported Formats
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <p className="font-semibold text-gray-900">PNG</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <p className="font-semibold text-gray-900">JPEG</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <p className="font-semibold text-gray-900">JPG</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <p className="font-semibold text-gray-900">WEBP</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetectionPage;
