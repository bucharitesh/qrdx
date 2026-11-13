/** biome-ignore-all lint/performance/noBarrelFile: the auto-define entry re-exports the element */
// qrdx/element/define: importing it registers <qrdx-code>. qrdx/element
// itself never registers anything, so an app can pick its own tag name.

import { defineQRdxCode } from "./element";

defineQRdxCode();

export * from "./element";
