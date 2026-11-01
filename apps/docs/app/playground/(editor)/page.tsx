import type { Metadata } from "next";
import { LazyEditor as Editor } from "@/components/lazy-editor";
import { playgroundMetadata } from "../metadata";

export const metadata: Metadata = playgroundMetadata;

// The bare playground is static (prerendered and served from the CDN);
// shared /playground/<themeId> links render per request in [...qrId].
export default function PlaygroundPage() {
  return <Editor themePromise={Promise.resolve(null)} />;
}
