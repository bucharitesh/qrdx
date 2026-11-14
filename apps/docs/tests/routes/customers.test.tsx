// The /customers section: the index lists published customers only, each
// story renders at /customers/<id>, and an unpublished customer's story has
// no page, no static params and no Open Graph image. Two customers here,
// Flam (published) and Acme (not), with stories built like the real
// content/customers files (lib/content-source.ts filters them the same way;
// tests/lib/customers.test.ts checks that wiring).
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "@/lib/customers";

vi.mock(
  "next-intl/server",
  async () => (await import("../support/intl")).intlServer,
);

vi.mock("@/lib/customers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/customers")>();
  const flam = real.CUSTOMERS.find((c) => c.id === "flam") as Customer;
  const acme = {
    ...flam,
    id: "acme",
    name: "Acme",
    published: false,
  } as unknown as Customer;
  const CUSTOMERS = [flam, acme];
  return {
    ...real,
    CUSTOMERS,
    getPublishedCustomers: (list: readonly Customer[] = CUSTOMERS) =>
      real.getPublishedCustomers(list),
    isPublishedCustomerStory: (
      path: string,
      list: readonly Customer[] = CUSTOMERS,
    ) => real.isPublishedCustomerStory(path, list),
  };
});

vi.mock("@/lib/content-source", async () => {
  const { loader } = await import("fumadocs-core/source");
  const { isPublishedCustomerStory } = await import("@/lib/customers");
  const story = (id: string, title: string) => ({
    type: "page" as const,
    path: `${id}.mdx`,
    data: {
      title,
      description: `${title}, in short.`,
      date: "2026-11-13",
      image: `/customers/${id}/cover.svg`,
      imageAlt: `${title} cover`,
      toc: [],
      structuredData: {
        headings: [],
        contents: [{ heading: undefined, content: "Body text." }],
      },
      body: () => <p>Story body for {id}</p>,
    },
  });
  const files = [
    story("flam", "How Flam built its branded QR codes with QRdx"),
    story("acme", "How Acme did something"),
  ].filter((file) => isPublishedCustomerStory(file.path));
  const empty = () => loader({ baseUrl: "/", source: { files: [] } });
  return {
    customersSource: loader({ baseUrl: "/customers", source: { files } }),
    blogSource: empty(),
    blogAuthorsSource: empty(),
  };
});

vi.mock("@/mdx-components", () => ({ getMDXComponents: () => ({}) }));

const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const { renderIntl } = await import("../support/intl");
const index = await import("@/app/(app)/(home)/customers/page");
const storyPage = await import("@/app/(app)/(home)/customers/[slug]/page");
const storyImage = await import(
  "@/app/(app)/(home)/customers/[slug]/opengraph-image"
);
const { getCustomerStories } = await import(
  "@/app/(app)/(home)/customers/_lib/stories"
);

const hrefs = (html: string) =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);

describe("/customers", () => {
  it("lists only published customers, each linking to its story", async () => {
    const html = renderIntl(await index.default());
    expect(html).toContain("<h1");
    expect(html).toContain("Flam makes its branded QR codes with QRdx.");
    expect(html).toContain("Read the story");
    expect(hrefs(html)).toContain("/customers/flam");
    expect(html).not.toContain("Acme");
    expect(hrefs(html)).not.toContain("/customers/acme");
  });

  it("has one story per published customer", () => {
    expect(getCustomerStories().map(({ customer }) => customer.id)).toEqual([
      "flam",
    ]);
  });
});

describe("/customers/[slug]", () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("renders a published story at /customers/flam", async () => {
    const html = renderIntl(await storyPage.default(params("flam")));
    expect(html).toContain("How Flam built its branded QR codes with QRdx");
    expect(html).toContain("Story body for flam");
    expect(html).toContain("Case study");
    // The breadcrumb leads back to the section.
    expect(hrefs(html)).toContain("/customers");
    const metadata = await storyPage.generateMetadata(params("flam"));
    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/customers/flam",
    );
  });

  it("prerenders published stories only", () => {
    expect(storyPage.generateStaticParams()).toEqual([{ slug: "flam" }]);
  });

  it.each(["acme", "flam-branded-qr-codes", "nope"])(
    "answers 404 for %s, with no page, metadata or image",
    async (slug) => {
      await expect(storyPage.default(params(slug))).rejects.toMatchObject({
        digest: NOT_FOUND,
      });
      await expect(
        storyPage.generateMetadata(params(slug)),
      ).rejects.toMatchObject({ digest: NOT_FOUND });
      await expect(storyImage.default(params(slug))).rejects.toMatchObject({
        digest: NOT_FOUND,
      });
    },
  );
});
