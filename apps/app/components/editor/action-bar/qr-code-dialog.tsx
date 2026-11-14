"use client";

import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { Book1, Copy, Element3, InfoCircle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useCodeDialogStore } from "@/components/editor/action-bar/code-dialog-store";
import {
  CODE_TAB_LABELS,
  CODE_TABS,
  CODE_TARGETS,
  type CodeTab,
  cliSnippet,
  codeTargetTab,
  FRAMEWORK_LABELS,
  FRAMEWORKS,
  type Framework,
  frameworkSnippet,
  imageSnippet,
  MCP_SERVER_URL,
  mcpSnippet,
  QRDX_INSTALL,
  QRDX_NPM_VERSION,
  restSnippet,
  type SnippetInput,
  shadcnSnippet,
  VANILLA_CDN_URL,
} from "@/components/editor/action-bar/code-snippets";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { BrandLogo, type BrandMarkSlug } from "@/lib/brand-logos/brand-logo";
import type { CodeLang } from "@/lib/playground-links";
import { useQREditorStore } from "@/store/editor-store";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const linkClass =
  "text-foreground font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground";

/** The tab (and framework) a link asked for, when it ships; React otherwise. */
const targetFor = (lang: CodeLang | null) =>
  codeTargetTab(lang && CODE_TARGETS.includes(lang) ? lang : "react");

/** Each framework's real mark (Simple Icons), drawn in the text color. */
const FRAMEWORK_BRANDS: Record<Framework, BrandMarkSlug> = {
  react: "react",
  vue: "vuedotjs",
  angular: "angular",
  preact: "preact",
  solid: "solid",
  "web-component": "webcomponentsdotorg",
  vanilla: "javascript",
  shadcn: "shadcnui",
};

type CodeFramework = Exclude<Framework, "shadcn">;

/** The file each framework's snippet goes in, and its highlighting. */
const FRAMEWORK_FILES: Record<CodeFramework, { title: string; lang: string }> =
  {
    react: { title: "my-qr-code.tsx", lang: "tsx" },
    vue: { title: "MyQRCode.vue", lang: "vue" },
    angular: { title: "my-qr-code.ts", lang: "ts" },
    preact: { title: "my-qr-code.tsx", lang: "tsx" },
    solid: { title: "my-qr-code.tsx", lang: "tsx" },
    "web-component": { title: "index.html", lang: "html" },
    vanilla: { title: "main.js", lang: "js" },
  };

/** ["Gradients", "Your logo", "The frame"] → "gradients, your logo and the frame" */
function listItems(items: string[]): string {
  const words = items.map(
    (item) => item.charAt(0).toLowerCase() + item.slice(1),
  );
  return words.length > 1
    ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
    : (words[0] ?? "");
}

/**
 * Get code (V): the editor's design as code for each framework (React, Vue,
 * Angular, Preact, Solid, the web component, vanilla JS and shadcn), an
 * image URL, a REST API request, MCP arguments and a CLI command
 * (code-snippets.ts writes them). A link's open=code&lang=… picks the tab
 * and framework.
 */
