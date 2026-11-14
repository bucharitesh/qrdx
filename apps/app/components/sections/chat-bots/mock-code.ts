import "server-only";

import { CANONICAL_ORIGIN } from "@repo/config";
import type { QRProps } from "qrdx/types";
import { QR_DEFAULTS } from "@/lib/qr-render";

// The code the chat bot mockups draw: the same code the bots send. Every bot
// reply is the keyless image API's PNG at its defaults (lib/chat-bots/
// qr-reply.ts), so the mock renders QR_DEFAULTS with the qrdx engine, for
// the value typed in each mock. tests/lib/showcase-styles.test.ts checks it
// scans.

/** What the person in each mock sends the bot. */
export const CHAT_MOCK_VALUE = CANONICAL_ORIGIN;

export const CHAT_MOCK_CODE: QRProps = {
  value: CHAT_MOCK_VALUE,
  // 25 modules (version 2 at Q) plus a 4-module margin on each side, at
  // 4 px each: whole-number coordinates keep the markup small.
  size: 132,
  level: QR_DEFAULTS.level,
  fgColor: QR_DEFAULTS.fg,
  bgColor: QR_DEFAULTS.bg,
  bodyPattern: QR_DEFAULTS.body,
  cornerEyePattern: QR_DEFAULTS.eye,
  cornerEyeDotPattern: QR_DEFAULTS.dot,
  margin: QR_DEFAULTS.margin,
};
