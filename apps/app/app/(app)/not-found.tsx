import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
