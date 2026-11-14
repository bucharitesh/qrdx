import { getTemplate, QRCode } from "qrdx";

const spec = getTemplate("Arrow")?.spec;

export function ArrowFrameCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      frame={spec && { style: "custom", spec, color: "#1a56db" }}
    />
  );
}
