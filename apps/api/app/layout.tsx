import type { ReactNode } from "react";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
