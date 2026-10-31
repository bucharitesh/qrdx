import { cn } from "@repo/design-system/lib/utils";
import { Smartphone } from "lucide-react";
import { z } from "zod";
import {
  imageSchema,
  lineText,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { landingUrlSchema } from "@/types/landing";
import {
  type BlockRenderContext,
  type BlockRenderProps,
  registerBlock,
} from "../registry";
import { AppsEditor } from "./apps-editor";
import { AppsLinks } from "./apps-links";
import {
  APP_STORE_HOSTS,
  type AppLink,
  type AppPlatform,
  detectAppPlatform,
  hostIn,
  PLAY_STORE_HOSTS,
} from "./apps-platform";

const storeUrl = (hosts: string[], message: string) =>
  landingUrlSchema
    .refine((url) => hostIn(url, hosts), message)
    .or(z.literal(""))
    .default("");

export const appsSchema = z
  .object({
    name: lineText(80).default(""),
    description: longText(300).default(""),
    icon: imageSchema.optional(),
    appStoreUrl: storeUrl(APP_STORE_HOSTS, "Use your apps.apple.com link"),
    playStoreUrl: storeUrl(PLAY_STORE_HOSTS, "Use your play.google.com link"),
    webUrl: landingUrlSchema.or(z.literal("")).default(""),
    webLabel: lineText(40).default("Open in your browser"),
  })
  .refine(
    (apps) => Boolean(apps.appStoreUrl || apps.playStoreUrl || apps.webUrl),
    { message: "Add at least one store or web link", path: ["appStoreUrl"] },
  );

export type AppsProps = z.output<typeof appsSchema>;

export function appLinks(props: AppsProps): AppLink[] {
  const links: AppLink[] = [];
  if (props.appStoreUrl) {
    links.push({
      kind: "ios",
      href: props.appStoreUrl,
      label: "Download on the App Store",
    });
  }
  if (props.playStoreUrl) {
    links.push({
      kind: "android",
      href: props.playStoreUrl,
      label: "Get it on Google Play",
    });
  }
  if (props.webUrl) {
    links.push({
      kind: "web",
      href: props.webUrl,
      label: props.webLabel || "Open in your browser",
    });
  }
  return links;
}

/**
 * The visitor's platform when the renderer passes the request's user agent
 * in the render context (`userAgent`); undefined = detect in the browser.
 */
function serverPlatform(context: BlockRenderContext): AppPlatform | undefined {
  if (context.mode !== "live") return undefined;
  const { userAgent } = context as BlockRenderContext & {
    userAgent?: string | null;
  };
  return userAgent === undefined ? undefined : detectAppPlatform(userAgent);
}

export function AppsBlock({ id, props, context }: BlockRenderProps<AppsProps>) {
  const links = appLinks(props);
  if (links.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={props.name ? titleId : undefined}
      aria-label={props.name ? undefined : "Get the app"}
      className={cn(surfaceClass, "space-y-4 p-5")}
    >
      {(props.icon || props.name || props.description) && (
        <div className="flex items-center gap-4">
          {props.icon && (
            <img
              alt={props.icon.alt}
              className="size-16 shrink-0 rounded-[22%] object-cover shadow-sm"
              decoding="async"
              height={64}
              src={props.icon.url}
              width={64}
            />
          )}
          <div className="min-w-0 space-y-1">
            {props.name && (
              <h2 className="text-lg leading-tight font-semibold" id={titleId}>
                {props.name}
              </h2>
            )}
            {props.description && (
              <p className={cn(mutedTextClass, "text-sm whitespace-pre-line")}>
                {props.description}
              </p>
            )}
          </div>
        </div>
      )}
      <AppsLinks
        blockId={id}
        links={links}
        platform={serverPlatform(context)}
      />
    </section>
  );
}

registerBlock({
  type: "apps",
  category: "links",
  label: "App download",
  description:
    "App Store, Google Play and web links; the visitor's store comes first",
  icon: Smartphone,
  schema: appsSchema,
  defaults: {
    name: "Our app",
    webUrl: "https://example.com",
  },
  Render: AppsBlock,
  Editor: AppsEditor,
});
