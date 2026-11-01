import "server-only";

export type Loaded<T> = { ok: true; data: T } | { ok: false };

/**
 * Runs one section's queries; a failure is logged and becomes a notice in
 * that section instead of an error page.
 */
export async function safeLoad<T>(
  section: string,
  load: () => Promise<T>,
): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "admin.section_failed",
        section,
        error: error instanceof Error ? error.message.slice(0, 300) : "error",
      }),
    );
    return { ok: false };
  }
}
