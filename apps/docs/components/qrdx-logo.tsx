import React from "react";
import { Icons } from "./icons";
import { cn } from "@repo/design-system/lib/utils";

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
          <Icons.santa 
            className={cn("absolute", className)}
            style={{ top: "-7px", left: "10px", width: "18px", height: "18px", rotate: "20deg" }}
          />
        </div>
        <Icons.logo className={cn("size-full", className)} />
      </div>
    );
  }
  return (
    <Icons.logo className={cn("size-full", className)} />
  );
};
