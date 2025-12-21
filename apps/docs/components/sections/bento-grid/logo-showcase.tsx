"use client";

import { Crown, Heart, Sparkles, Star, Zap } from "lucide-react";
import { QRCodeSVG } from "qrdx";
import { useEffect, useState } from "react";

const logos = [
  { icon: Sparkles, color: "#FFD700" },
  { icon: Heart, color: "#FF1493" },
  { icon: Zap, color: "#FF6B35" },
  { icon: Star, color: "#4169E1" },
  { icon: Crown, color: "#9333EA" },
];

export function LogoShowcase() {
  const [logoIndex, setLogoIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogoIndex((prev) => (prev + 1) % logos.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = logos[logoIndex].icon;

  return (
    <div className="flex items-center justify-center h-full relative">
      <div className="relative">
        <QRCodeSVG
          value="https://qrdx.dev"
          size={140}
          fgColor="#000000"
          bgColor="transparent"
          eyeColor="#000000"
          dotColor="#000000"
        />
        {/* Animated logo overlay */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-2 shadow-lg transition-all duration-500"
          style={{
            borderColor: logos[logoIndex].color,
            borderWidth: "2px",
            borderStyle: "solid",
          }}
        >
          <CurrentIcon
            className="w-6 h-6 transition-all duration-500"
            style={{ color: logos[logoIndex].color }}
          />
        </div>
      </div>
    </div>
  );
}
