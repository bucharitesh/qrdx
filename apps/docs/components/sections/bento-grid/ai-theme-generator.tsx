"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrdx";
import { useEffect, useState } from "react";

const themes = [
  {
    name: "Ocean",
    fgColor: "#0077BE",
    eyeColor: "#004E8C",
    bgColor: "transparent",
  },
  {
    name: "Sunset",
    fgColor: "#FF6B35",
    eyeColor: "#E63946",
    bgColor: "transparent",
  },
  {
    name: "Forest",
    fgColor: "#2D6A4F",
    eyeColor: "#1B4332",
    bgColor: "transparent",
  },
  {
    name: "Purple Haze",
    fgColor: "#7209B7",
    eyeColor: "#560BAD",
    bgColor: "transparent",
  },
  {
    name: "Midnight",
    fgColor: "#14213D",
    eyeColor: "#000000",
    bgColor: "transparent",
  },
];

export function AIThemeGenerator() {
  const [themeIndex, setThemeIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsGenerating(true);

      setTimeout(() => {
        setThemeIndex((prev) => (prev + 1) % themes.length);
        setIsGenerating(false);
      }, 500);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const currentTheme = themes[themeIndex];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="relative">
        <motion.div
          animate={{
            scale: isGenerating ? 0.95 : 1,
            opacity: isGenerating ? 0.7 : 1,
          }}
          transition={{ duration: 0.3 }}
        >
          <QRCodeSVG
            value="https://qrdx.dev"
            size={120}
            fgColor={currentTheme.fgColor}
            bgColor={currentTheme.bgColor}
            eyeColor={currentTheme.eyeColor}
            dotColor={currentTheme.fgColor}
          />
        </motion.div>

        {/* AI Sparkle Effect */}
        {isGenerating && (
          <motion.div
            className="absolute -top-2 -right-2"
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: 180 }}
            exit={{ scale: 0 }}
          >
            <Sparkles className="w-6 h-6 text-yellow-500" />
          </motion.div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <motion.div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          animate={{
            borderColor: currentTheme.fgColor,
            backgroundColor: `${currentTheme.fgColor}10`,
          }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles
            className="w-3.5 h-3.5"
            style={{ color: currentTheme.fgColor }}
          />
          <span
            className="text-xs font-semibold"
            style={{ color: currentTheme.fgColor }}
          >
            {currentTheme.name}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
