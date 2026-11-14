import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";

// A 404 under app/[lang]: a first segment that isn't a locale (/pricng),
// or a page that doesn't exist in it (/es/docs).
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
