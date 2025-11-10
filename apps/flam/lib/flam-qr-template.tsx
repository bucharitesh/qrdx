import type { TemplateDefinition } from "qrdx";

// Custom props for FlamQR template
export type FlamQRProps = {
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight: number;
  fontLetterSpacing?: number;
  fontFamily?: string;
  textRotation?: number;
  textPosition?: "top" | "bottom";
  strokeWidth?: number;
  strokeColor?: string;
  outerCircleColor?: string;
};

// Simple hash function to convert URL string to a number
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = hash * 32 - hash + char;
    // Convert to 32-bit integer using modulo
    hash %= 2_147_483_647;
  }
  return Math.abs(hash);
}

// Seeded random number generator for deterministic selection
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
}

// Circle coordinates configuration
const CIRCLE_COORDS = [
  { cx: 508.792, cy: 239.288 },
  { cx: 351.368, cy: 506.255 },
  { cx: 241.823, cy: 82.7775 },
  { cx: 85.313, cy: 239.288 },
  { cx: 508.792, cy: 257.699 },
  { cx: 332.957, cy: 506.255 },
  { cx: 260.235, cy: 82.7775 },
  { cx: 85.313, cy: 257.699 },
  { cx: 260.235, cy: 82.778 },
  { cx: 508.792, cy: 276.11 },
  { cx: 314.546, cy: 506.255 },
  { cx: 278.646, cy: 82.778 },
  { cx: 85.313, cy: 276.11 },
  { cx: 508.792, cy: 294.521 },
  { cx: 508.792, cy: 312.932 },
  { cx: 296.135, cy: 506.255 },
  { cx: 297.057, cy: 82.778 },
  { cx: 85.313, cy: 294.521 },
  { cx: 508.792, cy: 331.343 },
  { cx: 315.467, cy: 82.778 },
  { cx: 85.313, cy: 312.932 },
  { cx: 277.724, cy: 506.255 },
  { cx: 508.792, cy: 349.753 },
  { cx: 499.586, cy: 211.662 },
  { cx: 259.313, cy: 506.255 },
  { cx: 333.878, cy: 82.778 },
  { cx: 85.313, cy: 331.343 },
  { cx: 499.586, cy: 220.868 },
  { cx: 499.586, cy: 230.073 },
  { cx: 240.902, cy: 506.255 },
  { cx: 352.289, cy: 82.778 },
  { cx: 85.313, cy: 349.753 },
  { cx: 499.586, cy: 248.493 },
  { cx: 378.993, cy: 497.05 },
  { cx: 214.198, cy: 91.991 },
  { cx: 94.527, cy: 211.662 },
  { cx: 369.788, cy: 497.05 },
  { cx: 223.404, cy: 91.991 },
  { cx: 94.527, cy: 220.868 },
  { cx: 499.586, cy: 294.521 },
  { cx: 360.573, cy: 497.05 },
  { cx: 232.61, cy: 91.991 },
  { cx: 94.527, cy: 230.073 },
  { cx: 342.163, cy: 497.05 },
  { cx: 251.029, cy: 91.991 },
  { cx: 94.527, cy: 248.493 },
  { cx: 499.586, cy: 358.959 },
  { cx: 499.586, cy: 368.165 },
  { cx: 296.135, cy: 497.05 },
  { cx: 297.057, cy: 91.991 },
  { cx: 94.527, cy: 294.521 },
  { cx: 499.586, cy: 377.379 },
  { cx: 490.38, cy: 193.251 },
  { cx: 490.38, cy: 202.458 },
  { cx: 490.38, cy: 220.868 },
  { cx: 231.697, cy: 497.05 },
  { cx: 361.495, cy: 91.991 },
  { cx: 94.527, cy: 358.959 },
  { cx: 490.38, cy: 239.288 },
  { cx: 222.491, cy: 497.05 },
  { cx: 370.7, cy: 91.991 },
  { cx: 94.527, cy: 368.165 },
  { cx: 490.38, cy: 257.699 },
  { cx: 213.277, cy: 497.05 },
  { cx: 94.527, cy: 377.379 },
  { cx: 490.38, cy: 276.11 },
  { cx: 397.404, cy: 487.844 },
  { cx: 195.787, cy: 101.196 },
  { cx: 103.732, cy: 193.251 },
  { cx: 490.38, cy: 294.521 },
  { cx: 388.199, cy: 487.844 },
  { cx: 204.993, cy: 101.196 },
  { cx: 103.732, cy: 202.458 },
  { cx: 490.38, cy: 312.932 },
  { cx: 369.788, cy: 487.844 },
  { cx: 223.404, cy: 101.196 },
  { cx: 490.38, cy: 331.343 },
  { cx: 103.732, cy: 220.868 },
  { cx: 351.368, cy: 487.844 },
  { cx: 241.823, cy: 101.196 },
  { cx: 103.732, cy: 239.288 },
  { cx: 490.38, cy: 358.959 },
  { cx: 490.38, cy: 368.165 },
  { cx: 332.957, cy: 487.844 },
  { cx: 260.235, cy: 101.196 },
  { cx: 103.732, cy: 257.699 },
  { cx: 490.38, cy: 386.584 },
  { cx: 490.38, cy: 395.789 },
  { cx: 314.546, cy: 487.844 },
  { cx: 278.646, cy: 101.196 },
  { cx: 103.732, cy: 276.11 },
  { cx: 481.175, cy: 174.84 },
  { cx: 481.175, cy: 184.046 },
  { cx: 296.135, cy: 487.844 },
  { cx: 297.057, cy: 101.196 },
  { cx: 103.732, cy: 294.521 },
  { cx: 481.175, cy: 202.458 },
  { cx: 277.724, cy: 487.844 },
  { cx: 103.732, cy: 312.932 },
  { cx: 315.467, cy: 101.196 },
  { cx: 481.175, cy: 230.073 },
  { cx: 259.313, cy: 487.844 },
  { cx: 103.732, cy: 331.343 },
  { cx: 333.878, cy: 101.196 },
  { cx: 481.175, cy: 276.11 },
  { cx: 231.697, cy: 487.844 },
  { cx: 103.732, cy: 358.959 },
  { cx: 222.491, cy: 487.844 },
  { cx: 103.732, cy: 368.165 },
  { cx: 370.7, cy: 101.196 },
  { cx: 481.175, cy: 303.726 },
  { cx: 204.072, cy: 487.844 },
  { cx: 389.12, cy: 101.196 },
  { cx: 103.732, cy: 386.584 },
  { cx: 398.326, cy: 101.196 },
  { cx: 481.175, cy: 349.753 },
  { cx: 103.732, cy: 395.789 },
  { cx: 194.866, cy: 487.844 },
  { cx: 415.815, cy: 478.639 },
  { cx: 177.376, cy: 110.402 },
  { cx: 112.938, cy: 174.84 },
  { cx: 481.175, cy: 395.789 },
  { cx: 406.61, cy: 478.639 },
  { cx: 186.582, cy: 110.402 },
  { cx: 112.938, cy: 184.046 },
  { cx: 481.175, cy: 414.201 },
  { cx: 388.199, cy: 478.639 },
  { cx: 204.993, cy: 110.402 },
  { cx: 112.938, cy: 202.458 },
  { cx: 471.969, cy: 165.635 },
  { cx: 471.969, cy: 184.046 },
  { cx: 360.573, cy: 478.639 },
  { cx: 232.61, cy: 110.402 },
  { cx: 112.938, cy: 230.073 },
  { cx: 471.969, cy: 211.662 },
  { cx: 471.969, cy: 220.868 },
  { cx: 314.546, cy: 478.639 },
  { cx: 278.646, cy: 110.402 },
  { cx: 112.938, cy: 276.11 },
  { cx: 471.969, cy: 248.493 },
  { cx: 471.969, cy: 257.699 },
  { cx: 286.93, cy: 478.639 },
  { cx: 306.262, cy: 110.402 },
  { cx: 112.938, cy: 303.726 },
  { cx: 471.969, cy: 266.904 },
  { cx: 471.969, cy: 331.343 },
  { cx: 471.969, cy: 340.548 },
  { cx: 194.866, cy: 478.639 },
  { cx: 398.326, cy: 110.402 },
  { cx: 112.938, cy: 395.789 },
  { cx: 471.969, cy: 368.165 },
  { cx: 176.455, cy: 478.639 },
  { cx: 416.736, cy: 110.402 },
  { cx: 112.938, cy: 414.201 },
  { cx: 471.969, cy: 386.584 },
  { cx: 425.021, cy: 469.433 },
  { cx: 168.171, cy: 119.608 },
  { cx: 122.144, cy: 165.635 },
  { cx: 471.969, cy: 404.995 },
  { cx: 471.969, cy: 414.201 },
  { cx: 406.61, cy: 469.433 },
  { cx: 186.582, cy: 119.608 },
  { cx: 122.144, cy: 184.046 },
  { cx: 471.969, cy: 423.406 },
  { cx: 462.764, cy: 156.429 },
  { cx: 378.993, cy: 469.433 },
  { cx: 214.198, cy: 119.608 },
  { cx: 122.144, cy: 211.662 },
  { cx: 462.764, cy: 165.635 },
  { cx: 369.788, cy: 469.433 },
  { cx: 223.404, cy: 119.608 },
  { cx: 122.144, cy: 220.868 },
  { cx: 462.764, cy: 193.251 },
  { cx: 462.764, cy: 211.662 },
  { cx: 342.163, cy: 469.433 },
  { cx: 251.029, cy: 119.608 },
  { cx: 122.144, cy: 248.493 },
  { cx: 462.764, cy: 230.073 },
  { cx: 332.957, cy: 469.433 },
  { cx: 260.235, cy: 119.608 },
  { cx: 122.144, cy: 257.699 },
  { cx: 462.764, cy: 248.493 },
  { cx: 323.751, cy: 469.433 },
  { cx: 269.44, cy: 119.608 },
  { cx: 122.144, cy: 266.904 },
  { cx: 462.764, cy: 266.904 },
  { cx: 305.341, cy: 469.433 },
  { cx: 287.851, cy: 119.608 },
  { cx: 122.144, cy: 285.315 },
  { cx: 462.764, cy: 276.11 },
  { cx: 296.135, cy: 469.433 },
  { cx: 297.057, cy: 119.608 },
  { cx: 122.144, cy: 294.521 },
  { cx: 462.764, cy: 294.521 },
  { cx: 462.764, cy: 303.726 },
  { cx: 462.764, cy: 322.137 },
  { cx: 259.313, cy: 469.433 },
  { cx: 333.878, cy: 119.608 },
  { cx: 122.144, cy: 331.343 },
  { cx: 462.764, cy: 331.343 },
  { cx: 250.107, cy: 469.433 },
  { cx: 343.084, cy: 119.608 },
  { cx: 122.144, cy: 340.548 },
  { cx: 462.764, cy: 349.753 },
  { cx: 462.764, cy: 358.959 },
  { cx: 222.491, cy: 469.433 },
  { cx: 370.7, cy: 119.608 },
  { cx: 122.144, cy: 368.165 },
  { cx: 462.764, cy: 377.379 },
  { cx: 204.072, cy: 469.433 },
  { cx: 389.12, cy: 119.608 },
  { cx: 122.144, cy: 386.584 },
  { cx: 462.764, cy: 395.789 },
  { cx: 462.764, cy: 404.995 },
  { cx: 185.661, cy: 469.433 },
  { cx: 407.531, cy: 119.608 },
  { cx: 122.144, cy: 404.995 },
  { cx: 462.764, cy: 423.406 },
  { cx: 176.455, cy: 469.433 },
  { cx: 416.736, cy: 119.608 },
  { cx: 122.144, cy: 414.201 },
  { cx: 462.764, cy: 432.611 },
  { cx: 453.558, cy: 147.224 },
  { cx: 167.25, cy: 469.433 },
  { cx: 425.942, cy: 119.608 },
  { cx: 122.144, cy: 423.406 },
  { cx: 434.226, cy: 460.228 },
  { cx: 158.965, cy: 128.813 },
  { cx: 131.349, cy: 156.429 },
  { cx: 425.021, cy: 460.228 },
  { cx: 168.171, cy: 128.813 },
  { cx: 131.349, cy: 165.635 },
  { cx: 453.558, cy: 239.288 },
  { cx: 397.404, cy: 460.228 },
  { cx: 195.787, cy: 128.813 },
  { cx: 131.349, cy: 193.251 },
  { cx: 378.993, cy: 460.228 },
  { cx: 214.198, cy: 128.813 },
  { cx: 131.349, cy: 211.662 },
  { cx: 360.573, cy: 460.228 },
  { cx: 232.61, cy: 128.813 },
  { cx: 131.349, cy: 230.073 },
  { cx: 342.163, cy: 460.228 },
  { cx: 251.029, cy: 128.813 },
  { cx: 131.349, cy: 248.493 },
  { cx: 453.558, cy: 349.753 },
  { cx: 323.751, cy: 460.228 },
  { cx: 269.44, cy: 128.813 },
  { cx: 131.349, cy: 266.904 },
  { cx: 314.546, cy: 460.228 },
  { cx: 278.646, cy: 128.813 },
  { cx: 131.349, cy: 276.11 },
  { cx: 296.135, cy: 460.228 },
  { cx: 297.057, cy: 128.813 },
  { cx: 131.349, cy: 294.521 },
  { cx: 453.558, cy: 441.817 },
  { cx: 286.93, cy: 460.228 },
  { cx: 306.262, cy: 128.813 },
  { cx: 131.349, cy: 303.726 },
  { cx: 268.518, cy: 460.228 },
  { cx: 324.673, cy: 128.813 },
  { cx: 131.349, cy: 322.137 },
  { cx: 259.313, cy: 460.228 },
  { cx: 333.878, cy: 128.813 },
  { cx: 131.349, cy: 331.343 },
  { cx: 245.008, cy: 461.008 },
  { cx: 352.289, cy: 128.813 },
  { cx: 131.008, cy: 348.008 },
  { cx: 231.697, cy: 460.228 },
  { cx: 361.495, cy: 128.813 },
  { cx: 131.349, cy: 358.959 },
  { cx: 213.277, cy: 460.228 },
  { cx: 379.914, cy: 128.813 },
  { cx: 131.349, cy: 377.379 },
  { cx: 194.866, cy: 460.228 },
  { cx: 398.326, cy: 128.813 },
  { cx: 131.349, cy: 395.789 },
  { cx: 185.661, cy: 460.228 },
  { cx: 407.531, cy: 128.813 },
  { cx: 131.349, cy: 404.995 },
  { cx: 167.25, cy: 460.228 },
  { cx: 425.942, cy: 128.813 },
  { cx: 131.349, cy: 423.406 },
  { cx: 435.008, cy: 144.008 },
  { cx: 158.044, cy: 460.228 },
  { cx: 435.147, cy: 128.813 },
  { cx: 131.349, cy: 432.611 },
  { cx: 443.432, cy: 451.022 },
  { cx: 149.76, cy: 138.018 },
  { cx: 140.555, cy: 147.224 },
  { cx: 351.368, cy: 451.022 },
  { cx: 140.555, cy: 239.288 },
  { cx: 245.008, cy: 451.008 },
  { cx: 140.008, cy: 348.008 },
  { cx: 148.839, cy: 451.022 },
  { cx: 444.353, cy: 138.018 },
  { cx: 140.555, cy: 441.817 },
] as const;

