"use client";

import { useQuery } from "@tanstack/react-query";

interface GithubRepo {
  stargazers_count: number;
}

async function fetchGithubStars(owner: string, repo: string): Promise<number> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        next: { revalidate: 3600 }, // Cache for 1 hour
      },
    );

    if (!response.ok) {
      return 0;
    }

    const data: GithubRepo = await response.json();
    return data.stargazers_count;
  } catch (error) {
    console.error("Failed to fetch GitHub stars:", error);
    return 0;
  }
}

export function useGithubStars(owner: string, repo: string) {
  const { data: stargazersCount = 0 } = useQuery({
    queryKey: ["github-stars", owner, repo],
    queryFn: () => fetchGithubStars(owner, repo),
    staleTime: 3600000, // 1 hour
  });

  return { stargazersCount };
}
