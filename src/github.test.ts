import { beforeEach, expect, test, vi } from "vitest";

interface QueryVariables {
  owner: string;
  repository: string;
  pageSize: number;
  after: string | null;
}

const request = vi.fn<(query: string, variables: QueryVariables) => Promise<unknown>>();

vi.mock("@octokit/graphql", () => ({
  graphql: { defaults: () => request },
}));

const { getPullRequestNumbers } = await import("./github.js");

const config = { token: "token", owner: "owner", repository: "repository" };

interface Page {
  numbers: number[];
  endCursor?: string;
  lastPR: number;
}

function mockPages(pages: Page[]): void {
  request.mockReset();
  for (const { numbers, endCursor, lastPR } of pages) {
    request.mockResolvedValueOnce({
      repository: {
        openPullRequests: {
          nodes: numbers.map((number) => ({ number })),
          pageInfo: { hasNextPage: endCursor != null, endCursor: endCursor ?? null },
        },
        lastPullRequest: { nodes: [{ number: lastPR }] },
      },
    });
  }
}

beforeEach(() => {
  request.mockReset();
});

test("returns the open PRs from a single page", async () => {
  mockPages([{ numbers: [1, 2, 3], lastPR: 5 }]);
  await expect(getPullRequestNumbers(config)).resolves.toEqual({ openPRs: [1, 2, 3], lastPR: 5 });
  expect(request).toHaveBeenCalledTimes(1);
});

test("enumerates open PRs across all pages", async () => {
  mockPages([
    { numbers: [1, 2], endCursor: "a", lastPR: 500 },
    { numbers: [3, 4], endCursor: "b", lastPR: 500 },
    { numbers: [5, 6], lastPR: 500 },
  ]);
  await expect(getPullRequestNumbers(config)).resolves.toEqual({ openPRs: [1, 2, 3, 4, 5, 6], lastPR: 500 });
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.map(([, variables]) => variables.after)).toEqual([null, "a", "b"]);
  for (const [, variables] of request.mock.calls) {
    expect(variables).toMatchObject({ owner: "owner", repository: "repository", pageSize: 100 });
  }
});

test("requests open PRs oldest first", async () => {
  mockPages([{ numbers: [1], lastPR: 1 }]);
  await getPullRequestNumbers(config);
  const [query] = request.mock.calls[0];
  expect(query).toMatch(/states: \[OPEN\][\s\S]*orderBy: \{ field: CREATED_AT, direction: ASC \}/);
});

test("takes the last PR number from the first page", async () => {
  // A PR opened while paginating raises the last PR number reported by later pages. Keeping the
  // number from the first page leaves that PR above lastPR, so its environment is not destroyed.
  mockPages([
    { numbers: [1, 2], endCursor: "a", lastPR: 10 },
    { numbers: [3], lastPR: 11 },
  ]);
  await expect(getPullRequestNumbers(config)).resolves.toEqual({ openPRs: [1, 2, 3], lastPR: 10 });
});

test("deduplicates PRs repeated across pages", async () => {
  mockPages([
    { numbers: [1, 2], endCursor: "a", lastPR: 3 },
    { numbers: [2, 3], lastPR: 3 },
  ]);
  await expect(getPullRequestNumbers(config)).resolves.toEqual({ openPRs: [1, 2, 3], lastPR: 3 });
});

test("stops paginating when there is no end cursor", async () => {
  request.mockResolvedValueOnce({
    repository: {
      openPullRequests: {
        nodes: [{ number: 1 }],
        pageInfo: { hasNextPage: true, endCursor: null },
      },
      lastPullRequest: { nodes: [{ number: 1 }] },
    },
  });
  await expect(getPullRequestNumbers(config)).resolves.toEqual({ openPRs: [1], lastPR: 1 });
  expect(request).toHaveBeenCalledTimes(1);
});

test("throws when the repository has no PRs", async () => {
  request.mockResolvedValueOnce({
    repository: {
      openPullRequests: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      lastPullRequest: { nodes: [] },
    },
  });
  await expect(getPullRequestNumbers(config)).rejects.toThrow("owner/repository has no pull requests");
});
