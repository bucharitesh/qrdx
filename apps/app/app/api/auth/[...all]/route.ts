import { registerSignInCodeSender } from "@repo/auth/email-otp";
import { registerNewSignInNotifier } from "@repo/auth/new-sign-in";
import { registerBackupCodeNotifier } from "@repo/auth/sign-in-challenge";
import { registerTwoFactorResetCancelledNotifier } from "@repo/auth/two-factor-reset";
// Hands packages/auth the audit log's recorder for team changes.
import "@/ee/audit-log/auth-changes";
// And the recorder for new accounts: an affiliate referral and how the
// sign-up's visit started.
import "@/lib/analytics/sign-up-hook";
import { notifyNewSignIn } from "@/lib/account/new-sign-in-notice-server";
import { registerAppSessionOriginReader } from "@/lib/account/session-origin";
import { notifyBackupCodeUsed } from "@/lib/account/two-factor-notice-server";
import { notifyTwoFactorResetCancelled } from "@/lib/account/two-factor-reset-server";
import { sendSignInCode } from "@/lib/auth/sign-in-code";

// @repo/auth has no email stack: this is the endpoint that issues sign-in
// codes and finishes sign-ins, so it hands the plugins the app's senders
// before serving requests.
registerSignInCodeSender(sendSignInCode);
registerNewSignInNotifier(notifyNewSignIn);
registerBackupCodeNotifier(notifyBackupCodeUsed);
// Where each new session starts, and the check on the ones it holds
// (lib/account/session-origin.ts). instrumentation.ts does this at start-up.
registerAppSessionOriginReader();
registerTwoFactorResetCancelledNotifier(notifyTwoFactorResetCancelled);

export { GET, POST } from "@repo/auth/handlers";
