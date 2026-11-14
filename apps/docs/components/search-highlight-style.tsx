/**
 * How fumadocs search marks matching words (CSS Custom Highlight API,
 * highlight name "fd-search"). fumadocs ships it as Tailwind classes, but
 * Next's CSS optimizer doesn't recognise ::highlight() yet and warns on every
 * build, so styles/styles.css drops those classes and this inline rule takes
 * their place. The CSP's style-src allows inline styles.
 */
const RULE =
  "::highlight(fd-search){color:var(--color-fd-primary);text-decoration-line:underline}";

export function SearchHighlightStyle() {
  return <style>{RULE}</style>;
}
