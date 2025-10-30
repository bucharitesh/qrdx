"use client";

import React from "react";
import { getAllTemplates, TemplateDefinition } from "@repo/qr/templates";
import { QRCode } from "@repo/qr/qr-code";

interface TemplateSelectorProps {
  selectedTemplateId?: string;
  onTemplateSelect: (templateId: string) => void;
  qrColor?: string;
  backgroundColor?: string;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedTemplateId = "default",
  onTemplateSelect,
  qrColor = "#000000",
  backgroundColor = "#ffffff",
}) => {
  const templates = getAllTemplates();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-black">Frames</h3>
      <div className="grid grid-cols-3 gap-4">
        {templates.map((template: TemplateDefinition) => (
          <div
            key={template.id}
            className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
              selectedTemplateId === template.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            onClick={() => onTemplateSelect(template.id)}
          >
            {/* Template Preview */}
            <div className="flex items-center justify-center mb-3">
              <div className="w-20 h-20 flex items-center justify-center">
                <QRCode
                  url="https://example.com"
                  fgColor={qrColor}
                  bgColor={backgroundColor}
                  scale={0.6}
                  hideLogo={true}
                  templateId={template.id}
                />
              </div>
            </div>

            {/* Selection Indicator */}
            {selectedTemplateId === template.id && (
              <div className="absolute top-2 right-2">
                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
