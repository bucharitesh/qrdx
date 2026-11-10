import "server-only";
import type { Metadata } from "next";
import { requireAdmin } from "./guard";

/**
 * An admin page's `generateMetadata`: the title is resolved only after the
 * admin check passes. Don't use a static `metadata` export on admin pages:
 * Next resolves it alongside the layout, not after it, and streams it into
 * the 404 a visitor gets, so the page's title would reach someone who isn't
 * an admin. For them this throws the same 404 as the page, and Next falls
 * back to the site's "Page not found" metadata.
 */
export function adminMetadata(title: string) {
  return async function generateMetadata(): Promise<Metadata> {
    await requireAdmin();
    // Absolute: admin tabs read "Admin · Health", without the site's suffix.
    return { title: { absolute: title } };
  };
}
