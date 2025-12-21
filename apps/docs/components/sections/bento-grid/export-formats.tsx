"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Code2, Download, FileCode, Image } from "lucide-react";
import { useEffect, useState } from "react";

const formats = [
  {
    icon: FileCode,
    name: "SVG",
    color: "#FF6B35",
    description: "Vector",
  },
  {
    icon: Image,
    name: "PNG",
    color: "#4169E1",
    description: "Raster",
  },
  {
    icon: Code2,
    name: "React",
    color: "#61DAFB",
    description: "Component",
  },
  {
    icon: Download,
    name: "Export",
    color: "#10B981",
    description: "Download",
  },
];

export function ExportFormats() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % formats.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="grid grid-cols-2 gap-4 w-full max-w-[280px]">
        {formats.map((format, index) => {
          const Icon = format.icon;
          const isActive = index === activeIndex;

          return (
            <motion.div
              key={format.name}
              className="relative flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all"
              animate={{
                scale: isActive ? 1.05 : 1,
                borderColor: isActive ? format.color : "hsl(var(--border))",
                backgroundColor: isActive ? `${format.color}10` : "transparent",
              }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                animate={{
                  scale: isActive ? 1.2 : 1,
                  rotate: isActive ? 360 : 0,
                }}
                transition={{ duration: 0.5 }}
              >
                <Icon
                  className="w-8 h-8 mb-2"
                  style={{
                    color: isActive ? format.color : "currentColor",
                  }}
                />
              </motion.div>
              <div className="text-sm font-semibold">{format.name}</div>
              <div className="text-xs text-muted-foreground">
                {format.description}
              </div>

              <AnimatePresence>
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl border-2"
                    style={{ borderColor: format.color }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.2 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
