import { cn } from "@repo/design-system/lib/utils";
import { Wifi } from "iconsax-reactjs";
import {
  bodyPath,
  eyePath,
  type GlyphOptions,
  type Matrix,
} from "@/components/fx/qr-glyph";
import { QRDX_QR_H, QRDX_QR_M } from "@/components/fx/qr-matrix";
import styles from "./header-nav-panel.module.css";

/**
 * The featured cards' artwork in the header mega menu: real, scannable codes
 * for https://qrdx.dev (precomputed with the qrdx encoder in fx/qr-matrix)
 * drawn as inline SVG in the brand's monochrome, so they stay sharp at any
 * zoom and cost no image request.
 */
export type NavArtKind = "design" | "generators" | "code";

const QUIET = 2;

/** Path data per matrix and style, built on a menu's first open. */
const cache = new WeakMap<
  Matrix,
  Map<string, { body: string; eyes: string }>
>();

function QrGlyph({
  matrix,
  options,
  className,
}: {
  matrix: Matrix;
  options: GlyphOptions;
  className?: string;
}) {
  const size = matrix.length;
  const key = `${options.shape}:${options.eyeRadius}:${options.hole ?? 0}`;
  let styled = cache.get(matrix);
  if (!styled) {
    styled = new Map();
    cache.set(matrix, styled);
  }
  let paths = styled.get(key);
  if (!paths) {
    paths = {
      body: bodyPath(matrix, options),
      eyes: eyePath(size, options.eyeRadius),
    };
    styled.set(key, paths);
  }
  const box = size + QUIET * 2;
  const square = options.shape === "square";

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`}
      fill="currentColor"
      className={cn("block", className)}
    >
      <path d={paths.body} shapeRendering={square ? "crispEdges" : undefined} />
      <path
        d={paths.eyes}
        fillRule="evenodd"
        shapeRendering={options.eyeRadius === 0 ? "crispEdges" : undefined}
      />
    </svg>
  );
}

/** The Playground: a designed code, dot modules and soft corners. */
function DesignArt() {
  return (
    <span className={cn(styles.paper, "rounded-[14px]")}>
      {/* 29 units at 4 px each. */}
      <QrGlyph
        matrix={QRDX_QR_M}
        options={{ shape: "dot", eyeRadius: 2.2 }}
        className="size-[116px] text-current"
      />
    </span>
  );
}

/** The generators: a classic code with a content-type badge in the middle. */
function GeneratorsArt() {
  return (
    <span className={cn(styles.paper, "relative rounded-[12px]")}>
      {/* 33 units at 3 px each: whole-pixel modules for crispEdges. */}
      <QrGlyph
        matrix={QRDX_QR_H}
        options={{ shape: "square", eyeRadius: 0, hole: 9 }}
        className="size-[99px] text-current"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-[22px] place-items-center rounded-[6px] bg-current">
          <Wifi
            aria-hidden
            variant="Bold"
            className="size-3.5 text-[var(--art-bg)]"
          />
        </span>
      </span>
    </span>
  );
}

/** The docs: the two lines it takes, and the code they draw. */
function CodeArt() {
  return (
    <span className="relative flex w-full flex-col">
      <span
        className={cn(
          styles.paper,
          "flex flex-col overflow-hidden rounded-[10px] font-mono text-[10px] leading-[1.7]",
        )}
      >
        <span
          className={cn(styles.inkMuted, styles.rule, "border-b px-2.5 py-1")}
        >
          app.tsx
        </span>
        <span className="flex flex-col whitespace-pre px-2.5 pt-1.5 pb-6">
          <span>
            <span className={styles.inkMuted}>import</span>
            {" { QRCode } "}
            <span className={styles.inkMuted}>from</span>
            <span className={styles.inkMuted}>{' "qrdx"'}</span>
            {";"}
          </span>
          <span>
            {"<QRCode "}
            <span className={styles.inkMuted}>value=</span>
            <span className={styles.inkMuted}>"qrdx.dev"</span>
            {" />"}
          </span>
        </span>
      </span>
      <span className={cn(styles.paper, "-mt-6 mr-3 self-end rounded-[9px]")}>
        {/* 29 units at 2 px each. */}
        <QrGlyph
          matrix={QRDX_QR_M}
          options={{ shape: "square", eyeRadius: 0 }}
          className="size-[58px] text-current"
        />
      </span>
    </span>
  );
}

export function NavArt({ kind }: { kind: NavArtKind }) {
  if (kind === "code") return <CodeArt />;
  if (kind === "generators") return <GeneratorsArt />;
  return <DesignArt />;
}
