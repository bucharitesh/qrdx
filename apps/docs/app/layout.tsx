import "./global.css";
import { NextProvider } from "fumadocs-core/framework/next";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { Inter } from "next/font/google";
import { source } from "@/lib/source";
import { Body } from "./layout.client";
import { Provider } from "./providers";

const inter = Inter({
  subsets: ["latin"],
});

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html className={inter.className} lang="en" suppressHydrationWarning>
      <Body>
        <NextProvider>
          <TreeContextProvider tree={source.pageTree}>
            <Provider>{children}</Provider>
          </TreeContextProvider>
        </NextProvider>
      </Body>
    </html>
  );
}
