import { cn } from "@repo/design-system/lib/utils";
import type React from "react";
import { LogoMark, SantaHatMark } from "./brand-marks";

interface QrdxLogoProps {
  className?: string;
  season?: "christmas" | "default";
}

export const QrdxLogo: React.FC<QrdxLogoProps> = ({
  className = "",
  season = "default",
}) => {
  if (season === "christmas") {
    return (
      <div className="relative">
        <div className="z-1 relative">
          <SantaHatMark
            className={cn("absolute", className)}
            style={{
              top: "-7px",
              left: "10px",
              width: "18px",
              height: "18px",
              rotate: "20deg",
            }}
          />
        </div>
        <LogoMark className={cn("size-full", className)} />
      </div>
    );
  }
  return <LogoMark className={cn("size-full", className)} />;
};