// Select 260 circles randomly from CIRCLE_COORDS based on URL
function selectCirclesFromUrl(
  url: string,
  count = 240
): Array<{ cx: number; cy: number }> {
  // Create hash from URL for deterministic selection
  const urlHash = hashString(url);
  const random = createSeededRandom(urlHash);

  // Create array of indices
  const indices = Array.from({ length: CIRCLE_COORDS.length }, (_, i) => i);

  // Fisher-Yates shuffle with seeded random
  const shuffled = [...indices];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Select first 'count' indices
  const selectedIndices = shuffled.slice(0, count).sort((a, b) => a - b);

  // Return selected circles
  return selectedIndices.map((index) => CIRCLE_COORDS[index]);
}

export const FlamQR: TemplateDefinition<FlamQRProps> = {
  id: "FlamQR",
  name: "Flam QR",
  description: "Flam QR code with Flam logo and text",
  wrapper: (children, props, templateConfig) => {
    const url = templateConfig?.url || "";
    const pixelSize = templateConfig?.pixelSize
      ? templateConfig?.pixelSize * 0.5
      : 4.413_793_103_448_276 * 0.55;

    const circles = selectCirclesFromUrl(url, 240);

    // Calculate text centering rotation
    // Uses a more accurate estimation based on font metrics
    const calculateTextRotation = () => {
      const text =
        props?.customText ||
        "enter your text here * Flam It * enter your text here * Flam It * ";
      const fontSize = props?.fontSize || 40;
      const letterSpacing = props?.fontLetterSpacing || 6;

      // More accurate text length calculation
      // Account for different character widths (narrow vs wide characters)
      let textLength = 0;
      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        // Approximate character widths (relative to fontSize)
        // Narrow chars: i, l, t, etc. ≈ 0.3
        // Normal chars: a-z, A-Z, 0-9 ≈ 0.6
        // Wide chars: W, M, etc. ≈ 0.8
        // Spaces: typically about 0.3 * fontSize
        if (char === " ") {
          textLength += fontSize * 0.3;
        } else if (/[il1|!']/.test(char)) {
          textLength += fontSize * 0.3;
        } else if (/[mwMW@%&]/.test(char)) {
          textLength += fontSize * 0.8;
        } else {
          textLength += fontSize * 0.6;
        }
        // Add letter spacing between all characters (except after the last one)
        if (i < text.length - 1) {
          textLength += letterSpacing;
        }
      }

      // Circular path radius is 246.5, so circumference = 2 * π * 246.5
      const pathRadius = 246.5;
      const pathLength = 2 * Math.PI * pathRadius;

      // Calculate rotation to center the text
      // If text is shorter than path, calculate rotation to center it
      if (textLength < pathLength) {
        // Calculate what percentage of the path the text occupies
        const textPercent = (textLength / pathLength) * 100;
        // To center the text, we need to rotate by half of the remaining space
        // Convert percentage to degrees: (remaining% / 2) * (360 / 100)
        const centeringRotation = ((100 - textPercent) / 2) * (360 / 100);

        // Apply position offset and centering
        // For top: path is clockwise, rotate 180° to flip to bottom, then center
        // For bottom: path is counter-clockwise, text appears at bottom naturally, just center it
        if (props?.textPosition === "top") {
          return centeringRotation + 180;
        }
        // For bottom, we need to subtract the centering rotation to center it properly
        // because the path direction is counter-clockwise
        return -centeringRotation;
      }
      // If text is longer than path, just apply position offset
      return props?.textPosition === "top" ? 180 : 0;
    };

    const autoRotation = calculateTextRotation();
    // Combine auto-rotation with manual rotation if provided
    const totalRotation = autoRotation + (props?.textRotation || 0);

    return (
      <svg
        fill="none"
        height="593"
        id="FlamQR"
        style={{
          width: "100%",
          height: "100%",
        }}
        viewBox="0 0 593 593"
        width="593"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <circle
          cx="296.5"
          cy="296.5"
          fill={props?.bgColor || "rgb(255, 255, 255)"}
          id="background-circle"
          r="294.5"
        />
        <g id="circles-group">
          {circles.map((coord, index) => (
            <circle
              cx={coord.cx}
              cy={coord.cy}
              fill={props?.fgColor || "black"}
              id={`circle-${index}`}
              key={index}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
          ))}
        </g>

        <path
          d="M296.5 0C460.252 -7.15782e-06 593 132.748 593 296.5C593 460.252 460.253 593 296.5 593C132.748 593 7.15782e-06 460.252 0 296.5C-7.15788e-06 132.748 132.748 7.15788e-06 296.5 0ZM296.5 527.728C424.204 527.728 527.728 424.204 527.728 296.5C527.728 168.796 424.204 65.2713 296.5 65.2713C168.796 65.2713 65.2714 168.796 65.2714 296.5C65.2714 424.204 168.796 527.728 296.5 527.728Z"
          fill={props?.outerCircleColor || "black"}
          id="outer-circle-path"
          stroke={props?.strokeColor || "black"}
          strokeWidth={props?.strokeWidth || 0}
        />

        {/* Circular text path definition */}
        <defs>
          <path
            d={
              props?.textPosition === "top"
                ? "M 296.5,50 A 246.5,246.5 0 1,1 296.5,543 A 246.5,246.5 0 1,1 296.5,50"
                : "M 296.5,50 A 246.5,246.5 0 1,0 296.5,543 A 246.5,246.5 0 1,0 296.5,50"
            }
            id="circlePath"
          />
        </defs>
        {/* Customizable circular text */}
        <text
          dominantBaseline={props?.textPosition === "top" ? "auto" : "hanging"}
          fill={props?.textColor || "black"}
          fontFamily={props?.fontFamily || "Arial, Helvetica, sans-serif"}
          fontSize={props?.fontSize || 40}
          fontWeight={props?.fontWeight || "900"}
          id="text"
          letterSpacing={props?.fontLetterSpacing || 6}
          transform={
            totalRotation !== 0
              ? `rotate(${totalRotation} 296.5 296.5)`
              : undefined
          }
        >
          <textPath href="#circlePath" startOffset="0%" textAnchor="start">
            {props?.customText
              ? props.customText
              : "enter your text here * Flam It * enter your text here * Flam It * "}
          </textPath>
        </text>
        <text fill="none" id="text-path" stroke="black" strokeWidth="1">
          hello
        </text>
        <g fill="none" transform="translate(146.5, 146.5) scale(1.0)">
          {children}
        </g>
      </svg>
    );
  },
};
