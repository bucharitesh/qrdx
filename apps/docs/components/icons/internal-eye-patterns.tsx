/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */

import type { CornerEyeDotPattern } from "qrdx/types";

type InternalEyePatternProps = React.HTMLAttributes<SVGElement>;

export const Patterns: Record<
  CornerEyeDotPattern,
  (props: InternalEyePatternProps) => React.ReactNode
> = {
  square: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <rect
        x="3"
        y="3"
        width="27"
        height="27"
        stroke="#DDDDDD"
        stroke-width="5"
      ></rect>
      <rect x="11" y="11" width="11" height="11" fill="black"></rect>
    </svg>
  ),
  "rounded-square": (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path stroke="#DDE0E4" stroke-width="5" d="M3.157 3.208h27v27h-27z" />
      <rect width="11" height="11" x="11.158" y="11.209" fill="#000" rx="3" />
    </svg>
  ),
  circle: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <rect
        x="3"
        y="3"
        width="27"
        height="27"
        stroke="#DDDDDD"
        stroke-width="5"
      />
      <rect x="11" y="11" width="11" height="11" rx="5.5" fill="black" />
    </svg>
  ),
  diamond: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path stroke="#DDE0E4" stroke-width="5" d="M3.001 3.001h27v27h-27z" />
      <path
        fill="#000"
        d="M15.444 9.895a2.2 2.2 0 0 1 3.112 0l4.666 4.667a2.2 2.2 0 0 1 0 3.112l-4.666 4.666a2.2 2.2 0 0 1-3.112 0l-4.667-4.666a2.2 2.2 0 0 1 0-3.112l4.667-4.667Z"
      />
    </svg>
  ),
  //
};

export const EyeDotPatterns: React.FC<{ pattern: CornerEyeDotPattern }> = ({
  pattern,
  ...props
}) => {
  const PatternIcon = Patterns[pattern];
  return <PatternIcon {...props} />;
};
