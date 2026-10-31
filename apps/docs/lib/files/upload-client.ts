// Browser side of an upload: POST /api/files → PUT straight to storage →
// POST /api/files/<id>/finalize. Used by the file manager and block editors.

import {
  FILE_KIND_LABELS,
  type FileKind,
  type FileView,
  formatsForKinds,
  kindForMime,
  normalizeMime,
} from "./types";

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

interface PresignResponse {
  file: FileView;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
}

async function readError(response: Response): Promise<UploadError> {
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  return new UploadError(
    body?.message ?? `Upload failed (${response.status}).`,
    body?.code ?? "UPLOAD_FAILED",
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

function put(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new UploadError(
              `Storage rejected the upload (${xhr.status}).`,
              "STORAGE_REJECTED",
            ),
          );
    xhr.onerror = () =>
      reject(
        new UploadError(
          "The upload couldn't reach storage. Check your connection and try again.",
          "NETWORK_ERROR",
        ),
      );
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", "ABORTED"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Uploads one file into the active workspace and returns it once it's ready.
 * `kinds` limits what's accepted; `replaceId` swaps the content of an existing
 * file while keeping its link.
 */
export async function uploadFile(
  file: File,
  {
    kinds,
    replaceId,
    onProgress,
    signal,
  }: {
    kinds?: readonly FileKind[];
    replaceId?: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<FileView> {
  const mime = normalizeMime(file.type, file.name);
  if (!mime || (kinds && !kinds.includes(kindForMime(mime)))) {
    const label =
      kinds?.length === 1 ? FILE_KIND_LABELS[kinds[0] as FileKind] : "file";
    throw new UploadError(
      `"${file.name}" isn't a supported ${label.toLowerCase()}. Use ${formatsForKinds(kinds)}.`,
      "UNSUPPORTED_TYPE",
    );
  }
  if (file.size === 0) {
    throw new UploadError(`"${file.name}" is empty.`, "EMPTY_FILE");
  }

  const { file: pending, upload } = await postJson<PresignResponse>(
    "/api/files",
    { filename: file.name, mime, size: file.size, replaceId },
  );
  onProgress?.(0);
  await put(upload.url, file, upload.headers, onProgress, signal);
  const { file: ready } = await postJson<{ file: FileView }>(
    `/api/files/${encodeURIComponent(pending.id)}/finalize`,
    { replaceId },
  );
  return ready;
}
