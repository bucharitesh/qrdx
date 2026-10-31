import { toTargetPath } from "@/registry/transform";
import { CollapsibleCode } from "./collapsible-code";
import { HighlightedCode } from "./highlighted-code";
import { getRegistryItem, readRegistrySource } from "./registry-data";

interface ComponentSourceProps {
  /** Registry item name, e.g. "qr-code". */
  name: string;
  /** Show the top of long files with an expand button. */
  collapsible?: boolean;
}

/** The exact source the shadcn CLI installs for a registry item. */
export async function ComponentSource({
  name,
  collapsible = true,
}: ComponentSourceProps) {
  const item = getRegistryItem(name);
  const files = await Promise.all(
    item.files.map(async (file) => ({
      path: file.path,
      code: await readRegistrySource(file.path),
    })),
  );

  return (
    <div className="not-prose flex flex-col gap-4">
      {files.map(({ path, code }) => {
        const Wrapper =
          collapsible && code.split("\n").length > 24 ? CollapsibleCode : "div";
        return (
          <Wrapper key={path}>
            <HighlightedCode
              className="my-0"
              code={code}
              title={toTargetPath(path)}
            />
          </Wrapper>
        );
      })}
    </div>
  );
}
