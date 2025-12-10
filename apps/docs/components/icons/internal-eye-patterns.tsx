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
        strokeWidth="5"
      ></rect>
      <rect x="11" y="11" width="11" height="11" fill="black"></rect>
    </svg>
  ),
  rounded: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path stroke="#DDE0E4" strokeWidth="5" d="M3.157 3.208h27v27h-27z" />
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
        strokeWidth="5"
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
      <path stroke="#DDE0E4" strokeWidth="5" d="M3.001 3.001h27v27h-27z" />
      <path
        fill="#000"
        d="M15.444 9.895a2.2 2.2 0 0 1 3.112 0l4.666 4.667a2.2 2.2 0 0 1 0 3.112l-4.666 4.666a2.2 2.2 0 0 1-3.112 0l-4.667-4.666a2.2 2.2 0 0 1 0-3.112l4.667-4.667Z"
      />
    </svg>
  ),
  message: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M2.876 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M10.568 13.84a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v8h-8a3 3 0 0 1-3-3v-5Z"
      ></path>
    </svg>
  ),
  "message-reverse": (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M2.876 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M10.568 13.84a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v8h-8a3 3 0 0 1-3-3v-5Z"
      ></path>
    </svg>
  ),
  diya: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M3.126 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M10.693 10.84h8a3 3 0 0 1 3 3v8h-8a3 3 0 0 1-3-3v-8Z"
      ></path>
    </svg>
  ),
  "diya-reverse": (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M3.126 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M21.692 10.84h-8a3 3 0 0 0-3 3v8h8a3 3 0 0 0 3-3v-8Z"
      ></path>
    </svg>
  ),
  "rounded-triangle": (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M3.001 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M15.444 9.895a2.2 2.2 0 0 1 3.112 0l4.666 4.667a2.2 2.2 0 0 1 0 3.112l-4.666 4.666a2.2 2.2 0 0 1-3.112 0l-4.667-4.666a2.2 2.2 0 0 1 0-3.112l4.667-4.667Z"
      ></path>
    </svg>
  ),
  star: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M3.126 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M16 10.67a.757.757 0 0 1 1.25 0L19 13.3c.101.15.257.26.437.305l3.133.794c.524.133.73.743.387 1.147l-2.052 2.42a.7.7 0 0 0-.166.494l.185 3.121c.031.521-.507.899-1.01.709l-3.02-1.135a.768.768 0 0 0-.539 0l-3.018 1.135c-.504.19-1.042-.188-1.011-.709l.185-3.12a.7.7 0 0 0-.166-.496l-2.052-2.419c-.342-.404-.137-1.014.387-1.147l3.133-.794a.742.742 0 0 0 .436-.306L16 10.67Z"
      ></path>
    </svg>
  ),
  banner: (props: InternalEyePatternProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      fill="none"
      {...props}
    >
      <path
        stroke="#DDE0E4"
        stroke-width="5"
        d="M3.126 3.001h27v27h-27z"
      ></path>
      <path
        fill="#000"
        d="M15.735 10.478a.618.618 0 0 1 .78 0l.755.614a.618.618 0 0 0 .487.13l.96-.153a.618.618 0 0 1 .676.39l.347.909a.617.617 0 0 0 .357.357l.91.346a.618.618 0 0 1 .389.676l-.154.96a.618.618 0 0 0 .13.488l.614.755a.618.618 0 0 1 0 .78l-.614.754a.618.618 0 0 0-.13.488l.154.96a.618.618 0 0 1-.39.676l-.909.347a.618.618 0 0 0-.357.357l-.347.909a.618.618 0 0 1-.675.39l-.96-.155a.618.618 0 0 0-.488.131l-.755.614a.618.618 0 0 1-.78 0l-.755-.614a.618.618 0 0 0-.488-.13l-.96.154a.618.618 0 0 1-.675-.39l-.347-.91a.618.618 0 0 0-.357-.356l-.91-.347a.618.618 0 0 1-.39-.675l.155-.96a.618.618 0 0 0-.13-.489l-.615-.754a.618.618 0 0 1 0-.78l.614-.755a.618.618 0 0 0 .131-.488l-.154-.96a.618.618 0 0 1 .39-.676l.909-.346a.618.618 0 0 0 .357-.357l.347-.91a.618.618 0 0 1 .675-.39l.96.155a.618.618 0 0 0 .488-.13l.755-.615Z"
      ></path>
    </svg>
  ),
};

export const EyeDotPatterns: React.FC<{ pattern: CornerEyeDotPattern }> = ({
  pattern,
  ...props
}) => {
  const PatternIcon = Patterns[pattern];
  return <PatternIcon {...props} />;
};
