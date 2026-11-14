import { QRCode, type TemplateDefinition } from "qrdx";

const ringTemplate: TemplateDefinition = {
  id: "ring",
  name: "Ring",
  wrapper: (children, props) => (
    <svg
      viewBox="0 0 300 300"
      width="300"
      height="300"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="150"
        cy="150"
        r="140"
        fill="none"
        stroke={props?.fgColor ?? "#000000"}
        strokeWidth="8"
      />
      {/* The code at half size, centered */}
      <g transform="translate(75, 75) scale(0.5)">{children}</g>
    </svg>
  ),
};

export function RingTemplateCode() {
  return (
    <QRCode
      value="https://example.com"
      size={256}
      customTemplate={ringTemplate}
      fgColor="#1a56db"
    />
  );
}
