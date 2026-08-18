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

interface PullRequestsResponse {
  repository: {
    openPullRequests: {
      nodes: { number: number }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    lastPullRequest: { nodes: { number: number }[] };
  };
}

// Maximum page size allowed by the GitHub GraphQL API for a connection.
const pageSize = 100;

// Open PRs are ordered oldest first so that pagination is stable: PRs created while we are
// paginating sort after the pages we have already read, rather than shifting them. The default
// ordering is left unspecified by the API, so it is given explicitly rather than assumed.
const pullRequestsQuery = `query pullRequests($owner: String!, $repository: String!, $pageSize: Int!, $after: String) {
  repository(owner: $owner, name: $repository) {
    openPullRequests: pullRequests(
      first: $pageSize
      after: $after
      states: [OPEN]
      orderBy: { field: CREATED_AT, direction: ASC }
    ) {
      nodes {
        number
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    lastPullRequest: pullRequests(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number
      }
    }
  }
}`;

export async function getPullRequestNumbers({ token, owner, repository }: GithubConfig): Promise<PullRequestNumbers> {
  const githubClient = github.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  const openPRs = new Set<number>();
  let lastPR: number | undefined;
  let after: string | null = null;
  for (;;) {
    const response: PullRequestsResponse = await githubClient<PullRequestsResponse>(pullRequestsQuery, {
      owner,
      repository,
      pageSize,
      after,
    });
    const { openPullRequests, lastPullRequest } = response.repository;
    for (const node of openPullRequests.nodes) {
      openPRs.add(node.number);
    }
    // Take the last PR number from the first page, before enumerating the rest of the open PRs.
    // Any PR opened while we paginate is therefore numbered above lastPR, so callers treat it as
    // active even if it is missed by the enumeration, and its environment is left alone.
    lastPR ??= lastPullRequest.nodes[0]?.number;
    const { hasNextPage, endCursor } = openPullRequests.pageInfo;
    if (!hasNextPage || !endCursor) {
      break;
    }
    after = endCursor;
  }

  if (lastPR == null) {
    throw new Error(`Repository ${owner}/${repository} has no pull requests`);
  }

  return { openPRs: [...openPRs].sort((a, b) => a - b), lastPR };
}
