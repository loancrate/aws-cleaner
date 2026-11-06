import type { Configuration } from "./config.js";
import type { PullRequestNumbers } from "./github.js";
import { matchPatterns } from "./matchPatterns.js";
import type { TerraformWorkspace } from "./tfe.js";

export type EnvironmentPatterns = Pick<
  Configuration,
  "protectedEnvironments" | "targetEnvironments" | "pullRequestEnvironments"
>;

export type EnvironmentFilter = (env: string) => boolean;

/** Extracts the environment from a resource name, checking protected patterns first. */
export function getEnvironmentFromName(name: string, patterns: EnvironmentPatterns): string | undefined {
  return (
    matchPatterns(name, patterns.protectedEnvironments) ??
    matchPatterns(name, patterns.targetEnvironments) ??
    matchPatterns(name, patterns.pullRequestEnvironments)
  );
}

/** Extracts the PR number from the first capture group of the matching PR environment pattern. */
export function getPRNumberFromEnvironment(env: string, patterns: EnvironmentPatterns): number | undefined {
  const n = matchPatterns(env, patterns.pullRequestEnvironments, 1);
  return n != null ? parseInt(n) : undefined;
}

/**
 * Returns a filter that accepts environments to delete: never protected environments, always target
 * environments, and PR environments only for closed PRs. PR environments are kept when PR numbers are
 * unknown, and for PRs newer than the last PR seen, since they may have opened after the PRs were fetched.
 */
export function makeEnvironmentFilter(
  patterns: EnvironmentPatterns,
  prNumbers: PullRequestNumbers | undefined,
): EnvironmentFilter {
  return (env) => {
    if (matchPatterns(env, patterns.protectedEnvironments)) {
      return false;
    }
    if (matchPatterns(env, patterns.targetEnvironments)) {
      return true;
    }
    if (prNumbers && matchPatterns(env, patterns.pullRequestEnvironments)) {
      const pr = getPRNumberFromEnvironment(env, patterns);
      return pr != null && pr <= prNumbers.lastPR && !prNumbers.openPRs.includes(pr);
    }
    return false;
  };
}

/** Narrows a filter to skip environments still managed by one of the given Terraform workspaces. */
export function skipWorkspaceEnvironments(
  filter: EnvironmentFilter,
  workspaces: TerraformWorkspace[] | undefined,
): EnvironmentFilter {
  return (env) => filter(env) && !workspaces?.some((ws) => ws.name.includes(env));
}
