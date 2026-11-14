// The client analytics layer lives in @repo/analytics (packages/analytics);
// this path stays for the app's imports. ./privacy registers the app's
// untracked pages first.
import "./privacy";

export * from "@repo/analytics";
