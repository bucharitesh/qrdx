import { getPasskeyActions } from "@better-auth/passkey/client";
import {
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  WebAuthnAbortService,
  WebAuthnError,
} from "@simplewebauthn/browser";

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

// ─── A passkey as the second step of signing in ─────────────────────────────
// The browser half of ./sign-in-challenge-passkey.ts: request options from
// the server, the platform's passkey prompt, then the assertion back.

export interface PasskeyStepRequests {
  /** POST /two-factor/passkey/options for the pending challenge. */
  options: () => Promise<Result<Record<string, unknown>>>;
  /** POST /two-factor/passkey/verify with the assertion. */
  verify: (body: {
    response: Record<string, unknown>;
  }) => Promise<Result<unknown>>;
}

export type PasskeyStepResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * "prompt": the browser's prompt was closed, timed out, or refused to
       * open (NotAllowedError; browsers don't say which). "aborted": another
       * prompt or a method switch replaced it. "browser": any other WebAuthn
       * failure. "server": the options or verify request failed.
       */
      kind: "prompt" | "aborted" | "browser" | "server";
      /** WebAuthnError code, or the server's error code. */
      code?: string;
      status?: number;
      /** How long the browser's prompt was up, in ms (0 if it never ran). */
      promptMs: number;
    };

/** Options older than this are fetched again (the server keeps them 5 min). */
const OPTIONS_FRESH_MS = 4 * 60 * 1000;

function browserFailure(error: unknown): "prompt" | "aborted" | "browser" {
  const cause =
    error instanceof WebAuthnError ? (error.cause as Error | undefined) : error;
  const name = (cause as { name?: string } | undefined)?.name;
  if (error instanceof WebAuthnError && error.code === "ERROR_CEREMONY_ABORTED")
    return "aborted";
  if (name === "NotAllowedError") return "prompt";
  if (name === "AbortError") return "aborted";
  return "browser";
}

/**
 * A passkey second step for one pending challenge. `run()` opens the
 * browser's passkey prompt and verifies the result; options fetched ahead
 * with `prepare()` (or left over from a closed prompt) are reused while
 * fresh, so a click can open the prompt without a request in between
 * (some browsers only allow it straight from the click).
 */
export function passkeyStep(requests: PasskeyStepRequests) {
  let cached: { options: Record<string, unknown>; at: number } | null = null;

  const load = async (): Promise<
    | { ok: true; options: Record<string, unknown> }
    | { ok: false; code?: string; status?: number }
  > => {
    if (cached && Date.now() - cached.at < OPTIONS_FRESH_MS) {
      return { ok: true, options: cached.options };
    }
    const { data, error } = await requests.options();
    if (error || !data) {
      return { ok: false, code: error?.code, status: error?.status };
    }
    cached = { options: data, at: Date.now() };
    return { ok: true, options: data };
  };

  return {
    /** Fetches options ahead of a click; failures surface on run(). */
    prepare: async () => {
      await load().catch(() => undefined);
    },
    run: async ({
      onPromptDone,
    }: {
      /** The prompt returned a passkey; the server check starts now. */
      onPromptDone?: () => void;
    } = {}): Promise<PasskeyStepResult> => {
      const loaded = await load();
      if (!loaded.ok) {
        return {
          ok: false,
          kind: "server",
          code: loaded.code,
          status: loaded.status,
          promptMs: 0,
        };
      }
      const started = Date.now();
      let assertion: Awaited<ReturnType<typeof startAuthentication>>;
      try {
        assertion = await startAuthentication({
          optionsJSON:
            loaded.options as unknown as PublicKeyCredentialRequestOptionsJSON,
        });
      } catch (error) {
        const kind = browserFailure(error);
        return {
          ok: false,
          kind,
          code: error instanceof WebAuthnError ? error.code : undefined,
          promptMs: Date.now() - started,
        };
      }
      const promptMs = Date.now() - started;
      // Sent: the server uses up this challenge whatever the answer.
      cached = null;
      onPromptDone?.();
      const { error } = await requests.verify({
        response: assertion as unknown as Record<string, unknown>,
      });
      if (error) {
        return {
          ok: false,
          kind: "server",
          code: error.code,
          status: error.status,
          promptMs,
        };
      }
      return { ok: true };
    },
    /** Closes an open prompt (switching to another method). */
    cancel: () => {
      WebAuthnAbortService.cancelCeremony();
    },
  };
}