export function QRCodeDialog({ open, onOpenChange }: QRCodeDialogProps) {
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    // A link's tab applies to the open it came with; V opens on React.
    if (!next) useCodeDialogStore.setState({ lang: null });
  };

  return (
    <ResponsiveDialog onOpenChange={handleOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl dark:!border-border">
        <GetCode onLeave={() => handleOpenChange(false)} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function GetCode({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  const lang = useCodeDialogStore((state) => state.lang);
  const style = useQREditorStore((state) => state.themeState.styles);
  const value = useQREditorStore((state) => state.value);
  const contentType = useQREditorStore((state) => state.contentType);
  const content = useQREditorStore(
    (state) => state.contentConfigs[state.contentType],
  );

  const [tab, setTab] = useState<CodeTab>(() => targetFor(lang).tab);
  const [framework, setFramework] = useState<Framework>(
    () => targetFor(lang).framework ?? "react",
  );
  // A link that opens the dialog on another tab while it's open.
  const [linkedLang, setLinkedLang] = useState(lang);
  if (lang !== linkedLang) {
    setLinkedLang(lang);
    if (lang) {
      const target = targetFor(lang);
      setTab(target.tab);
      if (target.framework) setFramework(target.framework);
    }
  }

  // On a narrow screen the tab list scrolls: keep the open tab in view.
  const tabStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabStrip.current;
    const active = strip?.querySelector<HTMLElement>(
      `[data-code-tab="${tab}"]`,
    );
    if (!(strip && active)) return;
    const gutter = 24;
    const start = active.offsetLeft - gutter;
    const end = active.offsetLeft + active.offsetWidth + gutter;
    if (start < strip.scrollLeft) strip.scrollLeft = start;
    else if (end > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = end - strip.clientWidth;
    }
  }, [tab]);

  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      emitSound("copy");
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(t("couldntCopyToTheClipboard"));
    }
  };
  const copyProps = (id: string, text: string) => ({
    copied: copied === id,
    onCopy: () => copy(id, text),
  });

  const input: SnippetInput = useMemo(
    () => ({ style, value, contentType, content }),
    [style, value, contentType, content],
  );
  const code = useMemo(
    () => (framework === "shadcn" ? null : frameworkSnippet(framework, input)),
    [framework, input],
  );
  const shadcn = useMemo(() => shadcnSnippet(input), [input]);
  const image = useMemo(() => imageSnippet(input), [input]);
  const rest = useMemo(() => restSnippet(input), [input]);
  const mcp = useMemo(() => mcpSnippet(input), [input]);
  const cli = useMemo(
    () => (CODE_TABS.includes("cli") ? cliSnippet(input) : null),
    [input],
  );

  return (
    <div className="flex max-h-[inherit] min-h-0 flex-col">
      <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
        <div className="min-w-0 flex-1 space-y-1">
          <ResponsiveDialogTitle>{t("getCode")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("useThisDesignInYour")}
          </ResponsiveDialogDescription>
        </div>
        <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
      </ResponsiveDialogHeader>

      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(next) => setTab(next as CodeTab)}
        value={tab}
      >
        <div
          className="relative flex overflow-x-auto px-6 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          ref={tabStrip}
        >
          <TabsList className="w-max shrink-0">
            {CODE_TABS.map((id) => (
              <TabsTrigger
                className="px-3"
                data-code-tab={id}
                key={id}
                value={id}
              >
                {id === "frameworks" ? t("frameworks") : CODE_TAB_LABELS[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
          <TabsContent className="mt-0 space-y-4" value="frameworks">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <FrameworkPicker onChange={setFramework} value={framework} />
              <Lead>
                {framework === "shadcn"
                  ? t("addTheQrCodeComponent")
                  : t.rich(
                      framework === "web-component"
                        ? "pasteThisIntoAnyPage"
                        : framework === "vanilla"
                          ? "installAndDrawIntoAnyElement"
                          : "installTheOpenSourceQrdx",
                      {
                        version: QRDX_NPM_VERSION,
                        code: (chunks) => (
                          <code className="font-mono text-xs">{chunks}</code>
                        ),
                      },
                    )}
              </Lead>
            </div>
            {framework === "shadcn" ? (
              <>
                <CommandLine
                  prefix="$"
                  text={shadcn.install}
                  {...copyProps("shadcn-install", shadcn.install)}
                />
                <CodeCard
                  code={shadcn.code}
                  lang="tsx"
                  title="my-qr-code.tsx"
                  {...copyProps("shadcn-code", shadcn.code)}
                />
                <LeftOut items={shadcn.omitted} />
              </>
            ) : code ? (
              <>
                {framework === "web-component" ? null : (
                  <CommandLine
                    prefix="$"
                    text={QRDX_INSTALL}
                    {...copyProps(`${framework}-install`, QRDX_INSTALL)}
                  />
                )}
                <CodeCard
                  code={code.code}
                  hint={
                    framework === "react" ? (
                      <InfoHint align="start" id="react-component" />
                    ) : undefined
                  }
                  lang={FRAMEWORK_FILES[framework].lang}
                  title={FRAMEWORK_FILES[framework].title}
                  {...copyProps(`${framework}-code`, code.code)}
                />
                {framework === "vanilla" ? (
                  <UrlBox
                    copyLabel={t("address")}
                    label={t("withoutABundlerImportIt")}
                    text={VANILLA_CDN_URL}
                    {...copyProps("vanilla-cdn", VANILLA_CDN_URL)}
                  />
                ) : null}
                <LeftOut items={code.omitted} />
              </>
            ) : null}
          </TabsContent>

          <TabsContent className="mt-0 space-y-4" value="image">
            <Lead>{t("aPublicImageOfThis")}</Lead>
            <CodeCard
              code={image.code}
              lang="html"
              title="HTML"
              {...copyProps("image-html", image.code)}
            />
            <UrlBox
              label={t("imageUrl")}
              text={image.url}
              {...copyProps("image-url", image.url)}
            />
            <LeftOut items={image.omitted} />
          </TabsContent>

          <TabsContent className="mt-0 space-y-4" value="api">
            {rest.unavailable ? (
              <p className="bg-muted/40 text-muted-foreground rounded-lg border px-4 py-3 text-sm">
                {rest.unavailable}
              </p>
            ) : (
              <>
                <Lead>
                  {t.rich("createsADynamicCodeWith", {
                    link: (chunks) => (
                      <Link
                        className={linkClass}
                        href="/docs/developers/api-keys"
                        onNavigate={onLeave}
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </Lead>
                <CodeCard
                  code={rest.code}
                  lang="bash"
                  title={t("terminal")}
                  {...copyProps("api-curl", rest.code)}
                />
                <LeftOut items={rest.omitted} />
              </>
            )}
          </TabsContent>

          <TabsContent className="mt-0 space-y-4" value="mcp">
            <Lead>
              {t.rich("addThisServerToYour", {
                link: (chunks) => (
                  <Link
                    className={linkClass}
                    href="/docs/developers/mcp"
                    onNavigate={onLeave}
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </Lead>
            <CommandLine
              text={MCP_SERVER_URL}
              {...copyProps("mcp-server", MCP_SERVER_URL)}
            />
            <CodeCard
              code={mcp.code}
              lang="json"
              title={t("designQrArguments")}
              {...copyProps("mcp-args", mcp.code)}
            />
            <p className="text-muted-foreground text-xs">
              {t("askUseQrdxDesignQr")}
            </p>
            <LeftOut items={mcp.omitted} />
          </TabsContent>

          {cli ? (
            <TabsContent className="mt-0 space-y-4" value="cli">
              <Lead>{t("writesThisDesignToQr")}</Lead>
              <CodeCard
                code={cli.code}
                lang="bash"
                title={t("terminal")}
                {...copyProps("cli", cli.code)}
              />
              <LeftOut items={cli.omitted} />
            </TabsContent>
          ) : null}

          <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs">
            <span className="flex items-center gap-1.5">
              <Book1 className="size-3.5 shrink-0" />
              <Link
                className={linkClass}
                href="/docs/developers"
                onNavigate={onLeave}
              >
                {t("developerDocs")}
              </Link>
            </span>
            <span className="flex items-center gap-1.5">
              <Element3 className="size-3.5 shrink-0" />
              <Link className={linkClass} href="/plugins" onNavigate={onLeave}>
                {t("pluginsForFigmaCanvaRaycast")}
              </Link>
            </span>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

/** The Frameworks tab's picker: each framework with its real mark. */
function FrameworkPicker({
  value,
  onChange,
}: {
  value: Framework;
  onChange: (framework: Framework) => void;
}) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  return (
    <Select onValueChange={(next) => onChange(next as Framework)} value={value}>
      <SelectTrigger
        aria-label={t("framework")}
        className="w-full shrink-0 sm:w-44"
        data-code-framework-picker=""
      >
        <SelectValue />
      </SelectTrigger>
      {/* Above the dialog (z-[99]), as the app's other dialog selects */}
      <SelectContent align="start" className="z-[120]" position="popper">
        {FRAMEWORKS.map((id) => (
          <SelectItem data-code-framework={id} key={id} value={id}>
            <BrandLogo
              className="size-4"
              color="currentColor"
              slug={FRAMEWORK_BRANDS[id]}
            />
            {FRAMEWORK_LABELS[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

interface CopyProps {
  copied: boolean;
  onCopy: () => void;
}

function CopyIconButton({
  copied,
  onCopy,
  label,
}: CopyProps & { label: string }) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  return (
    <Button
      aria-label={
        copied ? t("labelCopied", { label }) : t("copyLabel", { label })
      }
      className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={onCopy}
      size="icon-sm"
      variant="ghost"
    >
      {copied ? <Tick /> : <Copy />}
    </Button>
  );
}

/** One line to copy: a command (with a `$`) or an address. */
function CommandLine({
  text,
  prefix,
  ...copy
}: CopyProps & { text: string; prefix?: string }) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  return (
    <div className="bg-muted/40 flex h-10 items-center gap-2 rounded-full border pr-1 pl-4">
      {prefix ? (
        <span className="text-muted-foreground font-mono text-xs select-none">
          {prefix}
        </span>
      ) : null}
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={text}>
        {text}
      </code>
      <CopyIconButton label={prefix ? t("command") : t("address")} {...copy} />
    </div>
  );
}

/** A long address, wrapped so all of it shows. */
function UrlBox({
  text,
  label,
  copyLabel = label.toLowerCase(),
  ...copy
}: CopyProps & { text: string; label: string; copyLabel?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground block text-xs font-medium">
        {label}
      </span>
      <div className="bg-muted/40 flex items-start gap-2 rounded-lg border py-1 pr-1 pl-4">
        <code className="min-w-0 flex-1 py-1.5 font-mono text-xs leading-5 break-all">
          {text}
        </code>
        <CopyIconButton label={copyLabel} {...copy} />
      </div>
    </div>
  );
}

function CodeCard({
  title,
  hint,
  code,
  lang,
  copied,
  onCopy,
}: CopyProps & {
  title: string;
  hint?: ReactNode;
  code: string;
  lang: string;
}) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  const lines = code.split("\n").length;
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-4">
        <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
          {title}
          <span className="text-muted-foreground/60">
            {" "}
            · {lines} {lines === 1 ? t("line") : t("lines")}
          </span>{" "}
          {hint}
        </span>
        <Button
          aria-live="polite"
          className="shrink-0"
          onClick={onCopy}
          size="sm"
          variant={copied ? "secondary" : "outline"}
        >
          {copied ? <Tick /> : <Copy />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <div className="max-h-[min(40dvh,360px)] overflow-auto [&_button]:hidden [&_figure]:my-0 [&_figure]:rounded-none [&_figure]:border-0 [&_figure]:bg-transparent [&_figure]:shadow-none [&_figure>div]:max-h-none [&_pre]:py-3 [&_pre]:text-[13px]">
        <DynamicCodeBlock code={code} lang={lang} />
      </div>
    </div>
  );
}

/** What this tab can't express, on one muted line. */
function LeftOut({ items }: { items: string[] }) {
  const t = useTranslations("editor.actionBar.qrCodeDialog");
  if (items.length === 0) return null;
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <InfoCircle className="mt-px size-3.5 shrink-0" />
      <span>{t("leftOutValue", { value: listItems(items) })}</span>
    </p>
  );
}
