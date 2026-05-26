// Analyzer profile: node --check .github/scripts/generate-staging-pr-body.mjs
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE_BRANCH = process.env.BASE_BRANCH ?? "main";
const HEAD_BRANCH = process.env.HEAD_BRANCH ?? "staging";
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? "";
const MAX_COMMITS = 200;

if (BASE_BRANCH.length === 0 || HEAD_BRANCH.length === 0) {
  throw new Error("BASE_BRANCH and HEAD_BRANCH must be non-empty");
}

if (REPOSITORY.length === 0) {
  throw new Error("GITHUB_REPOSITORY must be set");
}

function runGit(command) {
  return execSync(command, { encoding: "utf-8" }).trim();
}

function escapeMarkdown(text) {
  return text.replaceAll("|", "\\|");
}

const commitLines = runGit(
  `git log origin/${BASE_BRANCH}..origin/${HEAD_BRANCH} --pretty=format:"%H|%s|%an" --reverse -n ${MAX_COMMITS}`,
);

if (commitLines.length === 0) {
  console.log("No commits ahead of main; skipping PR generation.");
  process.exit(2);
}

const commits = commitLines.split("\n").filter((line) => line.length > 0);
if (commits.length >= MAX_COMMITS) {
  throw new Error(`Commit count reached MAX_COMMITS (${MAX_COMMITS})`);
}

const changeList = commits.map((line) => {
  const parts = line.split("|");
  if (parts.length < 3) {
    throw new Error(`Unexpected commit format: ${line}`);
  }
  const hash = parts[0];
  const subject = parts.slice(1, -1).join("|");
  const author = parts.at(-1);
  return `- ${escapeMarkdown(subject)} (\`${hash.slice(0, 7)}\`, ${escapeMarkdown(author ?? "unknown")})`;
});

const diffStat = runGit(`git diff --shortstat origin/${BASE_BRANCH}..origin/${HEAD_BRANCH}`);
const latestSubject = commits.at(-1)?.split("|")[1] ?? "Staging updates";
const hasBreaking = commits.some((line) => /BREAKING CHANGE|!:|\bbreaking\b/i.test(line));

const compareUrl = `https://github.com/${REPOSITORY}/compare/${BASE_BRANCH}...${HEAD_BRANCH}`;
const commitCount = commits.length;

const description =
  commitCount === 1
    ? `This PR merges 1 commit from \`${HEAD_BRANCH}\` into \`${BASE_BRANCH}\`. Latest change: **${escapeMarkdown(latestSubject)}**.`
    : `This PR merges ${commitCount} commits from \`${HEAD_BRANCH}\` into \`${BASE_BRANCH}\`. Latest change: **${escapeMarkdown(latestSubject)}**.`;

const body = `## Description
${description}

**Diff summary:** ${diffStat || "No file changes detected."}

**Compare:** ${compareUrl}

## Changes
${changeList.join("\n")}

## Motivation
\`${HEAD_BRANCH}\` was updated and is ready to be promoted to \`${BASE_BRANCH}\`. This PR was opened automatically after the latest push to \`${HEAD_BRANCH}\`.

## Breaking Changes
${hasBreaking ? "Potential breaking changes detected in commit messages. Review carefully before merging." : "None detected from commit messages."}

## Screenshots
N/A — automated release PR from \`${HEAD_BRANCH}\` to \`${BASE_BRANCH}\`.
`;

const title =
  commitCount === 1
    ? `Release: ${latestSubject}`
    : `Release: Merge ${HEAD_BRANCH} into ${BASE_BRANCH} (${commitCount} commits)`;

writeFileSync("pr-title.txt", title, "utf-8");
writeFileSync("pr-body.md", body, "utf-8");

console.log(`Generated PR title: ${title}`);
console.log(`Included ${commitCount} commit(s).`);
