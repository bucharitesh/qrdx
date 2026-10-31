import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import { HighlightedCode } from "./highlighted-code";
import { readRegistrySource } from "./registry-data";
import { RegistryExample } from "./registry-example";

interface ComponentPreviewProps {
  /** File name in apps/docs/registry/examples, without extension. */
  name: string;
  /** Vertical placement of the example on the stage. */
  align?: "center" | "start";
  className?: string;
}

/**
 * Preview | Code tabs for a registry example. The preview renders the example
 * file itself and the code tab shows that same file, so they never drift.
 */
export async function ComponentPreview({
  name,
  align = "center",
  className,
}: ComponentPreviewProps) {
  const code = await readRegistrySource(`registry/examples/${name}.tsx`);

  return (
    <Tabs
      className={cn("not-prose my-6 gap-3", className)}
      defaultValue="preview"
    >
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <div
          className={cn(
            "relative flex min-h-[22rem] w-full justify-center overflow-hidden rounded-xl border bg-background px-4 py-12 sm:px-10",
            align === "center" ? "items-center" : "items-start",
          )}
          data-slot="component-preview"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-foreground)_1px,transparent_1px)] bg-size-[18px_18px] opacity-[0.13] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_85%)]"
          />
          <div className="relative flex w-full justify-center">
            <RegistryExample name={name} />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="code">
        <HighlightedCode
          className="my-0"
          code={code}
          viewportClassName="max-h-[28rem]"
        />
      </TabsContent>
    </Tabs>
  );
}
