import type { TemplateDefinition } from "../../types";

// Custom props for FlamQR template
export type FlamQRProps = {
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight: number;
  fontLetterSpacing?: number;
  fontFamily?: string;
  outerStrokeWidth?: number;
  innerStrokeWidth?: number;
};

export const FlamQR: TemplateDefinition<FlamQRProps> = {
  id: "FlamQR",
  name: "Flam QR",
  description: "Flam QR code with Flam logo and text",
  wrapper: (children, props, templateConfig) => {
    const pixelSize = templateConfig?.pixelSize
      ? templateConfig?.pixelSize * 0.5
      : 4.413_793_103_448_276 * 0.55;

    return (
      <svg
        fill="none"
        height="593"
        id="svgQrWrapper"
        style={{
          width: "100%",
          height: "100%",
        }}
        viewBox="0 0 593 593"
        width="593"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
      >
        <svg
          height="593"
          viewBox="0 0 593 593"
          width="593"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g>
            {/* Background circle */}
            <circle
              cx="296.5"
              cy="296.5"
              fill={props?.bgColor || "rgb(255, 255, 255)"}
              r="294.5"
            />
            <circle
              cx="508.792"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="351.368"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="241.823"
              cy="82.7775"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="85.313"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="508.792"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="332.957"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="260.235"
              cy="82.7775"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="85.313"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="260.235"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="508.792"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="314.546"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="278.646"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="85.313"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="508.792"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="508.792"
              cy="312.932"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="296.135"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="297.057"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="85.313"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="508.792"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="315.467"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="85.313"
              cy="312.932"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="277.724"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="508.792"
              cy="349.753"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="259.313"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="333.878"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="85.313"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="240.902"
              cy="506.255"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="352.289"
              cy="82.778"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="85.313"
              cy="349.753"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="378.993"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="214.198"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="94.527"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="369.788"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="223.404"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="360.573"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="232.610"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="94.527"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="342.163"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="251.029"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="499.586"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="296.135"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="297.057"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="499.586"
              cy="377.379"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="193.251"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="202.458"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="231.697"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="361.495"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="222.491"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="370.700"
              cy="91.991"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="213.277"
              cy="497.050"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="94.527"
              cy="377.379"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="397.404"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="195.787"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="193.251"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="388.199"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="204.993"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="103.732"
              cy="202.458"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="490.380"
              cy="312.932"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="369.788"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="223.404"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="490.380"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="351.368"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="241.823"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="490.380"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="332.957"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="260.235"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="386.584"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="490.380"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="314.546"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="278.646"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="103.732"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="481.175"
              cy="174.840"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="481.175"
              cy="184.046"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="296.135"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="297.057"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="103.732"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="481.175"
              cy="202.458"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="277.724"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="312.932"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="315.467"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="481.175"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="259.313"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="333.878"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="481.175"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="231.697"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="103.732"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="222.491"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="370.700"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="481.175"
              cy="303.726"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="204.072"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="389.120"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="103.732"
              cy="386.584"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="398.326"
              cy="101.196"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="481.175"
              cy="349.753"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="103.732"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="194.866"
              cy="487.844"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="415.815"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="177.376"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="112.938"
              cy="174.840"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="481.175"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="406.610"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="186.582"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="184.046"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="481.175"
              cy="414.201"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="388.199"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="204.993"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="202.458"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="471.969"
              cy="165.635"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="184.046"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="360.573"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="232.610"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="314.546"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="278.646"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="471.969"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="286.930"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="306.262"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="303.726"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="471.969"
              cy="266.904"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="471.969"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="471.969"
              cy="340.548"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="194.866"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="398.326"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="176.455"
              cy="478.639"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="416.736"
              cy="110.402"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="112.938"
              cy="414.201"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="386.584"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="425.021"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="168.171"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="165.635"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="404.995"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="414.201"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="406.610"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="186.582"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="184.046"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="471.969"
              cy="423.406"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="156.429"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="378.993"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="214.198"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="462.764"
              cy="165.635"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="369.788"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="223.404"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="220.868"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="193.251"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="342.163"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="251.029"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="332.957"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="260.235"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="257.699"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="323.751"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="269.440"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="266.904"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="266.904"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="305.341"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="287.851"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="285.315"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="462.764"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="296.135"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="297.057"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="462.764"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="303.726"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="322.137"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="259.313"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="333.878"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="250.107"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="343.084"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="340.548"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="349.753"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="222.491"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="370.700"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="368.165"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="377.379"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="204.072"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="389.120"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="386.584"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="462.764"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="404.995"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="185.661"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="407.531"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="404.995"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="462.764"
              cy="423.406"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="176.455"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="416.736"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="122.144"
              cy="414.201"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="462.764"
              cy="432.611"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="453.558"
              cy="147.224"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="167.250"
              cy="469.433"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="425.942"
              cy="119.608"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="122.144"
              cy="423.406"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="434.226"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="158.965"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="156.429"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="425.021"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="168.171"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="165.635"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="453.558"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="397.404"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="195.787"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="131.349"
              cy="193.251"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="378.993"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="214.198"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="211.662"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="360.573"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="232.610"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="230.073"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="342.163"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="251.029"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="248.493"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="453.558"
              cy="349.753"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="323.751"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="269.440"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="266.904"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="314.546"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="278.646"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="276.110"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="296.135"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="297.057"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="294.521"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="453.558"
              cy="441.817"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="286.930"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="306.262"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="303.726"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="268.518"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="324.673"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="322.137"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="259.313"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="333.878"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="331.343"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="245.008"
              cy="461.008"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="352.289"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.008"
              cy="348.008"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="231.697"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="361.495"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="358.959"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="213.277"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="379.914"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="131.349"
              cy="377.379"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="194.866"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="398.326"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="395.789"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="185.661"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="407.531"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="404.995"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="167.250"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="425.942"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="423.406"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="435.008"
              cy="144.008"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="158.044"
              cy="460.228"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="435.147"
              cy="128.813"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="131.349"
              cy="432.611"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="443.432"
              cy="451.022"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="149.760"
              cy="138.018"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="140.555"
              cy="147.224"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="351.368"
              cy="451.022"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="140.555"
              cy="239.288"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <circle
              cx="245.008"
              cy="451.008"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="140.008"
              cy="348.008"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="148.839"
              cy="451.022"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="444.353"
              cy="138.018"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />
            <circle
              cx="140.555"
              cy="441.817"
              fill={props?.fgColor || "black"}
              r={pixelSize}
              transform="rotate(0,10.378378378378379,121.0810810810811)"
            />

            <path
              d="M295.518 528.173C422.926 528.173 526.21 424.889 526.21 297.482C526.21 170.074 422.926 66.79 295.518 66.79C168.111 66.79 64.8267 170.074 64.8267 297.482C64.8267 424.889 168.111 528.173 295.518 528.173Z"
              stroke={props?.fgColor || "black"}
              strokeWidth={props?.innerStrokeWidth || 0}
            />
            <path
              d="M296.5 591C459.148 591 591 459.148 591 296.5C591 133.852 459.148 2 296.5 2C133.852 2 2 133.852 2 296.5C2 459.148 133.852 591 296.5 591Z"
              stroke={props?.fgColor || "black"}
              strokeWidth={props?.outerStrokeWidth || 0}
            />

            {/* Circular text path definition */}
            <defs>
              <path
                d="M 296.5,50 A 246.5,246.5 0 1,1 296.5,543 A 246.5,246.5 0 1,1 296.5,50"
                id="circlePath"
              />
            </defs>
            {/* Customizable circular text */}
            <text
              fill={props?.textColor || "black"}
              fontFamily={props?.fontFamily || "Arial, Helvetica, sans-serif"}
              fontSize={props?.fontSize || 40}
              fontWeight={props?.fontWeight || "900"}
              letterSpacing={props?.fontLetterSpacing || 6}
            >
              <textPath href="#circlePath" startOffset="0%" textAnchor="start">
                {props?.customText
                  ? new Array(props.customText.length)
                      .fill(props.customText)
                      .join(" * Flam It * ")
                  : "enter your text here * Flam It * enter your text here * Flam It * "}
              </textPath>
            </text>
            <g fill="none" transform="translate(146.5, 146.5) scale(1.0)">
              {children}
            </g>
          </g>
        </svg>
      </svg>
    );
  },
};
