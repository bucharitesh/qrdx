// Web app manifest for the scanner, so "Add to Home Screen" on /scan installs
// a standalone scanner that opens straight to the camera page.

export const dynamic = "force-static";

const manifest = {
  id: "/scan",
  name: "QRdx QR Code Scanner",
  short_name: "QRdx Scan",
  description:
    "Scan QR codes and barcodes with your camera or an image, with a safe-link preview before anything opens.",
  start_url: "/scan",
  scope: "/scan",
  display: "standalone",
  orientation: "portrait",
  theme_color: "#10b981",
  background_color: "#0a0a0a",
  categories: ["utilities", "productivity"],
  icons: [
    {
      src: "/web-app-manifest-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/web-app-manifest-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
