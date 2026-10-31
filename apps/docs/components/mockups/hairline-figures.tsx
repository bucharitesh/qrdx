"use client";

// The only file that imports @lucasmarkes/hairline (MIT): isometric SVG line
// figures that react to the pointer. Not imported yet: the package is not
// installed, and an unresolvable import breaks every page that reaches it.
// After installing, enable it with the one-line switch in ./hairline.tsx.

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export type FigureProps = {
  className?: string;
  intensity?: number;
  theme?: "auto" | "light" | "dark";
};

const load = (name: "Hub" | "Loupe" | "Phosphor" | "Plug" | "Stack") =>
  dynamic<FigureProps>(
    () =>
      import("@lucasmarkes/hairline/react").then(
        (mod) => mod[name] as ComponentType<FigureProps>,
      ),
    { ssr: false },
  );

export const FIGURES = {
  Hub: load("Hub"),
  Loupe: load("Loupe"),
  Phosphor: load("Phosphor"),
  Plug: load("Plug"),
  Stack: load("Stack"),
};
