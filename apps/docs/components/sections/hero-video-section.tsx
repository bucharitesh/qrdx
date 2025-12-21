import { HeroVideoDialog } from "@/components/ui/hero-video-dialog";

export function HeroVideoSection() {
  return (
    <div className="relative px-6 mt-10">
      <div className="relative size-full shadow-xl rounded-2xl overflow-hidden">
        <HeroVideoDialog
          animationStyle="from-center"
          videoSrc="https://www.youtube.com/embed/z7dsFh9Vcco?si=7dvjiGuRPHWMJdCm"
          thumbnailSrc="https://img.youtube.com/vi/z7dsFh9Vcco/maxresdefault.jpg"
          thumbnailAlt="QRdx Introduction Video"
        />
      </div>
    </div>
  );
}
