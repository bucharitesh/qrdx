import type { Metadata } from "next";
import { DocsNotFound } from "@/components/not-found";
import { TrackOnMount } from "@/lib/analytics/react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <TrackOnMount event="404_viewed" props={{ area: "docs" }} />
      <DocsNotFound />
    </>
  );
}
