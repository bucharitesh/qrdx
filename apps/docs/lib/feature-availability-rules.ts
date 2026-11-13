// The feature availability rules live in @repo/availability
// (packages/availability/rules.ts), so QRdx's other apps share them. This
// path stays for the app's imports; lib/feature-availability.ts feeds the
// rules the server environment.

export * from "@repo/availability";
