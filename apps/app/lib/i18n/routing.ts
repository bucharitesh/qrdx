// The next.config.ts rewrites and redirects for translated pages live in
// @repo/i18n (packages/i18n/routing.ts), beside the paths they're built
// from. next.config.ts imports them from the package; this path stays for
// the app's other imports and the tests.

export * from "@repo/i18n/routing";
