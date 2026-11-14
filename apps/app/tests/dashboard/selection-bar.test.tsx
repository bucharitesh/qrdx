// @vitest-environment jsdom
// The floating bulk-actions bar the dashboard lists share
// (app/(app)/dashboard/_components/selection-bar.tsx), driven by the lists'
// selection hook as the codes, barcodes, pages and responses lists use it:
// hidden and inert with nothing selected, the count as rows are picked,
// Clear and Esc empty it, and actions that don't fit go into More.
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { TooltipProvider } from "@repo/design-system/components/ui/tooltip";
import { NextIntlClientProvider } from "next-intl";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import en from "@/messages/en.json";

vi.mock("@/lib/hooks/use-user-settings", () => ({
  useUserSettings: () => ({
    settings: null,
    isLoading: false,
    refreshSettings: async () => {},
  }),
}));

const { useListSelection } = await import(
  "@/app/(app)/dashboard/_components/list-selection"
);
const { SelectionBar } = await import(
  "@/app/(app)/dashboard/_components/selection-bar"
);
type BulkAction = import("@/app/(app)/dashboard/_lib/list-keys").BulkAction;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: Radix and the bar observe sizes, and widths are set
// per test through these.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let roomWidth = 0;
const widthFor = (element: Element) => {
  if (element.getAttribute("data-measure") === "fixed") return 40;
  if (element.getAttribute("data-measure") === "more") return 60;
  if (element.hasAttribute("data-measure-action")) return 100;
  return 0;
};

const ROWS = ["a", "b", "c"];

function Harness({
  onArchive,
  onTrash,
}: {
  onArchive: () => void;
  onTrash: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const keyActions = useRef<Partial<Record<BulkAction, () => void>>>({});
  const selection = useListSelection({
    order: ROWS,
    listRef,
    keyboardShortcuts: true,
    actionsRef: keyActions,
  });
  keyActions.current = { archive: onArchive, trash: onTrash };
  return (
    <div ref={listRef}>
      <ul>
        {ROWS.map((id) => (
          <li key={id} {...selection.rowProps(id)}>
            <Checkbox
              aria-label={`Select ${id}`}
              data-row-checkbox={id}
              {...selection.checkboxProps(id)}
            />
          </li>
        ))}
      </ul>
      <SelectionBar
        actions={[
          {
            id: "move",
            label: "Move",
            icon: null,
            priority: 30,
            onSelect: () => {},
          },
          {
            id: "archive",
            label: "Archive",
            icon: null,
            kbd: "A",
            priority: 10,
            onSelect: onArchive,
          },
          {
            id: "trash",
            label: "Move to trash",
            icon: null,
            kbd: "⌫",
            priority: 20,
            destructive: true,
            onSelect: onTrash,
          },
        ]}
        clearLabel="Clear selection"
        count={selection.count}
        countLabel={`${selection.count} selected`}
        label="Bulk actions"
        noun={["code", "codes"]}
        onClear={selection.clear}
        shortcuts={[{ label: "Archive", keys: ["A"] }]}
      />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let onArchive: Mock<() => void>;
let onTrash: Mock<() => void>;

const render = async () => {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <TooltipProvider>
          <Harness onArchive={onArchive} onTrash={onTrash} />
        </TooltipProvider>
      </NextIntlClientProvider>,
    );
  });
};
const toolbar = () =>
  container.querySelector<HTMLElement>('[role="toolbar"]') as HTMLElement;
const wrapper = () =>
  container.querySelector<HTMLElement>("[data-selection-bar]") as HTMLElement;
const status = () =>
  container.querySelector('[role="status"]')?.textContent ?? "";
const buttonNamed = (name: string, within: ParentNode = toolbar()) =>
  [...within.querySelectorAll<HTMLElement>("button")].find(
    (button) =>
      (button.getAttribute("aria-label") ?? button.textContent?.trim()) ===
      name,
  );
