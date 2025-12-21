"use client";

import { useEffect, useRef } from "react";

interface LottiePlayerProps {
  animationData: any;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export function LottiePlayer({
  animationData,
  loop = true,
  autoplay = true,
  className = "",
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<any>(null);

  useEffect(() => {
    let lottie: any;

    // Dynamically import lottie-web to avoid SSR issues
    import("lottie-web").then((module) => {
      lottie = module.default;

      if (containerRef.current && !animationRef.current) {
        animationRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop,
          autoplay,
          animationData,
        });
      }
    });

    return () => {
      if (animationRef.current) {
        animationRef.current.destroy();
        animationRef.current = null;
      }
    };
  }, [animationData, loop, autoplay]);

  return <div ref={containerRef} className={className} />;
}
