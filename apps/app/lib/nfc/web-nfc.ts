// Web NFC (Chrome on Android, over HTTPS): write a URL record to a tag and,
// optionally, make the tag read-only. Browser only; every call needs a tap
// or click first (the browser asks for NFC permission on the first one).

/** The parts of the Web NFC API this file uses (not in TypeScript's DOM types yet). */
interface NdefWriter {
  write(
    message: { records: { recordType: "url"; data: string }[] },
    options?: { overwrite?: boolean; signal?: AbortSignal },
  ): Promise<void>;
  makeReadOnly?: (options?: { signal?: AbortSignal }) => Promise<void>;
}

type NdefReaderConstructor = new () => NdefWriter;

function readerClass(): NdefReaderConstructor | null {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as { NDEFReader?: unknown }).NDEFReader;
  return typeof value === "function" ? (value as NdefReaderConstructor) : null;
}

/** This browser can write NFC tags (Web NFC is there and the page is secure). */
export function isWebNfcAvailable(): boolean {
  return readerClass() !== null && window.isSecureContext !== false;
}

/** This browser can also lock a tag (NDEFReader.makeReadOnly, Chrome 100+). */
export function canLockTags(): boolean {
  const Reader = readerClass();
  return Boolean(Reader && typeof Reader.prototype.makeReadOnly === "function");
}

/** Waits for a tag and writes one URL record to it, replacing what's there. */
export async function writeUrlToTag(
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<void> {
  const Reader = readerClass();
  if (!Reader)
    throw new DOMException("Web NFC is not available", "NotSupportedError");
  await new Reader().write(
    { records: [{ recordType: "url", data: url }] },
    { overwrite: true, signal },
  );
}

/** Waits for a tag and makes it permanently read-only. */
export async function lockTag({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<void> {
  const Reader = readerClass();
  const reader = Reader ? new Reader() : null;
  if (!reader?.makeReadOnly) {
    throw new DOMException(
      "Locking tags is not supported",
      "NotSupportedError",
    );
  }
  await reader.makeReadOnly({ signal });
}

export type NfcFailure =
  /** Cancelled here, or the page was hidden */
  | "aborted"
  /** NFC is blocked for this site */
  | "permission"
  /** NFC is turned off in the phone's settings */
  | "disabled"
  /** No NFC on this device, or the tag can't hold NDEF data */
  | "unsupported"
  /** The tag is read-only */
  | "locked"
  /** The link doesn't fit on the tag */
  | "too-small"
  /** The tag moved away or the connection dropped */
  | "connection"
  | "unknown";

/**
 * Sorts a Web NFC error into what the person can do about it. Chrome sends a
 * DOMException name per kind of failure; a read-only or full tag both arrive
 * as a NetworkError, told apart by the message where the platform gives one.
 */
export function classifyNfcError(error: unknown): NfcFailure {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  switch (name) {
    case "AbortError":
      return "aborted";
    case "NotAllowedError":
      return /read.?only|locked|write.?protect/i.test(message)
        ? "locked"
        : "permission";
    case "NotReadableError":
      return "disabled";
    case "NotSupportedError":
      return "unsupported";
    case "NetworkError":
      if (/read.?only|locked|write.?protect/i.test(message)) return "locked";
      if (
        /too (?:large|big|long)|capacity|not enough|exceed|size/i.test(message)
      ) {
        return "too-small";
      }
      return "connection";
    default:
      return "unknown";
  }
}

/** What to tell the person after a failed write or lock. */
export const NFC_FAILURE_MESSAGES: Record<
  NfcFailure,
  { title: string; description: string }
> = {
  aborted: {
    title: "Stopped",
    description: "Nothing was written. Start again when the tag is ready.",
  },
  permission: {
    title: "NFC is blocked for this site",
    description:
      "Allow NFC for this site in Chrome's site settings, then try again.",
  },
  disabled: {
    title: "NFC is turned off",
    description: "Turn on NFC in your phone's settings, then try again.",
  },
  unsupported: {
    title: "This tag can't be written",
    description:
      "It may not support NDEF (most NTAG213, 215 and 216 tags do). Try another tag. If none works, this phone may not have NFC.",
  },
  locked: {
    title: "This tag is locked",
    description:
      "It was made read-only, so it can't be changed. Use a new tag.",
  },
  "too-small": {
    title: "The link doesn't fit on this tag",
    description: "Use a tag with more memory, such as an NTAG215 or NTAG216.",
  },
  connection: {
    title: "The tag moved away",
    description:
      "Hold the tag still against the back of the phone until it says written. If it keeps failing, the tag may be locked or too small.",
  },
  unknown: {
    title: "Couldn't write the tag",
    description:
      "Try again, holding the tag still against the back of the phone. If it keeps failing, try another tag.",
  },
};
