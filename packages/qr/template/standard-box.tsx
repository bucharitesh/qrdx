import type { TemplateDefinition } from "../templates";

export const StandardBox: TemplateDefinition = {
  id: "StandardBox",
  name: "Standard Box",
  description: "QR code with standard box",
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
        fill="#000000"
        height="300"
        viewBox="0 0 300 300"
        width="300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M243,1.7h-186a10.25,10.25,0,0,0-10.2,10.12v186A10.13,10.13,0,0,0,57,208H243a10.13,10.13,0,0,0,10.12-10.12v-186A10.13,10.13,0,0,0,243,1.7Zm2.36,193.05a5.46,5.46,0,0,1-5.47,5.47H60.16a5.46,5.46,0,0,1-5.47-5.47V14.93a5.46,5.46,0,0,1,5.47-5.47H239.91a5.46,5.46,0,0,1,5.47,5.47Z"
          fill={props?.fgColor || "black"}
        />
        <path
          d="M243.54,238.81H173.61a2.29,2.29,0,0,1-1.62-.67l-20.55-20.55a2.33,2.33,0,0,0-3.25,0l-20.55,20.55a2.29,2.29,0,0,1-1.62.67H56.09A9.15,9.15,0,0,0,46.93,248v41.17a9.16,9.16,0,0,0,9.16,9.16H243.61a9.09,9.09,0,0,0,9.09-9.16V248A9.16,9.16,0,0,0,243.54,238.81Z"
          fill={props?.fgColor || "black"}
        />
        <g fill="none" transform="translate(60, 15)scale(0.6)">
          {children}
        </g>
      </svg>
    </svg>
  ),
};
