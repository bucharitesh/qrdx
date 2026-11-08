import { registerSignInCodeSender } from "@repo/auth/email-otp";
import { registerNewSignInNotifier } from "@repo/auth/new-sign-in";
import { registerBackupCodeNotifier } from "@repo/auth/sign-in-challenge";
import { registerTwoFactorResetCancelledNotifier } from "@repo/auth/two-factor-reset";
import { notifyNewSignIn } from "@/lib/account/new-sign-in-notice-server";
import { notifyBackupCodeUsed } from "@/lib/account/two-factor-notice-server";
import { notifyTwoFactorResetCancelled } from "@/lib/account/two-factor-reset-server";
import { sendSignInCode } from "@/lib/auth/sign-in-code";

// @repo/auth has no email stack: this is the endpoint that issues sign-in
// codes and finishes sign-ins, so it hands the plugins the app's senders
// before serving requests.
registerSignInCodeSender(sendSignInCode);
registerNewSignInNotifier(notifyNewSignIn);
registerBackupCodeNotifier(notifyBackupCodeUsed);
registerTwoFactorResetCancelledNotifier(notifyTwoFactorResetCancelled);

export { GET, POST } from "@repo/auth/handlers";
