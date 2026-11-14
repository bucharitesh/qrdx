// New barcodes open in the code builder's host (components/code-builder/
// barcode-builder-modal.tsx): the store's "barcode" request, what
// /barcodes/new asks for, and where the address bar goes as the modal
// closes. Pure: no browser, no server.
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
);
vi.mock("@repo/design-system", () => ({ toast }));

const { useCodeBuilderStore, openCodeBuilder, closeCodeBuilder } = await import(
  "@/components/code-builder/store"
);
const { addressAfterClose, newBarcodePageRequest } = await import(
  "@/components/code-builder/barcode-request"
);

const LIST = "/dashboard/acme/barcodes";

beforeEach(() => {
  useCodeBuilderStore.setState({ request: null, session: 0, hosts: [] });
  toast.error.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the barcode request", () => {
  it("opens through the code builder's store, one session each", () => {
    useCodeBuilderStore.getState().registerHost("host_1");
    openCodeBuilder({ mode: "barcode" });
    expect(useCodeBuilderStore.getState().request).toEqual({ mode: "barcode" });
    expect(useCodeBuilderStore.getState().session).toBe(1);

    // Opening it again starts a fresh modal (the host keys it by session).
    openCodeBuilder({ mode: "barcode" });
    expect(useCodeBuilderStore.getState().session).toBe(2);

    closeCodeBuilder();
    expect(useCodeBuilderStore.getState().request).toBeNull();
  });

  it("replaces a dynamic code request, and the other way round", () => {
    useCodeBuilderStore.getState().registerHost("host_1");
    openCodeBuilder({ mode: "create" });
    openCodeBuilder({ mode: "barcode" });
    expect(useCodeBuilderStore.getState().request?.mode).toBe("barcode");
    openCodeBuilder({ mode: "create" });
    expect(useCodeBuilderStore.getState().request).toEqual({ mode: "create" });
  });

  it("says so instead of doing nothing on a page without a host", () => {
    openCodeBuilder({ mode: "barcode" });
    expect(useCodeBuilderStore.getState().request).toBeNull();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it("keeps where /barcodes/new closes to", () => {
    useCodeBuilderStore.getState().registerHost("host_1");
    openCodeBuilder(newBarcodePageRequest(LIST));
    expect(useCodeBuilderStore.getState().request).toEqual({
      mode: "barcode",
      closeTo: { from: `${LIST}/new`, to: LIST },
    });
  });
});

describe("/barcodes/new", () => {
  const request = newBarcodePageRequest(LIST);

  it("leaves the list at /barcodes once the modal closes", () => {
    expect(addressAfterClose(request, `${LIST}/new`)).toBe(LIST);
    expect(addressAfterClose(request, `${LIST}/new/`)).toBe(LIST);
  });

  it("leaves the address alone anywhere else", () => {
    // Already moved on, or went to another page while it was open.
    expect(addressAfterClose(request, LIST)).toBeNull();
    expect(addressAfterClose(request, "/dashboard/acme/codes")).toBeNull();
    expect(addressAfterClose(request, "/dashboard/other/barcodes/new")).toBe(
      null,
    );
  });

  it("changes nothing for the modal opened from a button or the menu", () => {
    expect(addressAfterClose({ mode: "barcode" }, `${LIST}/new`)).toBeNull();
    expect(addressAfterClose({ mode: "barcode" }, LIST)).toBeNull();
  });
});
