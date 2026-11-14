// bun run --filter app i18n:docs-messages
//
// Writes the docs' namespaces of every catalog (messages/<locale>.json) to
// packages/i18n/messages/<locale>.json, the copy another app (the docs site)
// loads through @repo/i18n/docs-messages. That app runs it right before it
// builds or starts; the copy isn't committed (lib/i18n/docs-messages.ts).
import { DOCS_MESSAGES_DIR } from "@repo/i18n/messages";
import { writeDocsMessages } from "@/lib/i18n/docs-messages";

const changed = writeDocsMessages();
console.log(
  changed.length === 0
    ? `${DOCS_MESSAGES_DIR} is up to date.`
    : `Wrote ${changed.map((name) => `${DOCS_MESSAGES_DIR}/${name}`).join(", ")}.`,
);
