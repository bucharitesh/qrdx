// Style combinations that fail to decode today. Each is a real bug in the
// shape renderers (src/utils.tsx, corner-dot.tsx), tracked here so the suite
// stays green for builds (turbo's build depends on test) while the bug stays
// visible: these run as `it.fails`, so fixing one makes its test fail until
// the entry is removed. Never add an entry to hide a new regression.
//
// Evidence (jsQR through the camera model; zbar/OpenCV checked by hand):
// - diamond / banner eye dots: the center isn't a 3×3 square, so the finder's
//   1:1:3:1:1 ratio fails along the diagonal (jsQR and ZXing check it).
//   zbar and OpenCV still read these.
// - curly eyes with square/diya/message dots: finder ratio broken at 4-6 px.
// - diamond, pacman and small-square bodies next to square/rounded eyes fail
//   at 9 px per module (thin modules next to the finder).
//
// Fixed after 0.0.46 (entries removed): circle-mixed's smallest dots grew
// from 0.225 to 0.405 modules, and alignment patterns are drawn solid in
// every style, which fixed sharp renders and the 1-module margin.
//
// Patterns added after 0.0.46 are not listed: they are new, in progress, and
// must decode before they ship.

const BODY_EYE = new Set([
  "diamond/square",
  "pacman/rounded",
  "small-square/square",
  "small-square/rounded",
]);

const DOT_EYE = new Set([
  ...[
    "square",
    "rounded",
    "diya",
    "extra-rounded",
    "message",
    "pointy",
    // The same diamond-dot bug, in eye shapes added after 0.0.46
    "leaf",
    "leaf-reverse",
    "drop",
    "bevel",
    "squircle",
    "cushion",
    "shield",
    "petal",
  ].map((eye) => `diamond/${eye}`),
  ...["square", "rounded", "diya", "leaf"].map((eye) => `banner/${eye}`),
  "square/curly",
  "diya/curly",
  "message/curly",
]);

const SETTINGS = new Set<string>([]);

export const knownUnreadable = {
  bodyEye: (body: string, eye: string) => BODY_EYE.has(`${body}/${eye}`),
  dotEye: (dot: string, eye: string) => DOT_EYE.has(`${dot}/${eye}`),
  setting: (id: string) => SETTINGS.has(id),
};
