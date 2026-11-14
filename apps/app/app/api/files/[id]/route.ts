import { deliverFile } from "@/lib/files/delivery";

type Context = { params: Promise<{ id: string }> };

/** Public link of an uploaded file (`?download=1` saves it under its name). */
export async function GET(req: Request, { params }: Context) {
  const { id } = await params;
  const download = new URL(req.url).searchParams.get("download") === "1";
  return deliverFile(req, id, { download });
}
