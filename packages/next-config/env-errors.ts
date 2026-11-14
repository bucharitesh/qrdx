import type { StandardSchemaV1 } from "@t3-oss/env-core";

// How a missing or invalid environment variable is reported: by every
// package's keys.ts and by the app's env.ts, which extends them. Messages name
// variables, never their values.

/**
 * The template that lists and explains every variable: the main app's,
 * unless an app passes its own to validateTogether().
 */
const DEFAULT_TEMPLATE = "apps/docs/.env.example";

type Issue = StandardSchemaV1.Issue;

// While validateTogether() runs, each keys() adds its problems here instead
// of throwing, so one error names every variable at once.
let collecting: Issue[] | null = null;

function variableName(issue: Issue): string {
  const segment = issue.path?.[0];
  const key =
    typeof segment === "object" && segment !== null ? segment.key : segment;
  return key === undefined ? "(unknown)" : String(key);
}

function describe(issue: Issue): string {
  return issue.message.includes("received undefined")
    ? "missing"
    : issue.message;
}

function fail(
  issues: readonly Issue[],
  template: string = DEFAULT_TEMPLATE
): never {
  const names = [...new Set(issues.map(variableName))];
  const local = template.replace(/\.env\.example$/, ".env.local");
  console.error(
    [
      "❌ Invalid environment variables:",
      ...issues.map((issue) => `  ${variableName(issue)}: ${describe(issue)}`),
      "",
      `Set them in ${local} (copy ${template}, which explains each one) or in your host's environment settings.`,
    ].join("\n")
  );
  throw new Error(
    `Invalid environment variables: ${names.join(", ")}. See ${template}.`
  );
}

/** createEnv's onValidationError, for every keys() and the app's env.ts. */
export function onValidationError(issues: readonly Issue[]): never {
  if (collecting) {
    collecting.push(...issues);
    // Stands in for this group's values; validateTogether() throws next.
    return {} as never;
  }
  return fail(issues);
}

/**
 * Runs `create` (the app's createEnv, with the keys() it extends) and
 * reports every invalid variable in one error, instead of stopping at the
 * first package whose keys fail. `template` is the app's .env.example, from
 * the repository root, which the error points to.
 */
export function validateTogether<T>(
  create: () => T,
  { template = DEFAULT_TEMPLATE }: { template?: string } = {}
): T {
  const issues: Issue[] = [];
  collecting = issues;
  try {
    const env = create();
    if (issues.length > 0) {
      fail(issues, template);
    }
    return env;
  } finally {
    collecting = null;
  }
}
