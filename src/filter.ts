import { PullRequestNumbers } from "./github";
import { TerraformWorkspace } from "./tfe";

export function getEnvironmentFromName(name: string): string | undefined {
  const match = /\b(pr-\d+|production|staging|review)\b/i.exec(name);
  return match ? match[1] : undefined;
}

export type EnvironmentFilter = (env: string) => boolean;

export function getClosedPREnvironmentFilter(
  prNumbers: PullRequestNumbers,
  workspaces: TerraformWorkspace[]
): EnvironmentFilter {
  const { openPRs, lastPR } = prNumbers;
  return (env: string): boolean => {
    const match = /^pr-(\d+)$/i.exec(env);
    if (match) {
      const number = parseInt(match[1]);
      return number <= lastPR && !openPRs.includes(number) && !workspaces.some((ws) => ws.name.includes(env));
    }
    return false;
  };
}
