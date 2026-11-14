"use client";

import { getTemplateIds, QRCodeSVG } from "qrdx";
import { useEffect, useState } from "react";

export function TypeTester() {
  const [templateId, setTemplateId] = useState("Arrow");

  useEffect(() => {
    const interval = setInterval(() => {
      setTemplateId(
        getTemplateIds()[
          Math.floor(Math.random() * getTemplateIds().length)
        ] as string,
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <QRCodeSVG
        value="https://www.google.com"
        size={150}
        fgColor="#4D5053"
        bgColor="transparent"
        eyeColor="#4D5053"
        dotColor="#4D5053"
        bodyPattern="circle"
        cornerEyePattern="circle"
        cornerEyeDotPattern="circle"
        templateId={templateId}
      />
    </div>
  );
}
