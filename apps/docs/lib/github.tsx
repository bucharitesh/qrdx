/** biome-ignore-all lint/suspicious/noAssignInExpressions: false positive */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: false positive */
import { App, type Octokit } from "octokit";
import type { ActionResponse, Feedback } from "@/components/feedback";
import { env } from "@/lib/env";

export const repo = "qrdx";
export const owner = "bucharitesh";
export const DocsCategory = "Docs Feedback";

let instance: Octokit | undefined;

async function getOctokit(): Promise<Octokit> {
  if (instance) return instance;
  const appId = env.GITHUB_APP_ID;
  const privateKey = env.GITHUB_CLIENT_SECRET;

  if (!appId || !privateKey) {
    throw new Error(
      "No GitHub keys provided for Github app, docs feedback feature will not work.",
    );
  }

  const app = new App({
    appId,
    privateKey,
  });

  const { data } = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    {
      owner,
      repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  instance = await app.getInstallationOctokit(data.id);
  return instance;
}
interface RepositoryInfo {
  id: string;
  discussionCategories: {
    nodes: {
      id: string;
      name: string;
    }[];
  };
}

let cachedDestination: RepositoryInfo | undefined;
async function getFeedbackDestination() {
  if (cachedDestination) return cachedDestination;
  const octokit = await getOctokit();

  const {
    repository,
  }: {
    repository: RepositoryInfo;
  } = await octokit.graphql(`
  query {
    repository(owner: "${owner}", name: "${repo}") {
      id
      discussionCategories(first: 25) {
        nodes { id name }
      }
    }
  }
`);

  return (cachedDestination = repository);
}

export async function onRateAction(
  url: string,
  feedback: Feedback,
): Promise<ActionResponse> {
  "use server";
  const octokit = await getOctokit();
  const destination = await getFeedbackDestination();
  if (!octokit || !destination)
    throw new Error("GitHub comment integration is not configured.");

  const category = destination.discussionCategories.nodes.find(
    (category) => category.name === DocsCategory,
  );

  if (!category)
    throw new Error(
      `Please create a "${DocsCategory}" category in GitHub Discussion`,
    );

  const title = `Feedback for ${url}`;
  const body = `[${feedback.opinion}] ${feedback.message}\n\n> Forwarded from user feedback.`;

  let {
    search: {
      nodes: [discussion],
    },
  }: {
    search: {
      nodes: { id: string; url: string }[];
    };
  } = await octokit.graphql(`
          query {
            search(type: DISCUSSION, query: ${JSON.stringify(`${title} in:title repo:${owner}/${repo} author:@me`)}, first: 1) {
              nodes {
                ... on Discussion { id, url }
              }
            }
          }`);

  if (discussion) {
    await octokit.graphql(`
            mutation {
              addDiscussionComment(input: { body: ${JSON.stringify(body)}, discussionId: "${discussion.id}" }) {
                comment { id }
              }
            }`);
  } else {
    const result: {
      discussion: { id: string; url: string };
    } = await octokit.graphql(`
            mutation {
              createDiscussion(input: { repositoryId: "${destination.id}", categoryId: "${category.id}", body: ${JSON.stringify(body)}, title: ${JSON.stringify(title)} }) {
                discussion { id, url }
              }
            }`);

    discussion = result.discussion;
  }

  return {
    githubUrl: discussion.url,
  };
}

interface GitHubIssueUrlParams {
  owner: string;
  repo: string;
  title?: string;
  body?: string;
  labels?: string[];
  template?: string;
  projects?: string[];
  assignees?: string[];
  milestone?: string;
}

/**
 * Generates a GitHub issue URL with the provided parameters.
 * https://docs.github.com/en/issues/tracking-your-work-with-issues/creating-an-issue#creating-an-issue-from-a-url-query
 *
 * @param params - Parameters for the GitHub issue URL.
 * @param params.owner - The GitHub repository owner's username.
 * @param params.repo - The name of the GitHub repository.
 * @param params.title - Optional title of the issue.
 * @param params.body - Optional body content of the issue.
 * @param params.labels - Optional array of labels for the issue.
 * @param params.template - Optional template file name for the issue.
 * @param params.projects - Optional array of project names to associate with the issue.
 * @param params.assignees - Optional array of usernames to assign the issue to.
 * @param params.milestone - Optional milestone to associate with the issue.
 * @returns A string containing the generated GitHub issue URL.
 */
export function getGitHubIssueUrl(params: GitHubIssueUrlParams): string {
  const { owner, repo, ...issueParams } = params;
  const baseUrl = `https://github.com/${owner}/${repo}/issues/new`;
  const urlParams = new URLSearchParams();

  Object.entries(issueParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => urlParams.append(key, item));
    } else if (value !== undefined) {
      urlParams.append(key, value.toString());
    }
  });

  return `${baseUrl}?${urlParams.toString()}`;
}

interface GithubFileUrlParams {
  owner: string;
  repo: string;
  slug: string;
}

export function getGithubFileUrl(params: GithubFileUrlParams) {
  const { owner, repo, slug } = params;
  return `https://github.com/${owner}/${repo}/edit/main/apps/docs/content${
    slug === "/docs" ? "/docs/index" : slug
  }.mdx`;
}
