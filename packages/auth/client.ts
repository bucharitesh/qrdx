import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    lastLoginMethodClient(),
    adminClient(),
    organizationClient(),
    emailOTPClient(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  useActiveOrganization,
  useListOrganizations,
} = authClient;
