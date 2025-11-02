import type { TemplateDefinition } from "../templates";

export const defaultTemplate: TemplateDefinition = {
  id: "default",
  name: "Default",
  description: "Simple QR code without decorative elements",
  wrapper: (children) => (
    <svg
      height="300"
      id="svgQrWrapper"
      style={{
        width: "100%",
        height: "100%",
        // backgroundColor: props?.bgColor || "rgb(255, 255, 255)",
      }}
      viewBox="0 0 300 300"
      width="300"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <g fill="none" transform="translate(9, 9) scale(0.95)">
        {children}
      </g>
    </svg>
  ),
};
