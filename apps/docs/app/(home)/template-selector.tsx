"use client";

import { QRCode } from "qrdx/qr-code";
import { getAllTemplates, type TemplateDefinition } from "qrdx/templates";
import type React from "react";

type TemplateSelectorProps = {
  selectedTemplateId?: string;
  onTemplateSelect: (templateId: string) => void;
  qrColor?: string;
  backgroundColor?: string;
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedTemplateId = "default",
  onTemplateSelect,
  qrColor = "#000000",
  backgroundColor = "#ffffff",
}) => {
  const templates = getAllTemplates();

  return (
    <div className="grid grid-cols-3 gap-4">
      {templates.map((template: TemplateDefinition) => (
        <button
          className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
            selectedTemplateId === template.id
              ? "border-black bg-black/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
          key={template.id}
          onClick={() => onTemplateSelect(template.id)}
          tabIndex={0}
          type="button"
        >
          {/* Template Preview */}
          <div className="mb-3 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center">
              <QRCode
                bgColor={backgroundColor}
                fgColor={qrColor}
                hideLogo={true}
                scale={0.6}
                templateId={template.id}
                url="https://example.com"
              />
            </div>
          </div>

          {/* Selection Indicator */}
          {selectedTemplateId === template.id && (
            <div className="absolute top-2 right-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black">
                <span className="font-bold text-white text-xs">✓</span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
