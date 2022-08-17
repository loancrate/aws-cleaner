import { PullRequestNumbers } from "./github";
import { TerraformWorkspace } from "./tfe";

export function getEnvironmentFromName(name: string): string | undefined {
  const match = /\b(pr-\d+|production|staging|review)\b/i.exec(name);
  return match ? match[1] : undefined;
}

export function getPRNumberFromEnvironment(env: string): number | undefined {
  const match = /^pr-(\d+)$/i.exec(env);
  if (match) {
    return parseInt(match[1]);
  }
}

export type EnvironmentFilter = (env: string) => boolean;

export function getClosedPREnvironmentFilter(
  prNumbers: PullRequestNumbers,
  workspaces?: TerraformWorkspace[]
): EnvironmentFilter {
  const { openPRs, lastPR } = prNumbers;
  return (env: string): boolean => {
    const pr = getPRNumberFromEnvironment(env);
    return pr != null && pr <= lastPR && !openPRs.includes(pr) && !workspaces?.some((ws) => ws.name.includes(env));
  };
}
