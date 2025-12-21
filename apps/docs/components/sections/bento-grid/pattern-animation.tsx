"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

// Shape configurations
const shapes = [
  { borderRadius: "0%", rotate: 0 }, // square
  { borderRadius: "50%", rotate: 0 }, // circle
  { borderRadius: "0%", rotate: 45 }, // diamond (rotated square)
  { borderRadius: "30%", rotate: 0 }, // rounded square
  { borderRadius: "40% 60% 60% 40%", rotate: 0 }, // blob/organic shape
];

// Pattern item colors (both light and dark variations)
const itemColors = [
  "rgb(239 68 68)", // red-500
  "rgb(249 115 22)", // orange-500
  "rgb(234 179 8)", // yellow-500
  "rgb(34 197 94)", // green-500
  "rgb(59 130 246)", // blue-500
  "rgb(168 85 247)", // purple-500
  "rgb(236 72 153)", // pink-500
  "rgb(20 184 166)", // teal-500
  "rgb(15 23 42)", // dark slate-900
  "rgb(30 41 59)", // dark slate-800
  "rgb(71 85 105)", // dark slate-600
  "rgb(100 116 139)", // dark slate-500
];

export function PatternAnimation() {
  const gridSize = 9;
  const totalDots = gridSize * gridSize;

  // QR code pattern - randomly distributed missing dots
  const missingDots = useMemo(
    () => [
      3, 7, 12, 15, 19, 24, 28, 33, 35, 41, 47, 50, 54, 58, 62, 65, 69, 73, 76,
      78, 80, 23, 31, 44,
    ],
    [],
  );

  const [config, setConfig] = useState({
    shape: shapes[0],
    itemColor: itemColors[0],
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Randomize shape and color every 2.5 seconds for better visibility
    const interval = setInterval(() => {
      setConfig({
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        itemColor: itemColors[Math.floor(Math.random() * itemColors.length)],
      });
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <div
        className="grid gap-2 w-full max-w-[200px]"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        }}
      >
        {Array.from({ length: totalDots }, (_, index) => {
          const isMissing = missingDots.includes(index);

          return (
            <motion.div
              key={index}
              style={{
                width: "100%",
                aspectRatio: "1",
                minWidth: "12px",
                minHeight: "12px",
              }}
              initial={{
                opacity: 0,
                scale: 0.3,
                borderRadius: config.shape.borderRadius,
                rotate: config.shape.rotate,
                backgroundColor: config.itemColor,
              }}
              animate={{
                opacity: isMissing ? 0 : 1,
                scale: isMissing ? 0 : 1,
                borderRadius: config.shape.borderRadius,
                rotate: config.shape.rotate,
                backgroundColor: config.itemColor,
              }}
              transition={{
                opacity: {
                  delay: mounted ? 0 : index * 0.003,
                  duration: mounted ? 0.8 : 0.3,
                  ease: "easeInOut",
                },
                scale: {
                  delay: mounted ? 0 : index * 0.003,
                  duration: mounted ? 0.8 : 0.3,
                  ease: "easeInOut",
                },
                borderRadius: { duration: 0.8, ease: "easeInOut" },
                rotate: { duration: 0.8, ease: "easeInOut" },
                backgroundColor: { duration: 0.8, ease: "easeInOut" },
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
