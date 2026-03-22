"use client";

import { motion } from "framer-motion";
import { QrdxLogo } from "@/components/qrdx-logo";

const transition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1] as const,
};

interface CompareHeroLogosProps {
  competitor: string;
  competitorLogo: string;
}

export function CompareHeroLogos({
  competitor,
  competitorLogo,
}: CompareHeroLogosProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-36">
      <motion.div
        className="relative size-24"
        initial={{ opacity: 0, y: 32, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={transition}
      >
        <QrdxLogo className="max-w-full max-h-full" />
      </motion.div>
      <motion.div
        className="relative size-24"
        initial={{ opacity: 0, y: 32, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={transition}
      >
        <img
          src={competitorLogo}
          alt={`${competitor} logo`}
          className="h-full w-full object-contain"
        />
      </motion.div>
    </div>
  );
}

// blur to normal animation transition
