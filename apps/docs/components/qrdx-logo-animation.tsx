/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */
"use client";

import { AnimatePresence, motion } from "motion/react";
import React from "react";

interface QrdxLogoAnimationProps {
  size?: number;
  color?: string;
  className?: string;
}

// All shapes are 43x43 units, centered at their respective positions
const topLeftShapes = [
  "M57 57 L100 57 L100 100 L57 100 Z", // Square
  "M78.5 57 L100 100 L57 100 Z", // Triangle (same height as square)
  "M100 78.5 C100 92.031 89.031 100 78.5 100 C67.969 100 57 92.031 57 78.5 C57 64.969 67.969 57 78.5 57 C89.031 57 100 64.969 100 78.5 Z", // Circle (diameter 43)
  "M78.5 57 L97 68.5 L97 89.5 L78.5 100 L60 89.5 L60 68.5 Z", // Hexagon (height 43)
];

const topRightShapes = [
  "M156 57 L199 57 L199 100 L156 100 Z", // Square
  "M177.5 57 L199 100 L156 100 Z", // Triangle
  "M199 78.5 C199 92.031 188.031 100 177.5 100 C166.969 100 156 92.031 156 78.5 C156 64.969 166.969 57 177.5 57 C188.031 57 199 64.969 199 78.5 Z", // Circle
  "M177.5 57 L196 68.5 L196 89.5 L177.5 100 L159 89.5 L159 68.5 Z", // Hexagon
];

const centerShapes = [
  "M106.5 106.5 L149.5 106.5 L149.5 149.5 L106.5 149.5 Z", // Square (43x43 - same as others)
  "M128 106.5 L149.5 149.5 L106.5 149.5 Z", // Triangle
  "M149.5 128 C149.5 139.874 139.874 149.5 128 149.5 C116.126 149.5 106.5 139.874 106.5 128 C106.5 116.126 116.126 106.5 128 106.5 C139.874 106.5 149.5 116.126 149.5 128 Z", // Circle
  "M128 106.5 L146.5 118 L146.5 138 L128 149.5 L109.5 138 L109.5 118 Z", // Hexagon
];

const bottomLeftShapes = [
  "M57 156 L100 156 L100 199 L57 199 Z", // Square
  "M78.5 156 L100 199 L57 199 Z", // Triangle
  "M100 177.5 C100 191.031 89.031 199 78.5 199 C67.969 199 57 191.031 57 177.5 C57 163.969 67.969 156 78.5 156 C89.031 156 100 163.969 100 177.5 Z", // Circle
  "M78.5 156 L97 167.5 L97 188.5 L78.5 199 L60 188.5 L60 167.5 Z", // Hexagon
];

const bottomRightShapes = [
  "M156 156 L199 156 L199 199 L156 199 Z", // Square
  "M177.5 156 L199 199 L156 199 Z", // Triangle
  "M199 177.5 C199 191.031 188.031 199 177.5 199 C166.969 199 156 191.031 156 177.5 C156 163.969 166.969 156 177.5 156 C188.031 156 199 163.969 199 177.5 Z", // Circle
  "M177.5 156 L196 167.5 L196 188.5 L177.5 199 L159 188.5 L159 167.5 Z", // Hexagon
];

export const QrdxLogoAnimation: React.FC<QrdxLogoAnimationProps> = ({
  size = 256,
  color = "#444444",
  className = "",
}) => {
  const [currentShape, setCurrentShape] = React.useState(0);
  const [rotationCount, setRotationCount] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentShape((prev) => (prev + 1) % centerShapes.length);
      setRotationCount((prev) => prev + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      fill="none"
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { duration: 0.5 } }}
      style={{ overflow: "visible" }}
    >
      {/* Corners - with rotation */}
      <motion.g
        initial={{ rotate: 0 }}
        animate={{ rotate: rotationCount * 90 }}
        transition={{
          duration: 0.5,
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "128px 128px" }}
      >
        {/* Top-left corner */}
        <path
          d="M0 50.055C0 22.4081 22.4069 0 50.0523 0H76.7022C84.6002 0 91 6.40519 91 14.2986C91 22.1919 84.5952 28.5971 76.7022 28.5971H50.0523C38.2078 28.5971 28.6006 38.1999 28.6006 50.05V76.7014C28.6006 84.5998 22.1957 91 14.3028 91C6.40987 91 0 84.6049 0 76.7065V50.055Z"
          fill={color}
        />
        {/* Top-right corner */}
        <path
          d="M165 14.2978C165 6.40484 171.405 0 179.298 0H205.948C233.593 0 256 22.4069 256 50.0523V76.7022C256 84.6002 249.6 91 241.702 91C233.804 91 227.404 84.5952 227.404 76.7022V50.0523C227.404 38.2078 217.802 28.6006 205.953 28.6006H179.303C171.405 28.6006 165 22.1957 165 14.2978Z"
          fill={color}
        />
        {/* Bottom-left corner */}
        <path
          d="M14.2986 165C22.197 165 28.5971 171.4 28.5971 179.299V205.95C28.5971 217.795 38.1999 227.403 50.05 227.403H76.7014C84.5998 227.403 91 233.808 91 241.701C91 249.6 84.5948 256 76.7014 256H50.055C22.4081 256.005 0 233.597 0 205.95V179.299C0 171.405 6.40519 165 14.2986 165Z"
          fill={color}
        />
        {/* Bottom-right corner */}
        <path
          d="M241.702 165C249.6 165 256 171.4 256 179.298V205.948C256 233.588 233.593 256 205.948 256H179.298C171.4 256 165 249.6 165 241.702C165 233.804 171.405 227.404 179.298 227.404H205.948C217.792 227.404 227.399 217.802 227.399 205.953V179.303C227.399 171.405 233.804 165 241.702 165Z"
          fill={color}
        />
      </motion.g>

      {/* Top-left inner square - animated */}
      <AnimatePresence mode="wait">
        <motion.path
          key={`top-left-${currentShape}`}
          d={topLeftShapes[currentShape]}
          fill={color}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: "78.5px 78.5px" }}
        />
      </AnimatePresence>

      {/* Top-right inner square - animated */}
      <AnimatePresence mode="wait">
        <motion.path
          key={`top-right-${currentShape}`}
          d={topRightShapes[currentShape]}
          fill={color}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: "177.5px 78.5px" }}
        />
      </AnimatePresence>

      {/* Center square - animated */}
      <AnimatePresence mode="wait">
        <motion.path
          key={`center-${currentShape}`}
          d={centerShapes[currentShape]}
          fill={color}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: "128px 128px" }}
        />
      </AnimatePresence>

      {/* Bottom-left inner square - animated */}
      <AnimatePresence mode="wait">
        <motion.path
          key={`bottom-left-${currentShape}`}
          d={bottomLeftShapes[currentShape]}
          fill={color}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: "78.5px 177.5px" }}
        />
      </AnimatePresence>

      {/* Bottom-right inner square - animated */}
      <AnimatePresence mode="wait">
        <motion.path
          key={`bottom-right-${currentShape}`}
          d={bottomRightShapes[currentShape]}
          fill={color}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: "177.5px 177.5px" }}
        />
      </AnimatePresence>
    </motion.svg>
  );
};
