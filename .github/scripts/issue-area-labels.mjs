// Area labels for issues opened from the forms in .github/ISSUE_TEMPLATE.
//
// An issue form can only apply the fixed labels in its `labels:` key, never
// one picked from a dropdown answer. .github/workflows/issue-area-labels.yml
// reads the "Area" answer from a new issue's body and adds the label this map
// gives it. The keys must match the dropdown options in bug_report.yml and
// feature_request.yml exactly; apps/app/tests/repo/issue-forms.test.ts
// checks that in CI.

/** Dropdown option → label. `null` means no area label. */
export const AREA_LABELS = {
  "Playground (editor, styles, art, AI chat, downloads)": "area: playground",
  "Dynamic codes, short links, custom domains and analytics":
    "area: dynamic codes",
  "Hosted pages and forms": "area: pages",
  "Dashboard, workspaces and account settings": "area: dashboard",
  "REST API (api.qrdx.dev/v1)": "area: api",
  "Image API (api.qrdx.dev/v1/qr)": "area: image api",
  "MCP server (mcp.qrdx.dev/mcp)": "area: mcp",
  "React library (qrdx on npm)": "area: react library",
  "CLI (@qrdx/cli)": "area: cli",
  "Chrome extension": "area: plugins",
  "Figma plugin": "area: plugins",
  "Raycast extension": "area: plugins",
  "Canva app": "area: plugins",
  Integrations: "area: integrations",
  "Community (shared frames and themes)": "area: community",
  "Free tools (bulk generator, scan checker, print size, scanner)":
    "area: tools",
  "Self-hosting and Docker": "self-hosting",
  Docs: "documentation",
  "Something else or not sure": null,
};

// A form renders each answer under a "### <field label>" heading, followed by
// a blank line and the answer ("_No response_" when it was left empty).
const AREA_ANSWER = /^### Area[ \t]*\r?\n(?:[ \t]*\r?\n)*([^\r\n]+)/m;

/**
 * The area label for the body of an issue opened from a form, or null when
 * the body has no Area answer or the answer has no label.
 * @param {string | null | undefined} body
 * @returns {string | null}
 */
export function areaLabelFor(body) {
  const match = AREA_ANSWER.exec(body ?? "");
  if (!match) return null;
  const answer = match[1].trim();
  return Object.hasOwn(AREA_LABELS, answer) ? AREA_LABELS[answer] : null;
}
