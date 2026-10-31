import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { loadPublicPage } from "@/app/p/_lib/public-page";
import { env } from "@/lib/env";
import { type ContactProps, contactSchema } from "@/lib/landing/blocks/contact";
import { socialsSchema } from "@/lib/landing/blocks/socials";
import { checkPageLifecycle } from "@/lib/redirect/lifecycle";
import { getClientIp } from "@/lib/request-guards";
import { isValidSlug } from "@/lib/short-links";
import { buildVCard, type VCardPhoto, vcardFilename } from "./vcard";

// "Save contact" on hosted pages: /api/vcard/<page id or code slug>[?b=<block id>]
// → .vcf of the page's contact block (plus its social links).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

const MAX_PHOTO_BYTES = 1024 * 1024;
const PHOTO_TYPES: Record<string, "JPEG" | "PNG" | "GIF" | "WEBP"> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
};

function text(status: number, message: string, headers?: HeadersInit) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...headers,
    },
  });
}

/**
 * Embeds photos stored in our own R2 bucket (trusted host, size-capped);
 * any other photo is referenced by URL so we never fetch user-supplied URLs.
 */
async function resolvePhoto(
  url: string | undefined,
): Promise<VCardPhoto | null> {
  if (!url) return null;
  const base = env.R2_PUBLIC_BASE_URL;
  if (!(base && url.startsWith(`${base.replace(/\/+$/, "")}/`))) {
    return { kind: "uri", uri: url };
  }
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    const type =
      PHOTO_TYPES[
        (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? ""
      ];
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!(response.ok && type) || length > MAX_PHOTO_BYTES) {
      return { kind: "uri", uri: url };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PHOTO_BYTES) return { kind: "uri", uri: url };
    return {
      kind: "inline",
      base64: Buffer.from(bytes).toString("base64"),
      type,
    };
  } catch {
    return { kind: "uri", uri: url };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (ip !== "unknown") {
    try {
      const { success } = await ipLimiter.limit(`vcard:ip:${ip}`);
      if (!success) {
        return text(429, "Too many requests. Please try again in a minute.", {
          "Retry-After": "60",
        });
      }
    } catch {
      // Never block downloads because the limiter is down.
    }
  }

  const { slug } = await params;
  const customDomainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
  const page = await loadPublicPage(
    isValidSlug(slug) ? { slug } : { pageId: slug },
    customDomainId,
  ).catch((error: unknown) => {
    console.error("vCard page lookup failed:", error);
    return undefined;
  });
  if (page === undefined) return text(503, "Please try again.");
  if (!page) return text(404, "Contact not found.");

  // Password, schedule and pause rules apply to the contact file too.
  if ((await checkPageLifecycle(page.code)).action !== "allow") {
    return text(403, "This contact is not available.");
  }

  const blockId = request.nextUrl.searchParams.get("b");
  const block = page.content.blocks.find(
    (item) =>
      item.type === "contact" &&
      !item.hidden &&
      (!blockId || item.id === blockId),
  );
  const contact = block ? contactSchema.safeParse(block.props) : null;
  if (!contact?.success) return text(404, "Contact not found.");
  const props: ContactProps = contact.data;

  const socials = page.content.blocks.flatMap((item) => {
    if (item.type !== "socials" || item.hidden) return [];
    const parsed = socialsSchema.safeParse(item.props);
    return parsed.success ? parsed.data.items : [];
  });

  const vcard = buildVCard({
    contact: props,
    photo: await resolvePhoto(props.photo?.url),
    socials,
  });
  const filename = vcardFilename(props);

  return new Response(vcard, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
