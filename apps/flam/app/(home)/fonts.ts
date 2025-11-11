import {
  Bebas_Neue,
  Dancing_Script,
  Lato,
  Merriweather,
  Montserrat,
  Open_Sans,
  Oswald,
  Pacifico,
  Playfair_Display,
  Poppins,
  Raleway,
  Roboto,
} from "next/font/google";

// Initialize Google Fonts
const roboto = Roboto({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const openSans = Open_Sans({
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
const montserrat = Montserrat({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const lato = Lato({
  weight: ["100", "300", "400", "700", "900"],
  subsets: ["latin"],
});
const oswald = Oswald({
  weight: ["200", "300", "400", "500", "600", "700"],
  subsets: ["latin"],
});
const raleway = Raleway({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const poppins = Poppins({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const merriweather = Merriweather({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const playfairDisplay = Playfair_Display({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const bebasNeue = Bebas_Neue({ weight: ["400"], subsets: ["latin"] });
const dancingScript = Dancing_Script({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const pacifico = Pacifico({ weight: ["400"], subsets: ["latin"] });

// Font options with their CSS font-family strings
export const fontOptions = [
  { name: "Roboto", value: roboto.style.fontFamily },
  { name: "Open Sans", value: openSans.style.fontFamily },
  { name: "Montserrat", value: montserrat.style.fontFamily },
  { name: "Lato", value: lato.style.fontFamily },
  { name: "Oswald", value: oswald.style.fontFamily },
  { name: "Raleway", value: raleway.style.fontFamily },
  { name: "Poppins", value: poppins.style.fontFamily },
  { name: "Merriweather", value: merriweather.style.fontFamily },
  { name: "Playfair Display", value: playfairDisplay.style.fontFamily },
  { name: "Bebas Neue", value: bebasNeue.style.fontFamily },
  { name: "Dancing Script", value: dancingScript.style.fontFamily },
  { name: "Pacifico", value: pacifico.style.fontFamily },
];
