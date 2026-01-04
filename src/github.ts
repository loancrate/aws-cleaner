import { graphql as github } from "@octokit/graphql";

export interface GithubConfig {
  token: string;
  owner: string;
  repository: string;
}

export interface PullRequestNumbers {
  openPRs: number[];
  lastPR: number;
}

export async function getPullRequestNumbers({ token, owner, repository }: GithubConfig): Promise<PullRequestNumbers> {
  const githubClient = github.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });
  const response = await githubClient<{
    repository: {
      openPullRequests: { nodes: { number: number }[] };
      lastPullRequest: { nodes: { number: number }[] };
    };
  }>(
    `query pullRequests($owner: String!, $repository: String!) {
  repository(owner: $owner, name: $repository) {
    openPullRequests: pullRequests(first: 100, states: [OPEN]) {
      nodes {
        number
      }
    }
    lastPullRequest: pullRequests(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number
      }
    }
  }
}`,
    {
      owner,
      repository,
    },
  );
  const openPRs = response.repository.openPullRequests.nodes.map((node) => node.number);
  const lastPR = response.repository.lastPullRequest.nodes[0].number;
  return { openPRs, lastPR };
}
