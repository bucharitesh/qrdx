import type { Metadata } from "next";
import { DocsNotFound } from "@/components/not-found";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return <DocsNotFound />;
}
