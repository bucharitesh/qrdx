import type { SVGProps } from "react";

/** A customer logo: an inline SVG with an accessible name (`title`). */
export type CustomerLogoProps = SVGProps<SVGSVGElement> & { title?: string };
