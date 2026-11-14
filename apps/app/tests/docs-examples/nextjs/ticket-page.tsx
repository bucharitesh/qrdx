import { QRCodeSVG } from "qrdx";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const url = `https://example.com/check-in/${encodeURIComponent(id)}`;
  return <QRCodeSVG value={url} size={200} margin={4} level="H" />;
}
