// The payloads every published design is scored with (lib/community/
// scan-gate.ts): a short link and Wi-Fi details with a 20-character
// password, the two most common things people put in a styled code. Shared
// with the client so the publish dialog can name them.
//
// A contact card isn't a sample: its density alone fails the 96 px read, so
// 40 of the 72 built-in styles score below Great with it (measured
// 2026-11-03 with lib/qr-design/score.ts), while 63 of them are Great with
// both of these.

export const MIN_GATE_SCORE = 85;

export const GATE_SAMPLES = [
  {
    id: "link",
    label: "a link",
    value: "https://qrdx.dev/community",
  },
  {
    id: "wifi",
    label: "Wi-Fi details",
    value: "WIFI:T:WPA;S:Harbour Cafe Guest;P:harbour-sunrise-2026;;",
  },
] as const;

export type GateSample = (typeof GATE_SAMPLES)[number];
