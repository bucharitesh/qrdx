import { NextProvider } from "fumadocs-core/framework/next";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import type React from "react";
import { source } from "@/lib/source";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <NextProvider>
      <TreeContextProvider tree={source.pageTree}>
        {children}
      </TreeContextProvider>
    </NextProvider>
  );
};

export default Layout;
