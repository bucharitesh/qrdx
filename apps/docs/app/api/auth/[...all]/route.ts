import { registerSignInCodeSender } from "@repo/auth/email-otp";
import { sendSignInCode } from "@/lib/auth/sign-in-code";

// @repo/auth has no email stack: this is the endpoint that issues sign-in
// codes, so it hands the plugin the app's sender before serving requests.
registerSignInCodeSender(sendSignInCode);

export { GET, POST } from "@repo/auth/handlers";
