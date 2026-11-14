import { cn } from "@repo/design-system/lib/utils";
import { Mobile as Smartphone } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  buttonShapeClass,
  imageSchema,
  lineText,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
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

/** The web button's default label (QRdx's words until the owner edits it). */
const WEB_LABEL = "Open in your browser";

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
    webLabel: lineText(40).default(WEB_LABEL),
  })
  .refine(
    (apps) => Boolean(apps.appStoreUrl || apps.playStoreUrl || apps.webUrl),
    { message: "Add at least one store or web link", path: ["appStoreUrl"] },
  );

export type AppsProps = z.output<typeof appsSchema>;

/** The store buttons' words; English unless the block passes translations. */
export interface AppLinkLabels {
  ios: string;
  android: string;
  web: string;
}

const ENGLISH_LABELS: AppLinkLabels = {
  ios: "Download on the App Store",
  android: "Get it on Google Play",
  web: WEB_LABEL,
};

export function appLinks(
  props: AppsProps,
  labels: AppLinkLabels = ENGLISH_LABELS,
): AppLink[] {
  const links: AppLink[] = [];
  if (props.appStoreUrl) {
    links.push({ kind: "ios", href: props.appStoreUrl, label: labels.ios });
  }
  if (props.playStoreUrl) {
    links.push({
      kind: "android",
      href: props.playStoreUrl,
      label: labels.android,
    });
  }
  if (props.webUrl) {
    links.push({
      kind: "web",
      href: props.webUrl,
      // The default label is QRdx's words; one the owner typed is theirs.
      label:
        props.webLabel && props.webLabel !== WEB_LABEL
          ? props.webLabel
          : labels.web,
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
  const t = useTranslations("scanPages.hosted.apps");
  const links = appLinks(props, {
    ios: t("appStore"),
    android: t("googlePlay"),
    web: t("openInBrowser"),
  });
  if (links.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={props.name ? titleId : undefined}
      aria-label={props.name ? undefined : t("getTheApp")}
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
              loading={context.thumbnail ? "lazy" : undefined}
              src={props.icon.url}
              width={64}
            />
          )}
          <div className="min-w-0 space-y-1">
            {props.name && (
              <LpHeading
                as="h2"
                preview={context.thumbnail}
                className="text-lg leading-tight font-semibold"
                id={titleId}
              >
                {props.name}
              </LpHeading>
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
        shapeClassName={buttonShapeClass(context.theme)}
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
