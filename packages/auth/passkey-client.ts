import { getPasskeyActions } from "@better-auth/passkey/client";

// Adding a passkey from Settings. The browser half (creating the credential
// with the platform's passkey prompt) is the plugin client's own code; its
// two requests go to the app's server actions instead of the HTTP endpoints,
// which are off (SERVER_ONLY_PASSKEY_PATHS in ./passkey.ts).

type Result<T> =
  | { data: T; error: null }
  | {
      data: null;
      error: { code?: string; message?: string; status: number };
    };

export interface PasskeyRegistrationSteps {
  /** Registration options from the server (sets the challenge cookie). */
  options: () => Promise<Result<Record<string, unknown>>>;
  /** Verifies and saves the new passkey. */
  verify: (body: {
    response: Record<string, unknown>;
    name?: string;
  }) => Promise<Result<{ id: string }>>;
}

const OPTIONS_PATH = "/passkey/generate-register-options";
const VERIFY_PATH = "/passkey/verify-registration";

/**
 * Runs the browser's passkey prompt between the two steps. Resolves the
 * plugin client's `{ data, error }`; error codes are WebAuthnError codes
 * from @simplewebauthn/browser, or the server step's own.
 */
export function addPasskeyWith(
  steps: PasskeyRegistrationSteps,
  { name }: { name?: string } = {}
) {
  const route = (path: string, init?: { body?: unknown }) => {
    if (path === OPTIONS_PATH) return steps.options();
    if (path === VERIFY_PATH) {
      return steps.verify(init?.body as Parameters<typeof steps.verify>[0]);
    }
    return Promise.resolve({
      data: null,
      error: { code: "UNKNOWN_ERROR", status: 500 },
    });
  };
  const actions = getPasskeyActions(
    route as unknown as Parameters<typeof getPasskeyActions>[0],
    {
      // The plugin refreshes its own passkey list and session atoms; the
      // settings page refreshes from the server instead.
      $listPasskeys: { set: () => undefined },
      $store: { notify: () => undefined },
    } as unknown as Parameters<typeof getPasskeyActions>[1]
  );
  return actions.passkey.addPasskey({ name });
}
