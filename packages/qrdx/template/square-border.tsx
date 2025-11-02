import type { TemplateDefinition } from "../templates";

export const SquareBorder: TemplateDefinition = {
  id: "SquareBorder",
  name: "Square Border",
  description: "QR code with square decorative border",
  wrapper: (children, props) => (
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
      <svg
        fill={"black"}
        height="300"
        viewBox="0 0 316 316"
        width="300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <path
            clipRule="evenodd"
            d="M308 8H8v300h300V8ZM0 0v316h316V0H0Z"
            fill={props?.fgColor || "black"}
            fillRule="evenodd"
          />
          <g fill="none" transform="translate(20, 20) scale(0.92)">
            {children}
          </g>
        </g>
      </svg>
    </svg>
  ),
};
