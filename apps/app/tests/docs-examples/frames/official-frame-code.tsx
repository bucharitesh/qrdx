import { getOfficialFrame, QRCode } from "qrdx";

const diwali = getOfficialFrame("diwali-diya"); // undefined for an unknown id

export function OfficialFrameCode() {
  return diwali ? (
    <QRCode
      value="https://example.com/offers"
      size={256}
      frame={{ style: "custom", spec: diwali.spec, text: "Scan for offers" }}
    />
  ) : null;
}
