/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */
import { BRAND_NAME, GITHUB_REPO_URL, SUPPORT_EMAIL } from "@repo/config";
import { Bot, GithubLogo } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrangeHorizontal,
  Barcode,
  Book1,
  Box,
  Buildings,
  Category,
  Clock,
  Code1,
  DocumentCode,
  ElementPlus,
  Lifebuoy,
  Link21,
  MagicStar,
  MessageProgramming,
  MessageQuestion,
  Mobile,
  Notepad2,
  PenTool2,
  People,
  Routing2,
  Ruler,
  Scan,
  TableDocument,
  Verify,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import type { Messages } from "@/lib/i18n/messages";

/** Copy for the header and footer lives in messages/<locale>.json (nav, footer). */
type NavItemKey = keyof Messages["nav"]["items"];

export interface NavItemConfig {
  key: NavItemKey;
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  external?: boolean;
  /** Shown as the large panel on the left of the dropdown. */
  featured?: boolean;
  /** The group's hub page: the footer link of the dropdown. */
  hub?: boolean;
}

export interface NavEntryConfig {
  id: number;
  key: keyof Messages["nav"]["entries"];
  href: string;
  items?: NavItemConfig[];
}

type FooterLinkKey = keyof Messages["footer"]["links"];

/** `key` names translated copy; `label` is a name that's never translated. */
export type FooterLinkConfig = { id: number; url: string } & (
  | { key: FooterLinkKey; label?: never }
  | { label: string; key?: never }
);

export interface FooterGroupConfig {
  id: number;
  key: FooterLinkKey;
  children: FooterLinkConfig[];
  url?: never;
}

export interface FooterColumnConfig {
  key: keyof Messages["footer"]["columns"];
  links: (FooterLinkConfig | FooterGroupConfig)[];
}

