// Browser half of scripts/ai/art-previews.ts: bundled with `bun build` and
// loaded into headless Chrome, it scores each image with qrdx's
// getImageScanScore, the check the AI art result card runs in the browser
// (components/sections/ai-art/image-utils.ts), so a preview is kept on the
// same "Great" bar a user's image is graded on.
import { getImageScanScore } from "qrdx";

export interface PreviewScore {
  url: string;
  /** What the code decoded to, or null when no code was found */
  data: string | null;
  score: number | null;
  grade: string | null;
  error?: string;
}

async function scoreOne(url: string): Promise<PreviewScore> {
  try {
    const blob = await (await fetch(url)).blob();
    const result = await getImageScanScore(blob);
    return {
      url,
      data: result.data,
      score: result.score,
      grade: result.grade,
    };
  } catch (error) {
    return { url, data: null, score: null, grade: null, error: String(error) };
  }
}

declare global {
  interface Window {
    scorePreviews: (urls: string[]) => Promise<PreviewScore[]>;
  }
}

window.scorePreviews = async (urls) => {
  const scores: PreviewScore[] = [];
  for (const url of urls) scores.push(await scoreOne(url));
  return scores;
};
