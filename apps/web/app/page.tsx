"use client";

import React, { useState, useMemo } from "react";
import { QRCode } from "@repo/qr/qr-code";
import { ColorInput } from "@/components/color-picker";
import { FormProvider, useForm } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getContrastRatio, getContrastLevel } from "@repo/qr/utils";
import { TemplateSelector } from "./template-selector";
import { DownloadOptions } from "./download-options";

interface QRStyles {
    showLogo?: boolean;
    qrLogo?: string;
    qrColor: string;
    backgroundColor: string;
    eyeColor: string;
    dotColor: string;
    customLogo?: string;
    templateId?: string;
}

const Page = () => {
    const [qrStyles, setQrStyles] = useState<QRStyles>({
        showLogo: false,
        qrColor: "#000000",
        eyeColor: "#000000",
        dotColor: "#000000",
        backgroundColor: "#ffffff",
        templateId: "default",
    });
    const [url, setUrl] = useState("https://www.google.com");

    const methods = useForm();

    // Calculate contrast ratio and level
    const contrastInfo = useMemo(() => {
        const ratio = getContrastRatio(qrStyles.qrColor, qrStyles.backgroundColor);
        const level = getContrastLevel(ratio);
        return {
            ratio: ratio.toFixed(2),
            ...level
        };
    }, [qrStyles.qrColor, qrStyles.backgroundColor]);

    return (
        <div className="h-screen w-screen flex items-center justify-center">
            <div className="h-full w-full max-h-[80vh] max-w-[80vw] grid grid-cols-5 place-items-center bg-white border-2 p-8 rounded-xl ">
                <div className="h-full w-max flex items-center justify-center col-span-2">
                    <QRCode
                        hideLogo={!qrStyles.showLogo}
                        scale={2}
                        fgColor={qrStyles.qrColor}
                        bgColor={qrStyles.backgroundColor}
                        eyeColor={qrStyles.eyeColor}
                        dotColor={qrStyles.dotColor}
                        url={url}
                        templateId={qrStyles.templateId}
                    />
                </div>
                <div className="h-full w-full flex flex-col p-4 gap-8 col-span-3 overflow-y-auto">
                    <FormProvider {...methods}>
                        <p className="text-black text-xl font-semibold">
                            QR Customizations
                        </p>
                        <div>
                            <Input 
                                type="text"
                                placeholder="Enter URL"
                                value={url}
                                onChange={(e) =>
                                    setUrl(e.target.value)
                                }
                            />
                        </div>
                        
                        <TemplateSelector
                            selectedTemplateId={qrStyles.templateId}
                            onTemplateSelect={(templateId) =>
                                setQrStyles((prev) => ({
                                    ...prev,
                                    templateId,
                                }))
                            }
                            qrColor={qrStyles.qrColor}
                            backgroundColor={qrStyles.backgroundColor}
                        />
                        <div className="flex items-center gap-8">
                            <ColorInput
                                color={qrStyles.qrColor}
                                onChange={(value) =>
                                    setQrStyles((prev) => ({
                                        ...prev,
                                        qrColor: value,
                                    }))
                                }
                                label="QR Color"
                            />
                            <ColorInput
                                color={qrStyles.backgroundColor}
                                onChange={(value) =>
                                    setQrStyles((prev) => ({
                                        ...prev,
                                        backgroundColor: value,
                                    }))
                                }
                                label="Background Color"
                            />
                        </div>
                        
                        <div className="flex items-center gap-16">
                            <Label
                                htmlFor="show-logo"
                                className="cursor-pointer"
                            >
                                Show Logo
                            </Label>
                            <Switch
                                id="show-logo"
                                onCheckedChange={(value) =>
                                    setQrStyles((prev) => ({
                                        ...prev,
                                        showLogo: value,
                                    }))
                                }
                            />
                        </div>

                        <div className="flex items-center gap-8">
                            <ColorInput
                                color={qrStyles.eyeColor || qrStyles.qrColor}
                                onChange={(value) =>
                                    setQrStyles((prev) => ({
                                        ...prev,
                                        eyeColor: value,
                                    }))
                                }
                                label="Eye Color"
                            />
                            <ColorInput
                                color={qrStyles.dotColor || qrStyles.qrColor}
                                onChange={(value) =>
                                    setQrStyles((prev) => ({
                                        ...prev,
                                        dotColor: value,
                                    }))
                                }
                                label="Dot Color"
                            />
                        </div>

                        {/* Contrast Feedback */}
                        <div className="space-y-3">
                            {/* Contrast Status Message */}
                            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                                contrastInfo.warning 
                                    ? 'bg-orange-50 border border-orange-200' 
                                    : 'bg-green-50 border border-green-200'
                            }`}>
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                                    contrastInfo.warning 
                                        ? 'bg-orange-100' 
                                        : 'bg-green-100'
                                }`}>
                                    {contrastInfo.warning ? (
                                        <span className="text-orange-600 text-sm font-bold">!</span>
                                    ) : (
                                        <span className="text-green-600 text-sm font-bold">✓</span>
                                    )}
                                </div>
                                <span className={`font-medium ${
                                    contrastInfo.warning 
                                        ? 'text-orange-800' 
                                        : 'text-green-800'
                                }`}>
                                    {contrastInfo.warning 
                                        ? 'Hard to scan. Use more contrast colors.' 
                                        : 'Great! Your QR code is easy to scan.'
                                    }
                                </span>
                            </div>
                        </div>

                        {/* Download Options */}
                        <div className="space-y-3">
                            <p className="text-black text-lg font-semibold">
                                Download Options
                            </p>
                            <DownloadOptions
                                url={url}
                                fgColor={qrStyles.qrColor}
                                bgColor={qrStyles.backgroundColor}
                                eyeColor={qrStyles.eyeColor}
                                dotColor={qrStyles.dotColor}
                                showLogo={qrStyles.showLogo || false}
                                templateId={qrStyles.templateId}
                            />
                        </div>
                    </FormProvider>
                </div>
            </div>
        </div>
    );
};

export default Page;