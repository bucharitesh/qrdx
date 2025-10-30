import { Dithering } from "@paper-design/shaders-react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type React from "react";
import { Suspense } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "v0 | Nano Banana Starter",
  description: "Created with v0",
  generator: "v0.app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${inter.variable} ${jetbrainsMono.variable}`} lang="en">
      <body className="font-mono antialiased">
        <Suspense fallback={null}>
          <div className="relative z-10">
            {children}
          </div>
        </Suspense>
        <div className="fixed inset-0 z-0 select-none">
          <Dithering
            colorBack="#00000000"
            colorFront="#ffffff"
            scale={1.13}
            shape="wave"
            speed={0.43}
            style={{
              backgroundColor: "#000000",
              height: "100vh",
              width: "100vw",
            }}
            type="4x4"
          />
        </div>
      </body>
    </html>
  );
}