export const Highlight = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <span
      className={cn(
        "p-1 py-0.5 font-medium dark:font-semibold text-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
};

export const siteConfig = {
  name: BRAND_NAME,
  description:
    "Free, open-source QR code generator. Custom patterns, gradients, logos and frames, with PNG, JPG, SVG, PDF and EPS downloads and no signup. Plus dynamic codes, hosted pages and scan analytics.",
  cta: "Try the Playground",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  keywords: [
    "Free QR Code Generator",
    "Dynamic QR Codes",
    "QR Code with Logo",
    "QR Code Landing Pages",
    "Open Source QR Code Generator",
    "QR Code API",
  ],
  links: {
    email: SUPPORT_EMAIL,
    github: GITHUB_REPO_URL,
  },
  nav: {
    // Top-level header entries. `href` is the group's hub (used on mobile);
    // entries with `items` render as a dropdown on desktop. A `featured` item
    // gets the large panel on the left; a `hub` item becomes the footer link.
    // Each page appears once (desktop and mobile both read this list); the
    // MCP server's connect page (/mcp) sits under Developers.
    links: [
      {
        id: 1,
        key: "product",
        href: "/playground",
        items: [
          {
            key: "playground",
            href: "/playground",
            icon: PenTool2,
            featured: true,
          },
          // The landing page; it links the dynamic codes docs.
          {
            key: "dynamicCodes",
            href: "/dynamic-qr-code",
            icon: Routing2,
          },
          {
            key: "aiThemes",
            href: "/ai",
            icon: Bot,
          },
          {
            key: "aiArt",
            href: "/ai/art",
            icon: MagicStar,
          },
          {
            key: "communityThemes",
            href: "/community",
            icon: People,
          },
          {
            key: "pageTemplates",
            href: "/templates",
            icon: Mobile,
          },
        ],
      },
      {
        id: 2,
        key: "tools",
        href: "/tools",
        items: [
          {
            key: "generators",
            href: "/qr-code-generator",
            icon: Category,
            featured: true,
          },
          {
            key: "bulk",
            href: "/tools/bulk",
            icon: TableDocument,
          },
          {
            key: "scanner",
            href: "/scan",
            icon: Scan,
          },
          {
            key: "scanChecker",
            href: "/tools/scan-checker",
            icon: Verify,
          },
          {
            key: "printSize",
            href: "/tools/print-size",
            icon: Ruler,
          },
          {
            key: "barcode",
            href: "/barcode-generator",
            icon: Barcode,
          },
          {
            key: "allTools",
            href: "/tools",
            icon: Category,
            hub: true,
          },
        ],
      },
      {
        id: 3,
        key: "developers",
        href: "/docs",
        items: [
          {
            key: "docs",
            href: "/docs",
            icon: Book1,
            featured: true,
          },
          // The image API's landing page; it links the API docs.
          {
            key: "qrCodeApi",
            href: "/qr-code-api",
            icon: Code1,
          },
          {
            key: "mcp",
            href: "/mcp",
            icon: MessageProgramming,
          },
          {
            key: "nextjs",
            href: "/docs/nextjs",
            icon: DocumentCode,
          },
          {
            key: "shadcn",
            href: "/docs/developers/shadcn",
            icon: Box,
          },
          {
            key: "plugins",
            href: "/plugins",
            icon: ElementPlus,
          },
          {
            key: "github",
            href: GITHUB_REPO_URL,
            icon: GithubLogo,
            external: true,
          },
        ],
      },
      {
        id: 5,
        key: "resources",
        href: "/blog",
        items: [
          {
            key: "help",
            href: "/docs/help",
            icon: Lifebuoy,
          },
          {
            key: "blog",
            href: "/blog",
            icon: Notepad2,
          },
          {
            key: "customers",
            href: "/customers",
            icon: Buildings,
          },
          {
            key: "compare",
            href: "/compare",
            icon: ArrangeHorizontal,
          },
          {
            key: "changelog",
            href: "/changelogs",
            icon: Clock,
          },
          {
            key: "integrations",
            href: "/integrations",
            icon: Link21,
          },
          {
            key: "support",
            href: "/docs/help/contact",
            icon: MessageQuestion,
          },
        ],
      },
      { id: 6, key: "pricing", href: "/pricing" },
    ] satisfies NavEntryConfig[],
  },
  growthSection: {
    title: "Built for Secure Growth",
    description:
      "Where advanced security meets seamless scalability—designed to protect your data and empower your growth.",
    items: [
      {
        id: 1,
        content: (
          <div
            className="relative flex size-full items-center justify-center overflow-hidden transition-all duration-300 hover:mask-none hover:[webkit-mask-image:none]"
            style={{
              WebkitMaskImage: `url("data:image/svg+xml,%3Csvg width='265' height='268' viewBox='0 0 265 268' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fillRule='evenodd' clipRule='evenodd' d='M121.384 4.5393C124.406 1.99342 128.319 0.585938 132.374 0.585938C136.429 0.585938 140.342 1.99342 143.365 4.5393C173.074 29.6304 210.174 45.6338 249.754 50.4314C253.64 50.9018 257.221 52.6601 259.855 55.3912C262.489 58.1223 264.005 61.6477 264.13 65.3354C265.616 106.338 254.748 146.9 232.782 182.329C210.816 217.759 178.649 246.61 140.002 265.547C137.645 266.701 135.028 267.301 132.371 267.298C129.715 267.294 127.1 266.686 124.747 265.526C86.0991 246.59 53.9325 217.739 31.9665 182.309C10.0005 146.879 -0.867679 106.317 0.618784 65.3147C0.748654 61.6306 2.26627 58.1102 4.9001 55.3833C7.53394 52.6565 11.1121 50.9012 14.9945 50.4314C54.572 45.6396 91.6716 29.6435 121.384 4.56V4.5393Z' fill='black'/%3E%3C/svg%3E")`,
              maskImage: `url("data:image/svg+xml,%3Csvg width='265' height='268' viewBox='0 0 265 268' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fillRule='evenodd' clipRule='evenodd' d='M121.384 4.5393C124.406 1.99342 128.319 0.585938 132.374 0.585938C136.429 0.585938 140.342 1.99342 143.365 4.5393C173.074 29.6304 210.174 45.6338 249.754 50.4314C253.64 50.9018 257.221 52.6601 259.855 55.3912C262.489 58.1223 264.005 61.6477 264.13 65.3354C265.616 106.338 254.748 146.9 232.782 182.329C210.816 217.759 178.649 246.61 140.002 265.547C137.645 266.701 135.028 267.301 132.371 267.298C129.715 267.294 127.1 266.686 124.747 265.526C86.0991 246.59 53.9325 217.739 31.9665 182.309C10.0005 146.879 -0.867679 106.317 0.618784 65.3147C0.748654 61.6306 2.26627 58.1102 4.9001 55.3833C7.53394 52.6565 11.1121 50.9012 14.9945 50.4314C54.572 45.6396 91.6716 29.6435 121.384 4.56V4.5393Z' fill='black'/%3E%3C/svg%3E")`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          >
            <div className="absolute top-[55%] md:top-[58%] left-[55%] md:left-[57%] -translate-x-1/2 -translate-y-1/2  size-full z-10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="227"
                height="244"
                viewBox="0 0 227 244"
                fill="none"
                className="size-[90%] md:size-[85%] object-contain fill-background"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M104.06 3.61671C106.656 1.28763 110.017 0 113.5 0C116.983 0 120.344 1.28763 122.94 3.61671C148.459 26.5711 180.325 41.2118 214.322 45.6008C217.66 46.0312 220.736 47.6398 222.999 50.1383C225.262 52.6369 226.563 55.862 226.67 59.2357C227.947 96.7468 218.612 133.854 199.744 166.267C180.877 198.68 153.248 225.074 120.052 242.398C118.028 243.454 115.779 244.003 113.498 244C111.216 243.997 108.969 243.441 106.948 242.379C73.7524 225.055 46.1231 198.661 27.2556 166.248C8.38807 133.835 -0.947042 96.7279 0.329744 59.2168C0.441295 55.8464 1.74484 52.6258 4.00715 50.1311C6.26946 47.6365 9.34293 46.0306 12.6777 45.6008C46.6725 41.2171 78.5389 26.5832 104.06 3.63565V3.61671Z"
                />
              </svg>
            </div>
            <div className="absolute top-[58%] md:top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2  size-full z-20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="245"
                height="282"
                viewBox="0 0 245 282"
                className="size-full object-contain fill-accent"
              >
                <g filter="url(#filter0_dddd_2_33)">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M113.664 7.33065C116.025 5.21236 119.082 4.04126 122.25 4.04126C125.418 4.04126 128.475 5.21236 130.836 7.33065C154.045 28.2076 183.028 41.5233 213.948 45.5151C216.984 45.9065 219.781 47.3695 221.839 49.6419C223.897 51.9144 225.081 54.8476 225.178 57.916C226.339 92.0322 217.849 125.781 200.689 155.261C183.529 184.74 158.4 208.746 128.209 224.501C126.368 225.462 124.323 225.962 122.248 225.959C120.173 225.956 118.13 225.45 116.291 224.484C86.0997 208.728 60.971 184.723 43.811 155.244C26.6511 125.764 18.1608 92.015 19.322 57.8988C19.4235 54.8334 20.6091 51.9043 22.6666 49.6354C24.7242 47.3665 27.5195 45.906 30.5524 45.5151C61.4706 41.5281 90.4531 28.2186 113.664 7.34787V7.33065Z"
                  />
                </g>
                <defs>
                  <filter
                    id="filter0_dddd_2_33"
                    x="0.217041"
                    y="0.0412598"
                    width="244.066"
                    height="292.917"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="3" />
                    <feGaussianBlur stdDeviation="3.5" />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="BackgroundImageFix"
                      result="effect1_dropShadow_2_33"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="12" />
                    <feGaussianBlur stdDeviation="6" />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect1_dropShadow_2_33"
                      result="effect2_dropShadow_2_33"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="27" />
                    <feGaussianBlur stdDeviation="8" />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect2_dropShadow_2_33"
                      result="effect3_dropShadow_2_33"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="48" />
                    <feGaussianBlur stdDeviation="9.5" />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.01 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect3_dropShadow_2_33"
                      result="effect4_dropShadow_2_33"
                    />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="effect4_dropShadow_2_33"
                      result="shape"
                    />
                  </filter>
                </defs>
              </svg>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="81"
                height="80"
                viewBox="0 0 81 80"
                className="fill-background"
              >
                <g filter="url(#filter0_iiii_2_34)">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M20.5 36V28C20.5 22.6957 22.6071 17.6086 26.3579 13.8579C30.1086 10.1071 35.1957 8 40.5 8C45.8043 8 50.8914 10.1071 54.6421 13.8579C58.3929 17.6086 60.5 22.6957 60.5 28V36C62.6217 36 64.6566 36.8429 66.1569 38.3431C67.6571 39.8434 68.5 41.8783 68.5 44V64C68.5 66.1217 67.6571 68.1566 66.1569 69.6569C64.6566 71.1571 62.6217 72 60.5 72H20.5C18.3783 72 16.3434 71.1571 14.8431 69.6569C13.3429 68.1566 12.5 66.1217 12.5 64V44C12.5 41.8783 13.3429 39.8434 14.8431 38.3431C16.3434 36.8429 18.3783 36 20.5 36ZM52.5 28V36H28.5V28C28.5 24.8174 29.7643 21.7652 32.0147 19.5147C34.2652 17.2643 37.3174 16 40.5 16C43.6826 16 46.7348 17.2643 48.9853 19.5147C51.2357 21.7652 52.5 24.8174 52.5 28Z"
                  />
                </g>
                <defs>
                  <filter
                    id="filter0_iiii_2_34"
                    x="12.5"
                    y="8"
                    width="56"
                    height="70"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="1" />
                    <feGaussianBlur stdDeviation="1" />
                    <feComposite
                      in2="hardAlpha"
                      operator="arithmetic"
                      k2="-1"
                      k3="1"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="shape"
                      result="effect1_innerShadow_2_34"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="3" />
                    <feGaussianBlur stdDeviation="1.5" />
                    <feComposite
                      in2="hardAlpha"
                      operator="arithmetic"
                      k2="-1"
                      k3="1"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.09 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect1_innerShadow_2_34"
                      result="effect2_innerShadow_2_34"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="8" />
                    <feGaussianBlur stdDeviation="2.5" />
                    <feComposite
                      in2="hardAlpha"
                      operator="arithmetic"
                      k2="-1"
                      k3="1"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect2_innerShadow_2_34"
                      result="effect3_innerShadow_2_34"
                    />
                    <feColorMatrix
                      in="SourceAlpha"
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                      result="hardAlpha"
                    />
                    <feOffset dy="14" />
                    <feGaussianBlur stdDeviation="3" />
                    <feComposite
                      in2="hardAlpha"
                      operator="arithmetic"
                      k2="-1"
                      k3="1"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.01 0"
                    />
                    <feBlend
                      mode="normal"
                      in2="effect3_innerShadow_2_34"
                      result="effect4_innerShadow_2_34"
                    />
                  </filter>
                </defs>
              </svg>
            </div>
            hello
          </div>
        ),
        title: "Advanced Task Security",
        description:
          "Safeguard your tasks with state-of-art encryption and secure access to your workflow data.",
      },
      {
        id: 2,
        content: (
          <div className="relative flex size-full max-w-lg items-center justify-center overflow-hidden mask-[linear-gradient(to_top,transparent,black_50%)] -translate-y-20">
            Hello
          </div>
        ),

        title: "Scalable for Teams",
        description:
          "Grow with your team. Track tasks across multiple workspaces and all team members.",
      },
    ],
  },
  footerLinks: [
    {
      key: "product",
      links: [
        { id: 1, key: "playground", url: "/playground" },
        { id: 2, key: "dynamicCodes", url: "/dynamic-qr-code" },
        { id: 3, key: "aiThemes", url: "/ai" },
        { id: 4, key: "communityThemes", url: "/community" },
        { id: 7, key: "pageTemplates", url: "/templates" },
        { id: 5, key: "pricing", url: "/pricing" },
        { id: 6, key: "guarantee", url: "/guarantee" },
        { id: 11, key: "enterprise", url: "/enterprise" },
        // Shown only where each bot is set up (feature-availability-rules).
        { id: 8, key: "slackBot", url: "/slack" },
        { id: 9, key: "telegramBot", url: "/telegram" },
        { id: 10, key: "discordBot", url: "/discord" },
      ],
    },
    {
      key: "tools",
      links: [
        { id: 1, key: "generators", url: "/qr-code-generator" },
        { id: 8, key: "pdfQr", url: "/qr-code-generator/pdf" },
        { id: 9, key: "businessCard", url: "/qr-code-generator/business-card" },
        { id: 10, key: "menuQr", url: "/qr-codes-on/menus" },
        { id: 2, key: "bulk", url: "/tools/bulk" },
        { id: 3, key: "scanChecker", url: "/tools/scan-checker" },
        { id: 4, key: "printSize", url: "/tools/print-size" },
        { id: 7, key: "barcode", url: "/barcode-generator" },
        { id: 6, key: "scanner", url: "/scan" },
        { id: 5, key: "allTools", url: "/tools" },
      ],
    },
    {
      key: "developers",
      // No GitHub link here: the footer's "Star on GitHub" links the repo.
      links: [
        { id: 1, key: "docs", url: "/docs" },
        { id: 8, key: "apiReference", url: "/docs/developers/api" },
        { id: 9, key: "qrCodeApi", url: "/qr-code-api" },
        { id: 2, key: "imageApi", url: "/docs/developers/image-api" },
        { id: 3, key: "mcp", url: "/mcp" },
        { id: 10, key: "nextjs", url: "/docs/nextjs" },
        { id: 4, key: "shadcn", url: "/docs/developers/shadcn" },
        { id: 7, key: "plugins", url: "/plugins" },
        { id: 5, key: "selfHosting", url: "/docs/self-hosting" },
        { id: 11, key: "openSource", url: "/open-source-qr-code-generator" },
      ],
    },
    {
      key: "resources",
      links: [
        { id: 8, key: "help", url: "/docs/help" },
        { id: 1, key: "blog", url: "/blog" },
        { id: 11, key: "customers", url: "/customers" },
        { id: 2, key: "changelog", url: "/changelogs" },
        { id: 3, key: "integrations", url: "/integrations" },
        { id: 5, key: "industries", url: "/qr-codes-for" },
        { id: 6, key: "placements", url: "/qr-codes-on" },
        { id: 9, key: "affiliates", url: "/affiliates" },
        { id: 4, key: "contact", url: `mailto:${SUPPORT_EMAIL}` },
        { id: 10, key: "security", url: "/security" },
        {
          id: 7,
          key: "legal",
          children: [
            { id: 1, key: "privacy", url: "/legal/privacy-policy" },
            {
              id: 2,
              key: "terms",
              url: "/legal/terms-of-service",
            },
            { id: 3, key: "subprocessors", url: "/legal/subprocessors" },
            { id: 4, key: "reportAbuse", url: "/report-abuse" },
            {
              id: 5,
              key: "acceptableUse",
              url: "/legal/acceptable-use-policy",
            },
            { id: 6, key: "cookies", url: "/legal/cookie-policy" },
            { id: 7, key: "dpa", url: "/legal/dpa" },
            { id: 8, key: "aiFeatures", url: "/legal/ai-features" },
            { id: 9, key: "refunds", url: "/legal/refunds" },
            {
              id: 11,
              key: "affiliateTerms",
              url: "/legal/affiliate-terms",
            },
            { id: 10, key: "securityPolicy", url: "/legal/security" },
          ],
        },
      ],
    },
    {
      key: "compare",
      links: [
        { id: 1, label: "QR Code Monkey", url: "/compare/qr-code-monkey" },
        { id: 2, label: "QR Tiger", url: "/compare/qr-tiger" },
        { id: 3, label: "Canva QR", url: "/compare/canva-qr" },
        { id: 4, label: "Bitly QR", url: "/compare/bitly-qr" },
        { id: 5, label: "Flowcode", url: "/compare/flowcode" },
        { id: 7, label: "QRFY", url: "/compare/qrfy" },
        { id: 8, label: "Uniqode", url: "/compare/uniqode" },
        { id: 9, label: "QR-Verse", url: "/compare/qr-verse" },
        { id: 6, key: "allComparisons", url: "/compare" },
      ],
    },
  ] satisfies FooterColumnConfig[] as FooterColumnConfig[],
};

export type SiteConfig = typeof siteConfig;
