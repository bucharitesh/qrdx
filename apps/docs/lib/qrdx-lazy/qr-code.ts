// The engine's QRCode on its own, for React.lazy: a dynamic import of "qrdx"
// itself would load the whole package namespace, the official frame library
// included (hundreds of specs the preview never needs).
export { QRCode } from "qrdx";
