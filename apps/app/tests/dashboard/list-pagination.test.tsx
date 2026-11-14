// The pager under the dashboard tables: plain links for Previous and Next
// (so links and Back work), disabled buttons at the ends, and nothing at all
// when there's one page and no page size to choose.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

const { ListPagination } = await import(
  "@/app/(app)/dashboard/_components/list-pagination"
);

const labels = {
  navigation: "Pagination",
  previous: "Previous",
  next: "Next",
  pageSize: "Rows per page",
};

describe("ListPagination", () => {
  it("renders nothing for a single page with no sizes", () => {
    expect(
      renderToStaticMarkup(
        <ListPagination
          labels={labels}
          nextHref={null}
          previousHref={null}
          summary="Page 1 of 1"
        />,
      ),
    ).toBe("");
  });

  it("links both ways in the middle, as rel prev and next", () => {
    const html = renderToStaticMarkup(
      <ListPagination
        labels={labels}
        nextHref="/codes?page=3"
        previousHref="/codes?page=1"
        summary="Page 2 of 3 · 60 codes"
      />,
    );
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain("Page 2 of 3 · 60 codes");
    expect(html).toMatch(
      /href="\/codes\?page=1"[^>]*rel="prev"|rel="prev"[^>]*href="\/codes\?page=1"/,
    );
    expect(html).toMatch(
      /href="\/codes\?page=3"[^>]*rel="next"|rel="next"[^>]*href="\/codes\?page=3"/,
    );
    expect(html).not.toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const first = renderToStaticMarkup(
      <ListPagination
        labels={labels}
        nextHref="/codes?page=2"
        previousHref={null}
        summary="Page 1 of 2"
      />,
    );
    expect(first).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
    const last = renderToStaticMarkup(
      <ListPagination
        labels={labels}
        nextHref={null}
        previousHref="/codes"
        summary="Page 2 of 2"
      />,
    );
    expect(last).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
  });

  it("shows the page size control even on one page when sizes are offered", () => {
    const html = renderToStaticMarkup(
      <ListPagination
        labels={labels}
        nextHref={null}
        previousHref={null}
        sizes={{
          value: 100,
          options: [
            { value: 25, label: "25 per page", href: "/codes" },
            { value: 100, label: "100 per page", href: "/codes?size=100" },
          ],
        }}
        summary="Page 1 of 1 · 60 codes"
      />,
    );
    expect(html).toContain('aria-label="Rows per page"');
    expect(html).toContain("Page 1 of 1 · 60 codes");
  });
});
