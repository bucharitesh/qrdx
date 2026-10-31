import { preload } from "react-dom";
import { HeroVideoDialog } from "@/components/ui/hero-video-dialog";

const thumbnailSrc = "https://img.youtube.com/vi/z7dsFh9Vcco/maxresdefault.jpg";

export function HeroVideoSection() {
  // The thumbnail is the homepage LCP element; fetch it ahead of hydration.
  preload(thumbnailSrc, { as: "image", fetchPriority: "high" });

  return (
    <div className="relative px-6 mt-10">
      <div className="relative size-full shadow-xl rounded-2xl overflow-hidden">
        <HeroVideoDialog
          animationStyle="from-center"
          videoSrc="https://www.youtube.com/embed/z7dsFh9Vcco?si=7dvjiGuRPHWMJdCm"
          thumbnailSrc={thumbnailSrc}
          thumbnailAlt="QRdx Introduction Video"
        />
      </div>
    </div>
  );
}
