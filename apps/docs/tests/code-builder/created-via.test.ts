// Where the builder's new codes are recorded as made (qr_code.created_via):
// over the playground it says "playground"; in the dashboard it says
// nothing, which the server action records as "dashboard". The server
// actions are fakes.
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createQrCode: vi.fn(async () => ({ success: true, data: {} })),
  getQrCode: vi.fn(),
  listQrCodes: vi.fn(),
  updateQrCode: vi.fn(),
}));
vi.mock("@/actions/qr-codes", () => actions);
vi.mock("@/actions/bulk-codes", () => ({ moveQrCodes: vi.fn() }));
vi.mock("@/actions/tags", () => ({ setQrCodeTags: vi.fn() }));

const { builderServices, playgroundBuilderServices } = await import(
  "@/components/code-builder/services"
);

const input = {
  destinationUrl: "https://example.com",
  title: null,
  domainId: null,
  slug: null,
};

describe("the builder's new codes", () => {
  it("say they were made in the playground when the builder is over it", async () => {
    await playgroundBuilderServices.createCode(input);
    expect(actions.createQrCode).toHaveBeenLastCalledWith(input, {
      via: "playground",
    });
  });

  it("say nothing from the dashboard (recorded as the dashboard)", async () => {
    await builderServices.createCode(input);
    expect(actions.createQrCode).toHaveBeenLastCalledWith(input);
    expect(playgroundBuilderServices.updateCode).toBe(
      builderServices.updateCode,
    );
  });
});