const click = async (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  await act(async () => {
    (element as HTMLElement).click();
  });
};
const pick = (id: string) =>
  click(container.querySelector(`[data-row-checkbox="${id}"]`));
const press = async (key: string, target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  roomWidth = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const width = widthFor(this);
      return {
        width,
        height: 32,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 32,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.querySelector(':scope > [role="toolbar"]') ? roomWidth : 0;
    },
  );
  onArchive = vi.fn<() => void>();
  onTrash = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("SelectionBar", () => {
  it("is hidden and inert with nothing selected", async () => {
    await render();
    expect(wrapper().getAttribute("data-selection-bar")).toBe("closed");
    expect(toolbar().hasAttribute("inert")).toBe(true);
    expect(toolbar().className).toContain("invisible");
    expect(toolbar().getAttribute("aria-label")).toBe("Bulk actions");
    expect(status()).toBe("");
  });

  it("opens with the count, and follows it, announcing politely", async () => {
    await render();
    await pick("a");
    expect(wrapper().getAttribute("data-selection-bar")).toBe("open");
    expect(toolbar().hasAttribute("inert")).toBe(false);
    expect(toolbar().textContent).toContain("1 selected");
    expect(status()).toBe("1 code selected");
    expect(
      container.querySelector('[role="status"]')?.getAttribute("aria-live"),
    ).toBe("polite");

    await pick("c");
    expect(toolbar().textContent).toContain("2 selected");
    expect(status()).toBe("2 codes selected");
  });

  it("doesn't take focus when it opens", async () => {
    await render();
    const checkbox = container.querySelector<HTMLElement>(
      '[data-row-checkbox="b"]',
    );
    checkbox?.focus();
    await pick("b");
    expect(document.activeElement).toBe(checkbox);
  });

  it("clears with its Clear button, and says so", async () => {
    await render();
    await pick("a");
    await pick("b");
    await click(buttonNamed("Clear selection"));
    expect(wrapper().getAttribute("data-selection-bar")).toBe("closed");
    expect(toolbar().hasAttribute("inert")).toBe(true);
    expect(status()).toBe("Selection cleared");
    // It keeps the last count while it slides away, rather than "0 selected".
    expect(toolbar().textContent).toContain("2 selected");
  });

  it("clears with Esc, and the bulk keys still run", async () => {
    await render();
    await pick("a");
    await press("a");
    expect(onArchive).toHaveBeenCalledTimes(1);
    await press("Escape");
    expect(wrapper().getAttribute("data-selection-bar")).toBe("closed");
    // Nothing selected: the keys do nothing.
    await press("a");
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("shows every action as a button when they fit", async () => {
    roomWidth = 1000;
    await render();
    await pick("a");
    expect(buttonNamed("Move")).toBeTruthy();
    expect(buttonNamed("Archive")).toBeTruthy();
    expect(buttonNamed("Move to trash")).toBeTruthy();
    expect(buttonNamed("More actions")).toBeUndefined();
    await click(buttonNamed("Archive"));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("puts what doesn't fit into More, destructive last", async () => {
    // Count, Clear, divider and the keys button 4 × 40, More 60: 220, then
    // one 100 px action fits in 330 and the rest go into the menu.
    roomWidth = 330;
    await render();
    await pick("a");
    expect(buttonNamed("Move")).toBeTruthy();
    expect(buttonNamed("Archive")).toBeUndefined();
    expect(buttonNamed("Move to trash")).toBeUndefined();
    const more = buttonNamed("More actions");
    expect(more?.textContent).toContain("More");

    await act(async () => {
      more?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    const items = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "ArchiveA",
      "Move to trash⌫",
    ]);
    expect(items[1].getAttribute("data-variant")).toBe("destructive");
    expect(document.querySelector('[role="separator"]')).not.toBeNull();

    await click(items[1]);
    expect(onTrash).toHaveBeenCalledTimes(1);
  });
});
