// components/infinite/infinite-list.tsx as the server draws it: the first
// page, then LoadMore (components/load-more.tsx) whose button is a plain
// link to the next numbered page with the list's filters, so crawlers and
// visitors without script page through the list too. LoadMore without
// `href` stays the signed-in lists' button.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfiniteList } from "@/components/infinite/infinite-list";
import { LoadMore } from "@/components/load-more";

const labels = { loadMore: "Load more", loading: "Loading", failed: "Failed" };
const items = ["a", "b"].map((key) => ({ key, node: <p>{key}</p> }));
const loadPage = async () => ({ items: [], nextPage: null });

describe("InfiniteList", () => {
  it("links the next page with the list's filters kept", () => {
    const html = renderToStaticMarkup(
      <InfiniteList
        className="grid"
        href="/community/frames?from=official&sort=newest"
        initialItems={items}
        labels={labels}
        listKey="community:frames?from=official&sort=newest"
        loadPage={loadPage}
        nextPage={2}
      />,
    );
    expect(html).toContain('<div class="grid"><p>a</p><p>b</p></div>');
    expect(html).toContain("data-load-more");
    expect(html).toMatch(
      /<a[^>]*href="\/community\/frames\?from=official&amp;sort=newest&amp;page=2"[^>]*rel="next"[^>]*>Load more<\/a>/,
    );
  });

  it("shows a button without a numbered page, and nothing at the end", () => {
    const button = renderToStaticMarkup(
      <InfiniteList
        initialItems={items}
        labels={labels}
        listKey="list"
        loadPage={loadPage}
        nextPage={2}
      />,
    );
    expect(button).toMatch(
      /<button[^>]*type="button"[^>]*>Load more<\/button>/,
    );
    expect(button).not.toContain("<a ");
    const end = renderToStaticMarkup(
      <InfiniteList
        href="/community/frames"
        initialItems={items}
        labels={labels}
        listKey="list"
        loadPage={loadPage}
        nextPage={null}
      />,
    );
    expect(end).not.toContain("Load more");
    expect(end).not.toContain("data-load-more");
  });
});

describe("LoadMore", () => {
  it("is a button unless given a link", () => {
    const props = {
      hasMore: true,
      loading: false,
      onLoadMore: () => undefined,
      labels: { loadMore: "Load more" },
    };
    expect(renderToStaticMarkup(<LoadMore {...props} />)).toMatch(
      /<button[^>]*type="button"[^>]*>Load more<\/button>/,
    );
    expect(
      renderToStaticMarkup(<LoadMore {...props} href="/list?page=2" />),
    ).toMatch(
      /<a[^>]*href="\/list\?page=2"[^>]*rel="next"[^>]*>Load more<\/a>/,
    );
  });
});
