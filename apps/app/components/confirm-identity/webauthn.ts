/**
 * The browser half of checking a passkey: the platform's prompt
 * (navigator.credentials.get) with options from the server, and the answer
 * in the JSON shape the server checks (WebAuthn's
 * AuthenticationResponseJSON). Client only. The server does every check;
 * this only converts between base64url strings and bytes.
 */

interface CredentialDescriptorJSON {
  id: string;
  type?: string;
  transports?: string[];
}

export interface AssertionOptionsJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  allowCredentials?: CredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
}

export interface AssertionJSON {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
}

/** Why the prompt didn't give an answer. */
export type PasskeyPromptFailure =
  /** Closed, timed out, or the browser wanted a click first */
  | "not-allowed"
  /** No WebAuthn here, or the page's origin can't use these passkeys */
  | "unsupported"
  | "failed";

export class PasskeyPromptError extends Error {
  constructor(readonly reason: PasskeyPromptFailure) {
    super(reason);
    this.name = "PasskeyPromptError";
  }
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Opens the passkey prompt; resolves the answer or throws PasskeyPromptError. */
export async function getPasskeyAssertion(
  options: AssertionOptionsJSON,
  signal?: AbortSignal,
): Promise<AssertionJSON> {
  if (
    typeof window === "undefined" ||
    typeof window.PublicKeyCredential !== "function" ||
    typeof navigator.credentials?.get !== "function"
  ) {
    throw new PasskeyPromptError("unsupported");
  }
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      signal,
      publicKey: {
        challenge: fromBase64Url(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: "required",
        allowCredentials: options.allowCredentials?.map((entry) => ({
          id: fromBase64Url(entry.id),
          type: "public-key" as const,
          transports: entry.transports as AuthenticatorTransport[] | undefined,
        })),
      },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "AbortError") {
      throw new PasskeyPromptError("not-allowed");
    }
    if (name === "SecurityError" || name === "NotSupportedError") {
      throw new PasskeyPromptError("unsupported");
    }
    throw new PasskeyPromptError("failed");
  }
  if (!(credential instanceof PublicKeyCredential)) {
    throw new PasskeyPromptError("not-allowed");
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      ...(response.userHandle
        ? { userHandle: toBase64Url(response.userHandle) }
        : {}),
    },
    clientExtensionResults: credential.getClientExtensionResults() as Record<
      string,
      unknown
    >,
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}
