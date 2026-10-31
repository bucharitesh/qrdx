import type { BodyPattern, CornerEyeDotPattern, CornerEyePattern } from "qrdx";
import { QrCode } from "@/registry/qrdx/qr-code";

const patterns: {
  body: BodyPattern;
  eye: CornerEyePattern;
  dot: CornerEyeDotPattern;
}[] = [
  { body: "square", eye: "square", dot: "square" },
  { body: "circle", eye: "circle", dot: "circle" },
  { body: "rounded", eye: "extra-rounded", dot: "rounded" },
  { body: "diamond", eye: "pointy", dot: "octagon" },
];

export default function QrCodePatterns() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {patterns.map(({ body, eye, dot }) => (
        <QrCode
          bodyPattern={body}
          caption={body}
          cornerEyeDotPattern={dot}
          cornerEyePattern={eye}
          downloadFormats={[]}
          key={body}
          size={112}
          value="https://qrdx.dev"
        />
      ))}
    </div>
  );
}
