import { lastLoginMethodClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const { signIn, signOut, signUp, useSession } = createAuthClient({
  plugins: [lastLoginMethodClient()],
});
