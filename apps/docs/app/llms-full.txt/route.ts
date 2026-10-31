import { getLLMText } from "@/lib/get-llm-text";
import { baseUrl } from "@/lib/metadata";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  const header = `# QRdx documentation (full text)\n\nComplete docs for qrdx, the open-source (AGPL-3.0) QR code generator and React library. Page URLs below are relative to ${baseUrl.origin}. Index: ${new URL("/llms.txt", baseUrl).toString()}`;

  return new Response([header, ...scanned].join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
