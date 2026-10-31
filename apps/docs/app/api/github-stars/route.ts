// Star count for the header GitHub pill. Fetched on the server at most once
// an hour, so visitors never hit GitHub's 60-requests-an-hour anonymous limit
// (which made the pill fall back to "Star" for busy networks).

const REPO = "bucharitesh/qrdx";

export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate },
    });
    if (!res.ok) return stars(null);
    const data: { stargazers_count?: number } = await res.json();
    return stars(data.stargazers_count ?? null);
  } catch {
    return stars(null);
  }
}

function stars(count: number | null) {
  return Response.json(
    { stars: count },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${count === null ? 300 : revalidate}, stale-while-revalidate=86400`,
      },
    },
  );
}
